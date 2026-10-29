import { ok, fail } from "@/server/http";
import { isCronAuthorized } from "@/server/cron-auth";
import { expireCoupons } from "@/server/services/coupon.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sweep flips lapsed coupons one transaction at a time; give it room.
export const maxDuration = 60;

/**
 * Scheduled coupon-expiry sweep.
 *
 * Flips ACTIVE coupons whose `expiresAt` has passed to EXPIRED and writes the
 * "points forfeited" ledger row the member looks for. Expired coupons are
 * already unusable at every read path (the clock is checked live), so no money
 * depends on this running on time — it exists to make the forfeit *visible*.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a
 * configured secret the endpoint refuses everyone, so it can never be triggered
 * from the open internet. Idempotent — a re-run skips coupons already handled.
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
  if (process.env.ENABLE_COUPON_EXPIRY_CRON === "false") {
    return ok({
      ok: true,
      skipped: true,
      reason: "Bhavika coupon expiry cron is explicitly disabled via ENABLE_COUPON_EXPIRY_CRON=false",
      ranAt: new Date().toISOString(),
    });
  }

  const result = await expireCoupons();
  return ok({ ok: true, ...result, ranAt: new Date().toISOString() });
}
