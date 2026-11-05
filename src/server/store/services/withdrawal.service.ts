import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { getStoreDb, withStoreTransaction } from "../db/connect";
import {
  getStoreWithdrawalRequestModel,
  IStoreWithdrawalRequestDoc,
  WithdrawalStatus,
} from "../models/StoreWithdrawalRequest";
import { getStoreWalletModel } from "../models/StoreWallet";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { AdminAuditLog } from "@/server/models";
import { DomainError } from "@/server/errors";

export const MIN_WITHDRAWAL_PAISE = 200_00; // ₹200.00
export const MAX_WITHDRAWAL_PAISE = 50000_00; // ₹50,000.00

export const WITHDRAWABLE_WALLETS = ["FREE_REFERRAL", "PAID_REFERRAL"] as const;
export type WithdrawableWalletType = (typeof WITHDRAWABLE_WALLETS)[number];

export interface RequestWithdrawalInput {
  memberId: string | Types.ObjectId;
  walletType: WithdrawableWalletType;
  amountPaise: number;
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  };
  idempotencyKey: string;
}

export function generateWithdrawalRef(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-WDR-${year}-${random}`;
}

export function validateIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
}

export function validateAccountNumber(accNum: string): boolean {
  return /^\d{8,20}$/.test(accNum.trim());
}

export function maskAccountNumber(accNum: string): string {
  const clean = (accNum || "").trim();
  if (clean.length <= 4) return "****";
  return `****${clean.slice(-4)}`;
}

/**
 * Creates a withdrawal request atomically:
 * 1. Validates wallet eligibility (only FREE_REFERRAL or PAID_REFERRAL).
 * 2. Validates amount limits (min ₹200, max ₹50,000).
 * 3. Validates bank details (IFSC, Account Number).
 * 4. Checks for duplicate active pending requests inside transaction session.
 * 5. Atomically debits the member's wallet into hold via mutateStoreWallet.
 * 6. Persists the withdrawal request guarded by the unique_active_withdrawal_per_member index.
 */
export async function requestWithdrawal(
  input: RequestWithdrawalInput,
): Promise<{
  request: IStoreWithdrawalRequestDoc;
  isReplay: boolean;
}> {
  if (!WITHDRAWABLE_WALLETS.includes(input.walletType)) {
    throw new DomainError(
      `Wallet type '${input.walletType}' is not eligible for bank withdrawal. Only referral cash balances can be withdrawn.`,
      400,
      "WALLET_NOT_WITHDRAWABLE",
    );
  }

  if (
    input.amountPaise < MIN_WITHDRAWAL_PAISE ||
    input.amountPaise > MAX_WITHDRAWAL_PAISE
  ) {
    throw new DomainError(
      `Withdrawal amount must be between ₹${MIN_WITHDRAWAL_PAISE / 100} and ₹${MAX_WITHDRAWAL_PAISE / 100}.`,
      400,
      "INVALID_WITHDRAWAL_AMOUNT",
    );
  }

  const cleanHolder = input.bankDetails.accountHolderName.trim();
  const cleanAccNum = input.bankDetails.accountNumber.trim();
  const cleanIfsc = input.bankDetails.ifscCode.trim().toUpperCase();
  const cleanBank = input.bankDetails.bankName.trim();

  if (cleanHolder.length < 2) {
    throw new DomainError(
      "Account holder name must be at least 2 characters.",
      400,
      "INVALID_BANK_DETAILS",
    );
  }

  if (!validateAccountNumber(cleanAccNum)) {
    throw new DomainError(
      "Invalid bank account number. Must be between 8 and 20 digits.",
      400,
      "INVALID_ACCOUNT_NUMBER",
    );
  }

  if (!validateIfsc(cleanIfsc)) {
    throw new DomainError(
      "Invalid IFSC code. Format must be 4 letters, followed by 0, followed by 6 alphanumeric characters.",
      400,
      "INVALID_IFSC_CODE",
    );
  }

  if (cleanBank.length < 2) {
    throw new DomainError(
      "Bank name must be provided.",
      400,
      "INVALID_BANK_DETAILS",
    );
  }

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const db = await getStoreDb();
  const WithdrawalModel = getStoreWithdrawalRequestModel(db);

  try {
    return await withStoreTransaction(async (session, conn) => {
      const TxWithdrawalModel = getStoreWithdrawalRequestModel(conn);

      // 1. Idempotency check inside session
      const existingWithKey = await TxWithdrawalModel.findOne({
        idempotencyKey: input.idempotencyKey,
      }).session(session);
      if (existingWithKey) {
        return { request: existingWithKey, isReplay: true };
      }

      // 2. Prevent multiple pending/active requests concurrently
      const pendingCount = await TxWithdrawalModel.countDocuments({
        member: memberObjectId,
        status: {
          $in: [
            WithdrawalStatus.REQUESTED,
            WithdrawalStatus.APPROVED,
            WithdrawalStatus.PROCESSING,
          ],
        },
      }).session(session);

      if (pendingCount > 0) {
        throw new DomainError(
          "You already have an active withdrawal request in review. Please wait for it to be processed.",
          409,
          "PENDING_WITHDRAWAL_EXISTS",
        );
      }

      // 3. Check balance before debit
      const WalletModel = getStoreWalletModel(conn);
      const wallet = await WalletModel.findOne({ member: memberObjectId }).session(session);
      const balancePaise =
        input.walletType === "FREE_REFERRAL"
          ? wallet?.freeReferralPaise ?? 0
          : wallet?.paidReferralPaise ?? 0;

      if (balancePaise < input.amountPaise) {
        throw new DomainError(
          `Insufficient withdrawable balance. Available: ₹${(balancePaise / 100).toFixed(2)}, Requested: ₹${(input.amountPaise / 100).toFixed(2)}.`,
          400,
          "INSUFFICIENT_FUNDS",
        );
      }

      const withdrawalRef = generateWithdrawalRef();

      // 4. Atomically debit member's wallet into hold within session
      await mutateStoreWallet({
        memberId: memberObjectId,
        walletType: input.walletType,
        type: "DEBIT",
        unit: "INR_PAISE",
        amountPaise: input.amountPaise,
        referenceType: "BANK_PAYOUT",
        referenceId: withdrawalRef,
        idempotencyKey: input.idempotencyKey,
        description: `Withdrawal request ${withdrawalRef} placed on hold pending admin review`,
        session,
        metadata: {
          withdrawalRef,
          walletType: input.walletType,
          bankAccountMasked: maskAccountNumber(cleanAccNum),
          ifsc: cleanIfsc,
        },
      });

      // 5. Create withdrawal request doc; unique_active_withdrawal_per_member guarantees atomicity
      const [request] = await TxWithdrawalModel.create(
        [
          {
            withdrawalRef,
            member: memberObjectId,
            walletType: input.walletType,
            amountPaise: input.amountPaise,
            status: WithdrawalStatus.REQUESTED,
            bankDetails: {
              accountHolderName: cleanHolder,
              accountNumber: cleanAccNum,
              ifscCode: cleanIfsc,
              bankName: cleanBank,
            },
            idempotencyKey: input.idempotencyKey,
          },
        ],
        { session },
      );

      return { request, isReplay: false };
    });
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (
      error?.code === 11000 ||
      error?.message?.includes("E11000") ||
      error?.message?.includes("unique_active_withdrawal_per_member")
    ) {
      if (
        error?.message?.includes("unique_active_withdrawal_per_member") ||
        !error?.message?.includes("idempotencyKey")
      ) {
        throw new DomainError(
          "You already have an active withdrawal request in review. Please wait for it to be processed.",
          409,
          "PENDING_WITHDRAWAL_EXISTS",
        );
      }
      const existing = await WithdrawalModel.findOne({
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        return { request: existing, isReplay: true };
      }
    }
    throw err;
  }
}

/**
 * Admin approves a requested withdrawal.
 */
export async function approveWithdrawal(params: {
  withdrawalId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  notes?: string;
}): Promise<IStoreWithdrawalRequestDoc> {
  const db = await getStoreDb();
  const WithdrawalModel = getStoreWithdrawalRequestModel(db);

  const request = await WithdrawalModel.findById(params.withdrawalId);
  if (!request) {
    throw new DomainError("Withdrawal request not found.", 404, "WITHDRAWAL_NOT_FOUND");
  }

  if (request.status !== WithdrawalStatus.REQUESTED) {
    throw new DomainError(
      `Cannot approve withdrawal with status '${request.status}'. Must be 'REQUESTED'.`,
      400,
      "INVALID_STATUS_TRANSITION",
    );
  }

  const adminObjectId =
    typeof params.adminId === "string"
      ? new Types.ObjectId(params.adminId)
      : params.adminId;

  request.status = WithdrawalStatus.APPROVED;
  request.approvedBy = adminObjectId;
  request.approvedAt = new Date();
  if (params.notes) request.adminNotes = params.notes.trim();

  await request.save();

  await AdminAuditLog.create({
    admin: adminObjectId,
    action: "WITHDRAWAL_APPROVED",
    targetType: "STORE_WITHDRAWAL_REQUEST",
    targetId: request._id,
    meta: {
      withdrawalRef: request.withdrawalRef,
      amountPaise: request.amountPaise,
      member: request.member,
      notes: params.notes,
    },
  });

  return request;
}

/**
 * Admin marks an approved withdrawal as PROCESSING (queued for bank disbursement).
 */
export async function processWithdrawal(params: {
  withdrawalId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
}): Promise<IStoreWithdrawalRequestDoc> {
  const db = await getStoreDb();
  const WithdrawalModel = getStoreWithdrawalRequestModel(db);

  const request = await WithdrawalModel.findById(params.withdrawalId);
  if (!request) {
    throw new DomainError("Withdrawal request not found.", 404, "WITHDRAWAL_NOT_FOUND");
  }

  if (request.status !== WithdrawalStatus.APPROVED) {
    throw new DomainError(
      `Cannot move withdrawal to PROCESSING from '${request.status}'. Must be 'APPROVED'.`,
      400,
      "INVALID_STATUS_TRANSITION",
    );
  }

  const adminObjectId =
    typeof params.adminId === "string"
      ? new Types.ObjectId(params.adminId)
      : params.adminId;

  request.status = WithdrawalStatus.PROCESSING;
  request.processedAt = new Date();
  await request.save();

  await AdminAuditLog.create({
    admin: adminObjectId,
    action: "WITHDRAWAL_PROCESSING",
    targetType: "STORE_WITHDRAWAL_REQUEST",
    targetId: request._id,
    meta: {
      withdrawalRef: request.withdrawalRef,
      amountPaise: request.amountPaise,
    },
  });

  return request;
}

/**
 * Admin rejects a withdrawal request.
 * Automatically refunds the held funds back into the member's wallet via mutateStoreWallet.
 * Supports recovery from PROCESSING status if an external payout failed.
 * Wrapped in withStoreTransaction to ensure atomic refund and status update.
 */
export async function rejectWithdrawal(params: {
  withdrawalId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  rejectionReason: string;
}): Promise<IStoreWithdrawalRequestDoc> {
  const cleanReason = params.rejectionReason.trim();
  if (!cleanReason) {
    throw new DomainError("A rejection reason is strictly required.", 400, "REJECTION_REASON_REQUIRED");
  }

  const adminObjectId =
    typeof params.adminId === "string"
      ? new Types.ObjectId(params.adminId)
      : params.adminId;

  return withStoreTransaction(async (session, conn) => {
    const WithdrawalModel = getStoreWithdrawalRequestModel(conn);

    const request = await WithdrawalModel.findById(params.withdrawalId).session(session);
    if (!request) {
      throw new DomainError("Withdrawal request not found.", 404, "WITHDRAWAL_NOT_FOUND");
    }

    // Idempotent rejection: if already rejected, do not refund again
    if (request.status === WithdrawalStatus.REJECTED) {
      return request;
    }

    if (
      request.status !== WithdrawalStatus.REQUESTED &&
      request.status !== WithdrawalStatus.APPROVED &&
      request.status !== WithdrawalStatus.PROCESSING
    ) {
      throw new DomainError(
        `Cannot reject withdrawal with status '${request.status}'. Only REQUESTED, APPROVED, or PROCESSING requests can be rejected.`,
        400,
        "INVALID_STATUS_TRANSITION",
      );
    }

    // Refund the held funds back to member's wallet atomically
    await mutateStoreWallet({
      memberId: request.member,
      walletType: request.walletType,
      type: "CREDIT",
      unit: "INR_PAISE",
      amountPaise: request.amountPaise,
      referenceType: "ADMIN_CORRECTION",
      referenceId: `REFUND-${request.withdrawalRef}`,
      idempotencyKey: `refund:${request.withdrawalRef}`,
      description: `Refund for rejected withdrawal ${request.withdrawalRef}: ${cleanReason}`,
      session,
      metadata: {
        withdrawalRef: request.withdrawalRef,
        rejectedBy: adminObjectId,
        reason: cleanReason,
      },
    });

    request.status = WithdrawalStatus.REJECTED;
    request.rejectionReason = cleanReason;
    request.rejectedAt = new Date();
    await request.save({ session });

    await AdminAuditLog.create({
      admin: adminObjectId,
      action: "WITHDRAWAL_REJECTED",
      targetType: "STORE_WITHDRAWAL_REQUEST",
      targetId: request._id,
      meta: {
        withdrawalRef: request.withdrawalRef,
        amountPaise: request.amountPaise,
        rejectionReason: cleanReason,
        refunded: true,
      },
    });

    return request;
  });
}

/**
 * Confirms bank payout settlement.
 * STRICT SAFETY RULE: Requires an explicit external provider payout reference.
 * Prevents arbitrary marking as PAID without verified settlement.
 * Repeated calls with identical reference are idempotent.
 */
export async function confirmPayoutSettlement(params: {
  withdrawalId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  providerPayoutRef: string;
  payoutProvider?: string;
}): Promise<IStoreWithdrawalRequestDoc> {
  const cleanRef = params.providerPayoutRef.trim();
  if (!cleanRef) {
    throw new DomainError(
      "A valid external provider payout settlement reference (e.g. UTR / RazorpayX Payout ID) is strictly required.",
      400,
      "PROVIDER_PAYOUT_REF_REQUIRED",
    );
  }

  const adminObjectId =
    typeof params.adminId === "string"
      ? new Types.ObjectId(params.adminId)
      : params.adminId;

  return withStoreTransaction(async (session, conn) => {
    const WithdrawalModel = getStoreWithdrawalRequestModel(conn);

    const request = await WithdrawalModel.findById(params.withdrawalId).session(session);
    if (!request) {
      throw new DomainError("Withdrawal request not found.", 404, "WITHDRAWAL_NOT_FOUND");
    }

    // Repeated settlement requests cannot duplicate the result
    if (request.status === WithdrawalStatus.PAID) {
      if (request.providerPayoutRef === cleanRef) {
        return request; // Idempotent replay
      }
      throw new DomainError(
        `Withdrawal is already marked PAID under reference '${request.providerPayoutRef}'.`,
        409,
        "ALREADY_PAID",
      );
    }

    if (request.status !== WithdrawalStatus.PROCESSING) {
      throw new DomainError(
        `Cannot confirm payout for request in status '${request.status}'. Must be 'PROCESSING'.`,
        400,
        "INVALID_STATUS_TRANSITION",
      );
    }

    request.status = WithdrawalStatus.PAID;
    request.providerPayoutRef = cleanRef;
    request.payoutProvider = params.payoutProvider?.trim() || "BANK_NEFT_RTGS";
    request.paidAt = new Date();
    await request.save({ session });

    await AdminAuditLog.create({
      admin: adminObjectId,
      action: "WITHDRAWAL_PAID",
      targetType: "STORE_WITHDRAWAL_REQUEST",
      targetId: request._id,
      meta: {
        withdrawalRef: request.withdrawalRef,
        amountPaise: request.amountPaise,
        providerPayoutRef: cleanRef,
      },
    });

    return request;
  });
}

export interface SanitizedWithdrawal {
  _id: Types.ObjectId;
  member: Types.ObjectId;
  walletType: string;
  amountPaise: number;
  status: string;
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  };
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export async function listMemberWithdrawals(
  memberId: string | Types.ObjectId,
): Promise<SanitizedWithdrawal[]> {
  const db = await getStoreDb();
  const WithdrawalModel = getStoreWithdrawalRequestModel(db);
  const memberObjectId =
    typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;

  const docs = await WithdrawalModel.find({ member: memberObjectId }).sort({
    createdAt: -1,
  });

  return docs.map((doc) => {
    const raw = doc.toObject();
    return {
      ...raw,
      bankDetails: {
        ...raw.bankDetails,
        accountNumber: maskAccountNumber(raw.bankDetails?.accountNumber),
      },
    };
  });
}

export async function listAdminWithdrawals(filters?: {
  status?: WithdrawalStatus;
  limit?: number;
}): Promise<IStoreWithdrawalRequestDoc[]> {
  const db = await getStoreDb();
  const WithdrawalModel = getStoreWithdrawalRequestModel(db);

  const query: Record<string, unknown> = {};
  if (filters?.status) {
    query.status = filters.status;
  }

  return WithdrawalModel.find(query)
    .populate("member", "name phone memberId tier")
    .sort({ createdAt: -1 })
    .limit(filters?.limit ?? 100);
}
