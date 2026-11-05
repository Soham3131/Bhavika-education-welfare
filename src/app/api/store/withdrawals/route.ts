import { handle, ok } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  requestWithdrawal,
  listMemberWithdrawals,
  maskAccountNumber,
  WITHDRAWABLE_WALLETS,
  MIN_WITHDRAWAL_PAISE,
  MAX_WITHDRAWAL_PAISE,
} from "@/server/store/services/withdrawal.service";
import { getOrCreateStoreWallet } from "@/server/store/services/wallet-ledger.service";
import { z } from "zod";

export const runtime = "nodejs";

const requestWithdrawalSchema = z.object({
  walletType: z.enum(WITHDRAWABLE_WALLETS),
  amountPaise: z.number().int().min(200_00),
  bankDetails: z.object({
    accountHolderName: z.string().min(2),
    accountNumber: z.string().regex(/^\d{8,20}$/),
    ifscCode: z.string().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/),
    bankName: z.string().min(2),
  }),
  idempotencyKey: z.string().min(1),
});

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const [withdrawals, wallet] = await Promise.all([
    listMemberWithdrawals(session.memberId),
    getOrCreateStoreWallet(session.memberId),
  ]);

  return ok({
    withdrawals,
    balances: {
      freeReferralPaise: wallet.freeReferralPaise,
      paidReferralPaise: wallet.paidReferralPaise,
      totalWithdrawablePaise:
        wallet.freeReferralPaise + wallet.paidReferralPaise,
    },
    limits: {
      minPaise: MIN_WITHDRAWAL_PAISE,
      maxPaise: MAX_WITHDRAWAL_PAISE,
    },
  });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = requestWithdrawalSchema.parse(body);

  const result = await requestWithdrawal({
    memberId: session.memberId,
    walletType: parsed.walletType,
    amountPaise: parsed.amountPaise,
    bankDetails: parsed.bankDetails,
    idempotencyKey: parsed.idempotencyKey,
  });

  const rawWithdrawal = result.request.toObject();
  if (rawWithdrawal.bankDetails) {
    rawWithdrawal.bankDetails = {
      ...rawWithdrawal.bankDetails,
      accountNumber: maskAccountNumber(rawWithdrawal.bankDetails.accountNumber),
    };
  }

  return ok({
    message: result.isReplay
      ? "Existing withdrawal request returned."
      : "Withdrawal request submitted successfully. Placed on hold pending admin verification.",
    withdrawal: rawWithdrawal,
    isReplay: result.isReplay,
  });
});
