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

  // Cron execution guard:
  // When ENABLE_CRON_JOBS is explicitly set to "false", safely skip job execution.
  // When unset, preserve existing Bhavika deployment behavior.
  if (process.env.ENABLE_CRON_JOBS === "false") {
    return ok({
      ok: true,
      skipped: true,
      reason: "Cron jobs are explicitly disabled via ENABLE_CRON_JOBS=false",
      ranAt: new Date().toISOString(),
    });
  }

  // Optional deployment-specific override
  if (process.env.ENABLE_REFUND_RECONCILE_CRON === "false") {
    return ok({
      ok: true,
      skipped: true,
      reason: "Refund reconciliation cron is explicitly disabled via ENABLE_REFUND_RECONCILE_CRON=false",
      ranAt: new Date().toISOString(),
    });
  }

  const result = await sweepPendingRefunds();
  return ok({ ok: true, ...result, ranAt: new Date().toISOString() });
}
