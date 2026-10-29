import { ok, fail } from "@/server/http";
import { isCronAuthorized } from "@/server/cron-auth";
import { sweepPendingRefunds } from "@/server/store/services/payment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled refund reconciliation sweep.
 *
 * Scans for payment attempts in REFUND_PENDING state and reconciles them
 * against the payment provider (Razorpay).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a
 * configured secret the endpoint refuses everyone, protecting it against unauthorized invocation.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return fail("Unauthorized.", 401, { code: "UNAUTHORIZED" });
  }

  const result = await sweepPendingRefunds();
  return ok({ ok: true, ...result, ranAt: new Date().toISOString() });
}
