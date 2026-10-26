import { handle, ok, fail } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listAllRecharges,
  reconcilePendingRecharges,
  reverseRechargeOrder,
} from "@/server/store/services/recharge.service";
import {
  RechargeServiceType,
  RechargeStatus,
} from "@/server/store/models/StoreRechargeOrder";
import { AdminAuditLog } from "@/server/models";
import { z } from "zod";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RECONCILE"),
  }),
  z.object({
    action: z.literal("REVERSE"),
    rechargeRef: z.string().min(1, "rechargeRef required"),
    reason: z.string().min(3, "Audit reason required"),
  }),
]);

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as RechargeStatus | null;
  const serviceType = url.searchParams.get("serviceType") as RechargeServiceType | null;
  const limit = Number(url.searchParams.get("limit") || 50);
  const skip = Number(url.searchParams.get("skip") || 0);

  const data = await listAllRecharges({
    status: status || undefined,
    serviceType: serviceType || undefined,
    limit,
    skip,
  });

  return ok(data);
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = actionSchema.parse(body);

  if (parsed.action === "RECONCILE") {
    const outcome = await reconcilePendingRecharges();
    return ok({
      message: `Reconciliation completed: ${outcome.reconciledCount} processed (${outcome.successCount} confirmed, ${outcome.failureCount} refunded).`,
      outcome,
    });
  }

  if (parsed.action === "REVERSE") {
    const reversed = await reverseRechargeOrder({
      rechargeRef: parsed.rechargeRef,
      reason: parsed.reason,
    });

    try {
      const { Types } = await import("mongoose");
      await AdminAuditLog.create({
        admin: new Types.ObjectId(admin.id),
        action: "STORE_RECHARGE_REVERSAL",
        targetType: "STORE_RECHARGE",
        targetId: null,
        reason: parsed.reason,
        meta: {
          rechargeRef: parsed.rechargeRef,
          amountPaise: reversed.amountPaise,
        },
      });
    } catch {
      // Non-blocking
    }

    return ok({
      message: `Recharge ${parsed.rechargeRef} successfully reversed! Commission revoked and principal refunded.`,
      order: reversed,
    });
  }

  return fail("Invalid action", 400);
});
