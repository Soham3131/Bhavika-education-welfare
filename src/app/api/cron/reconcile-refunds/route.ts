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

  // Multi-deployment guard:
  // When the repository is deployed to both Bhavika and JMD projects,
  // refund reconciliation is owned by JMD Store (JMD_SITE_MODE === "true").
  // Can also be explicitly toggled via ENABLE_REFUND_RECONCILE_CRON=true/false.
  const isJmdMode = process.env.JMD_SITE_MODE === "true";
  const explicitGuard = process.env.ENABLE_REFUND_RECONCILE_CRON;
  const isEnabled =
    explicitGuard !== undefined ? explicitGuard === "true" : isJmdMode;

  if (!isEnabled) {
    return ok({
      ok: true,
      skipped: true,
      reason: !isJmdMode
        ? "Store refund reconciliation cron is disabled on Bhavika deployment (JMD_SITE_MODE != true)"
        : "Store refund reconciliation cron is explicitly disabled via ENABLE_REFUND_RECONCILE_CRON=false",
      ranAt: new Date().toISOString(),
    });
  }

  const result = await sweepPendingRefunds();
  return ok({ ok: true, ...result, ranAt: new Date().toISOString() });
}
