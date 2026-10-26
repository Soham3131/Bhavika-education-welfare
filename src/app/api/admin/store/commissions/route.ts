import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import { listCommissionLedger } from "@/server/store/services/commission.service";

export const runtime = "nodejs";

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const url = new URL(req.url);
  const orderRef = url.searchParams.get("orderRef") || undefined;
  const memberId = url.searchParams.get("memberId") || undefined;

  const entries = await listCommissionLedger({
    orderRef,
    memberId,
    limit: 100,
  });

  return ok({
    entries: entries.map((e) => ({
      id: e._id.toString(),
      orderRef: e.orderRef,
      memberId: e.memberId.toString(),
      sourceMemberId: e.sourceMemberId.toString(),
      type: e.type,
      status: e.status,
      level: e.level,
      eligibleBaseRupees: e.eligibleBasePaise / 100,
      commissionRatePercentage: e.commissionRatePercentage,
      commissionAmountRupees: e.commissionAmountPaise / 100,
      reversalReason: e.reversalReason || null,
      originalCommissionId: e.originalCommissionId?.toString() || null,
      createdAt: e.createdAt,
      settledAt: e.settledAt || null,
    })),
  });
});
