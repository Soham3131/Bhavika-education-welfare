import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { getStoreDb } from "../db/connect";
import {
  getStoreRechargeOrderModel,
  IStoreRechargeOrderDoc,
  RechargeServiceType,
  RechargeStatus,
  RechargeCommissionStatus,
} from "../models/StoreRechargeOrder";
import { getStoreMemberModel } from "../models/StoreMember";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { getRechargeProvider } from "./recharge-provider";
import {
  findA1Operator,
  resolveA1CircleCode,
} from "./a1topup-mapping";
import { DomainError } from "@/server/errors";

export interface SubmitRechargeInput {
  memberId: string | Types.ObjectId;
  serviceType: RechargeServiceType;
  operator: string;
  consumerNumber: string;
  circle?: string | null;
  amountPaise: number;
  value1?: string | null;
  value2?: string | null;
}

export function generateRechargeRef(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-RCH-${year}-${random}`;
}

/**
 * Calculates member recharge commission as a strict percentage of provider payout.
 * Free tier: 40% capped at ₹2.00 (200 paise)
 * Area tier: 60% of provider payout
 * Chief tier: 80% of provider payout
 * NEVER a flat amount that exceeds revenue.
 */
export function calculateRechargeCommission(
  tier: string,
  providerPayoutPaise: number,
): number {
  if (providerPayoutPaise <= 0) return 0;

  switch (tier) {
    case "CHIEF":
      return Math.floor(providerPayoutPaise * 0.8);
    case "AREA":
      return Math.floor(providerPayoutPaise * 0.6);
    case "FREE":
    default:
      // 40% capped at ₹2 (200 paise)
      return Math.min(200, Math.floor(providerPayoutPaise * 0.4));
  }
}

/**
 * Submits a recharge order:
 * 1. Debits member's wallet for principal amount.
 * 2. Calls provider adapter.
 * 3. If SUCCESS: credits commission to recharge wallet immediately.
 * 4. If PENDING: leaves commission at 0 awaiting async reconciliation.
 * 5. If FAILED: refunds debited principal immediately.
 */
export async function submitRechargeOrder(
  input: SubmitRechargeInput,
): Promise<{
  order: IStoreRechargeOrderDoc;
  status: RechargeStatus;
  memberCommissionPaise: number;
}> {
  if (input.amountPaise < 100) {
    throw new DomainError("Minimum recharge amount is ₹1.00", 400, "INVALID_AMOUNT");
  }

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const db = await getStoreDb();
  const MemberModel = getStoreMemberModel(db);
  const RechargeOrderModel = getStoreRechargeOrderModel(db);

  const member = await MemberModel.findById(memberObjectId);
  if (!member) {
    throw new DomainError("Member not found.", 404, "MEMBER_NOT_FOUND");
  }

  const configStatus = getRechargeProviderConfigStatus();
  if (process.env.NODE_ENV === "production" && !configStatus.canExecuteLive) {
    throw new DomainError(
      "Recharge services are currently offline: production telecom aggregator credentials and merchant wallet funding have not been configured.",
      503,
      "RECHARGE_PROVIDER_NOT_CONFIGURED",
    );
  }

  const rechargeRef = generateRechargeRef();
  const provider = getRechargeProvider();

  // 1. Debit member wallet for principal recharge amount
  try {
    await mutateStoreWallet({
      memberId: memberObjectId,
      walletType: "ADD_MONEY",
      type: "DEBIT",
      unit: "INR_PAISE",
      amountPaise: input.amountPaise,
      referenceType: "RECHARGE_SUBMISSION",
      referenceId: rechargeRef,
      idempotencyKey: `rch-debit:${rechargeRef}`,
      description: `Payment for ${input.serviceType} recharge to ${input.consumerNumber} (${input.operator})`,
    });
  } catch (err) {
    throw new DomainError(
      err instanceof Error ? err.message : "Insufficient wallet balance for recharge.",
      400,
      "INSUFFICIENT_FUNDS",
    );
  }

  const matchedOp = findA1Operator(input.operator);
  const operatorCode = matchedOp?.code || input.operator.toUpperCase();
  const circleCode = resolveA1CircleCode(input.circle);

  // 2. Create pending order document
  const order = new RechargeOrderModel({
    rechargeRef,
    member: memberObjectId,
    serviceType: input.serviceType,
    operator: input.operator.toUpperCase(),
    operatorCode,
    consumerNumber: input.consumerNumber.trim(),
    circle: input.circle ? input.circle.toUpperCase() : null,
    circleCode,
    value1: input.value1 ? input.value1.trim() : null,
    value2: input.value2 ? input.value2.trim() : null,
    amountPaise: input.amountPaise,
    status: RechargeStatus.SUBMITTED_TO_PROVIDER,
    providerName: provider.name,
    paymentMethod: "WALLET",
  });
  await order.save();

  // 3. Dispatch to Provider Seam
  const providerResult = await provider.submitRecharge({
    rechargeRef,
    serviceType: input.serviceType,
    operator: input.operator,
    consumerNumber: input.consumerNumber,
    circle: input.circle,
    amountPaise: input.amountPaise,
    value1: input.value1,
    value2: input.value2,
  });

  order.providerRef = providerResult.providerRef;
  order.operatorRef = providerResult.operatorRef || null;
  order.providerPayoutPaise = providerResult.providerPayoutPaise;
  order.apiResponse = providerResult.rawResponse || null;

  if (providerResult.status === "SUCCESS") {
    // 4. Immediate Success: Credit member commission
    const commission = calculateRechargeCommission(
      member.tier,
      providerResult.providerPayoutPaise,
    );

    order.status = RechargeStatus.SUCCESS;
    order.memberCommissionPaise = commission;
    order.commissionStatus = RechargeCommissionStatus.CREDITED;
    await order.save();

    if (commission > 0) {
      await mutateStoreWallet({
        memberId: memberObjectId,
        walletType: "RECHARGE",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: commission,
        referenceType: "REFERRAL_COMMISSION",
        referenceId: rechargeRef,
        idempotencyKey: `rch-comm:${rechargeRef}`,
        description: `Recharge commission for successful ${input.serviceType} recharge`,
      });
    }

    return {
      order,
      status: RechargeStatus.SUCCESS,
      memberCommissionPaise: commission,
    };
  }

  if (providerResult.status === "PENDING") {
    // 5. Asynchronous Pending: Await reconciliation
    order.status = RechargeStatus.PENDING_CONFIRMATION;
    order.commissionStatus = RechargeCommissionStatus.NONE;
    order.memberCommissionPaise = 0;
    await order.save();

    return {
      order,
      status: RechargeStatus.PENDING_CONFIRMATION,
      memberCommissionPaise: 0,
    };
  }

  // 6. Provider Rejected / Failed: Immediate refund of principal
  order.status = RechargeStatus.FAILED;
  order.failureReason = providerResult.failureReason || "Provider rejected recharge.";
  order.commissionStatus = RechargeCommissionStatus.NONE;
  order.memberCommissionPaise = 0;
  await order.save();

  await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "ADD_MONEY",
    type: "CREDIT",
    unit: "INR_PAISE",
    amountPaise: input.amountPaise,
    referenceType: "RECHARGE_REVERSAL",
    referenceId: rechargeRef,
    idempotencyKey: `rch-refund:${rechargeRef}`,
    description: `Refund for failed ${input.serviceType} recharge to ${input.consumerNumber}`,
  });

  return {
    order,
    status: RechargeStatus.FAILED,
    memberCommissionPaise: 0,
  };
}

/**
 * Reconciles all pending recharges against provider status.
 * Reconciles PENDING -> SUCCESS (credits commission) or PENDING -> FAILED (refunds principal).
 */
export async function reconcilePendingRecharges(): Promise<{
  reconciledCount: number;
  successCount: number;
  failureCount: number;
}> {
  const db = await getStoreDb();
  const RechargeOrderModel = getStoreRechargeOrderModel(db);
  const MemberModel = getStoreMemberModel(db);
  const provider = getRechargeProvider();

  const pendingOrders = await RechargeOrderModel.find({
    status: RechargeStatus.PENDING_CONFIRMATION,
    providerRef: { $ne: null },
  });

  let successCount = 0;
  let failureCount = 0;

  for (const order of pendingOrders) {
    if (!order.providerRef) continue;

    const checkRes = await provider.checkStatus(order.providerRef);

    if (checkRes.status === "SUCCESS") {
      const member = await MemberModel.findById(order.member);
      const commission = calculateRechargeCommission(
        member?.tier || "FREE",
        checkRes.providerPayoutPaise || order.providerPayoutPaise,
      );

      order.status = RechargeStatus.SUCCESS;
      order.memberCommissionPaise = commission;
      order.commissionStatus = RechargeCommissionStatus.CREDITED;
      order.reconciledAt = new Date();
      await order.save();

      if (commission > 0) {
        await mutateStoreWallet({
          memberId: order.member,
          walletType: "RECHARGE",
          type: "CREDIT",
          unit: "INR_PAISE",
          amountPaise: commission,
          referenceType: "REFERRAL_COMMISSION",
          referenceId: order.rechargeRef,
          idempotencyKey: `rch-comm:${order.rechargeRef}`,
          description: `Reconciled commission for ${order.serviceType} recharge`,
        });
      }

      successCount++;
    } else if (checkRes.status === "FAILED") {
      order.status = RechargeStatus.FAILED;
      order.failureReason = checkRes.failureReason || "Reconciliation confirmed failure.";
      order.reconciledAt = new Date();
      await order.save();

      // Refund principal amount to member
      await mutateStoreWallet({
        memberId: order.member,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: order.amountPaise,
        referenceType: "RECHARGE_REVERSAL",
        referenceId: order.rechargeRef,
        idempotencyKey: `rch-refund:${order.rechargeRef}`,
        description: `Refund for failed ${order.serviceType} recharge (after reconciliation)`,
      });

      failureCount++;
    }
  }

  return {
    reconciledCount: successCount + failureCount,
    successCount,
    failureCount,
  };
}

/**
 * Reverses a previously successful recharge (e.g. provider late chargeback or reversal).
 * Strictly reverses any paid commission through compensating ledger entry and refunds member.
 */
export async function reverseRechargeOrder(input: {
  rechargeRef: string;
  reason: string;
}): Promise<IStoreRechargeOrderDoc> {
  const db = await getStoreDb();
  const RechargeOrderModel = getStoreRechargeOrderModel(db);

  const order = await RechargeOrderModel.findOne({ rechargeRef: input.rechargeRef });
  if (!order) {
    throw new DomainError("Recharge order not found.", 404, "ORDER_NOT_FOUND");
  }

  if (order.status === RechargeStatus.REVERSED) {
    return order;
  }

  // 1. If commission was credited, reverse it via compensating debit
  if (
    order.commissionStatus === RechargeCommissionStatus.CREDITED &&
    order.memberCommissionPaise > 0
  ) {
    await mutateStoreWallet({
      memberId: order.member,
      walletType: "RECHARGE",
      type: "DEBIT",
      unit: "INR_PAISE",
      amountPaise: order.memberCommissionPaise,
      referenceType: "RECHARGE_REVERSAL",
      referenceId: order.rechargeRef,
      idempotencyKey: `rch-comm-rev:${order.rechargeRef}`,
      description: `Reversal of recharge commission: ${input.reason}`,
    });
    order.commissionStatus = RechargeCommissionStatus.REVERSED;
  }

  // 2. Refund principal amount back to member
  await mutateStoreWallet({
    memberId: order.member,
    walletType: "ADD_MONEY",
    type: "CREDIT",
    unit: "INR_PAISE",
    amountPaise: order.amountPaise,
    referenceType: "RECHARGE_REVERSAL",
    referenceId: order.rechargeRef,
    idempotencyKey: `rch-rev-refund:${order.rechargeRef}`,
    description: `Principal refund for reversed recharge: ${input.reason}`,
  });

  order.status = RechargeStatus.REVERSED;
  order.failureReason = input.reason;
  order.reconciledAt = new Date();
  await order.save();

  return order;
}

export async function listMemberRecharges(
  memberId: string | Types.ObjectId,
): Promise<IStoreRechargeOrderDoc[]> {
  const db = await getStoreDb();
  const RechargeOrderModel = getStoreRechargeOrderModel(db);
  const memberObjectId =
    typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;

  return RechargeOrderModel.find({ member: memberObjectId })
    .sort({ createdAt: -1 })
    .lean() as unknown as IStoreRechargeOrderDoc[];
}

export async function listAllRecharges(query: {
  status?: RechargeStatus;
  serviceType?: RechargeServiceType;
  limit?: number;
  skip?: number;
}): Promise<{ recharges: IStoreRechargeOrderDoc[]; total: number }> {
  const db = await getStoreDb();
  const RechargeOrderModel = getStoreRechargeOrderModel(db);

  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.serviceType) filter.serviceType = query.serviceType;

  const limit = Math.min(query.limit ?? 50, 100);
  const skip = query.skip ?? 0;

  const [recharges, total] = await Promise.all([
    RechargeOrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("member", "name phone memberId")
      .lean() as unknown as IStoreRechargeOrderDoc[],
    RechargeOrderModel.countDocuments(filter),
  ]);

  return { recharges, total };
}

/**
 * Returns configuration readiness status of telecom recharge services.
 */
export function getRechargeProviderConfigStatus(): {
  isConfigured: boolean;
  providerName: string;
  isMock: boolean;
  canExecuteLive: boolean;
  message: string;
} {
  const isProd = process.env.NODE_ENV === "production";
  const hasA1Topup = !!process.env.A1TOPUP_PASSWORD;
  const hasTelecomAggregator = !!(
    process.env.TELECOM_AGGREGATOR_API_KEY &&
    process.env.TELECOM_AGGREGATOR_SECRET
  );
  const hasCredentials = hasA1Topup || hasTelecomAggregator;

  if (isProd && !hasCredentials) {
    return {
      isConfigured: false,
      providerName: "A1TOPUP",
      isMock: false,
      canExecuteLive: false,
      message:
        "Production telecom aggregator credentials (A1TOPUP_PASSWORD) are not configured. Live recharge processing is offline.",
    };
  }

  const providerName = hasA1Topup
    ? "A1TOPUP"
    : hasTelecomAggregator
    ? "PRODUCTION_AGGREGATOR"
    : "MOCK_PROVIDER";

  return {
    isConfigured: true,
    providerName,
    isMock: !hasCredentials,
    canExecuteLive: hasCredentials,
    message: hasCredentials
      ? `${providerName} active and configured.`
      : "Staging/Development mock provider active. Prohibited in production.",
  };
}

/**
 * Handles asynchronous status webhook / callback notifications from telecom providers with strict duplicate protection
 * and Status API verification prior to ledger mutation.
 */
export async function handleRechargeWebhookCallback(input: {
  providerRef?: string;
  orderId?: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  failureReason?: string;
  providerPayoutPaise?: number;
  operatorRef?: string;
  reconcileWithStatusApi?: boolean;
}): Promise<{
  processed: boolean;
  isDuplicate: boolean;
  order: IStoreRechargeOrderDoc | null;
  message: string;
}> {
  const db = await getStoreDb();
  const RechargeOrderModel = getStoreRechargeOrderModel(db);
  const MemberModel = getStoreMemberModel(db);

  // Ambiguity resolution: check both orderId and providerRef
  let order: IStoreRechargeOrderDoc | null = null;
  if (input.orderId) {
    order = await RechargeOrderModel.findOne({ rechargeRef: input.orderId });
  }
  if (!order && input.providerRef) {
    if (input.providerRef.startsWith("JMD-RCH-")) {
      order = await RechargeOrderModel.findOne({ rechargeRef: input.providerRef });
    } else {
      order = await RechargeOrderModel.findOne({ providerRef: input.providerRef });
    }
  }

  if (!order) {
    return {
      processed: false,
      isDuplicate: false,
      order: null,
      message: "Recharge order not found for provider reference or order ID.",
    };
  }

  // Duplicate callback idempotency check
  if (
    order.status === RechargeStatus.SUCCESS ||
    order.status === RechargeStatus.FAILED ||
    order.status === RechargeStatus.REVERSED
  ) {
    return {
      processed: false,
      isDuplicate: true,
      order,
      message: `Callback ignored: order already finalized with status '${order.status}'.`,
    };
  }

  let finalStatus = input.status;
  let finalFailureReason = input.failureReason;
  let finalPayoutPaise = input.providerPayoutPaise;
  let finalOperatorRef = input.operatorRef;

  // Reconcile through Status API if requested (e.g. for unauthenticated GET/POST callbacks)
  if (input.reconcileWithStatusApi) {
    const provider = getRechargeProvider();
    const statusResult = await provider.checkStatus(order.rechargeRef);

    if (statusResult.status === "PENDING") {
      return {
        processed: false,
        isDuplicate: false,
        order,
        message: "Status API returned PENDING. Financial ledger untouched awaiting final settlement.",
      };
    }

    finalStatus = statusResult.status as "SUCCESS" | "FAILED";
    if (statusResult.failureReason) finalFailureReason = statusResult.failureReason;
    if (statusResult.providerPayoutPaise) finalPayoutPaise = statusResult.providerPayoutPaise;
    if (statusResult.operatorRef) finalOperatorRef = statusResult.operatorRef;
  }

  if (finalStatus === "SUCCESS") {
    const member = await MemberModel.findById(order.member);
    const payout = finalPayoutPaise ?? order.providerPayoutPaise;
    const commission = calculateRechargeCommission(
      member?.tier || "FREE",
      payout,
    );

    order.status = RechargeStatus.SUCCESS;
    order.memberCommissionPaise = commission;
    order.commissionStatus = RechargeCommissionStatus.CREDITED;
    if (finalOperatorRef) order.operatorRef = finalOperatorRef;
    order.reconciledAt = new Date();
    await order.save();

    if (commission > 0) {
      await mutateStoreWallet({
        memberId: order.member,
        walletType: "RECHARGE",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: commission,
        referenceType: "REFERRAL_COMMISSION",
        referenceId: order.rechargeRef,
        idempotencyKey: `rch-comm-cb:${order.rechargeRef}`,
        description: `Callback confirmed commission for ${order.serviceType} recharge`,
      });
    }

    return {
      processed: true,
      isDuplicate: false,
      order,
      message: "Order successfully marked SUCCESS and commission credited.",
    };
  } else if (finalStatus === "FAILED") {
    order.status = RechargeStatus.FAILED;
    order.failureReason =
      finalFailureReason || "Provider callback reported failure.";
    if (finalOperatorRef) order.operatorRef = finalOperatorRef;
    order.reconciledAt = new Date();
    await order.save();

    // Refund principal amount to member
    await mutateStoreWallet({
      memberId: order.member,
      walletType: "ADD_MONEY",
      type: "CREDIT",
      unit: "INR_PAISE",
      amountPaise: order.amountPaise,
      referenceType: "RECHARGE_REVERSAL",
      referenceId: order.rechargeRef,
      idempotencyKey: `rch-refund-cb:${order.rechargeRef}`,
      description: `Refund for failed ${order.serviceType} recharge (via provider callback)`,
    });

    return {
      processed: true,
      isDuplicate: false,
      order,
      message: "Order marked FAILED and principal amount refunded to member.",
    };
  }

  return {
    processed: false,
    isDuplicate: false,
    order,
    message: "No action taken for PENDING callback notification.",
  };
}
