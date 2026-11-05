import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listAdminWithdrawals,
  approveWithdrawal,
  processWithdrawal,
  rejectWithdrawal,
  confirmPayoutSettlement,
} from "@/server/store/services/withdrawal.service";
import { WithdrawalStatus } from "@/server/store/models/StoreWithdrawalRequest";
import { z } from "zod";

export const runtime = "nodejs";

const patchActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("APPROVE"),
    withdrawalId: z.string().min(1),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("PROCESS"),
    withdrawalId: z.string().min(1),
  }),
  z.object({
    action: z.literal("REJECT"),
    withdrawalId: z.string().min(1),
    rejectionReason: z.string().min(3),
  }),
  z.object({
    action: z.literal("CONFIRM_PAYOUT"),
    withdrawalId: z.string().min(1),
    providerPayoutRef: z.string().min(3),
    payoutProvider: z.string().optional(),
  }),
]);

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") as WithdrawalStatus | null;
  const withdrawals = await listAdminWithdrawals({
    status: statusParam || undefined,
  });
  return ok({ withdrawals });
});

export const PATCH = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = patchActionSchema.parse(body);

  switch (parsed.action) {
    case "APPROVE": {
      const updated = await approveWithdrawal({
        withdrawalId: parsed.withdrawalId,
        adminId: admin.id,
        notes: parsed.notes,
      });
      return ok({
        message: "Withdrawal approved successfully.",
        withdrawal: updated,
      });
    }
    case "PROCESS": {
      const updated = await processWithdrawal({
        withdrawalId: parsed.withdrawalId,
        adminId: admin.id,
      });
      return ok({
        message: "Withdrawal moved to processing queue.",
        withdrawal: updated,
      });
    }
    case "REJECT": {
      const updated = await rejectWithdrawal({
        withdrawalId: parsed.withdrawalId,
        adminId: admin.id,
        rejectionReason: parsed.rejectionReason,
      });
      return ok({
        message: "Withdrawal rejected and funds refunded to member wallet.",
        withdrawal: updated,
      });
    }
    case "CONFIRM_PAYOUT": {
      const updated = await confirmPayoutSettlement({
        withdrawalId: parsed.withdrawalId,
        adminId: admin.id,
        providerPayoutRef: parsed.providerPayoutRef,
        payoutProvider: parsed.payoutProvider,
      });
      return ok({
        message: "Payout settlement confirmed with external provider reference.",
        withdrawal: updated,
      });
    }
  }
});
