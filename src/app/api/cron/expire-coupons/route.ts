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

  // Multi-deployment guard:
  // When the repository is deployed to both Bhavika and JMD projects,
  // coupon expiry is owned by Bhavika (JMD_SITE_MODE != true).
  // Can also be explicitly toggled via ENABLE_COUPON_EXPIRY_CRON=true/false.
  const isJmdMode = process.env.JMD_SITE_MODE === "true";
  const explicitGuard = process.env.ENABLE_COUPON_EXPIRY_CRON;
  const isEnabled =
    explicitGuard !== undefined ? explicitGuard === "true" : !isJmdMode;

  if (!isEnabled) {
    return ok({
      ok: true,
      skipped: true,
      reason: isJmdMode
        ? "Bhavika coupon expiry cron is disabled in JMD storefront mode (JMD_SITE_MODE=true)"
        : "Bhavika coupon expiry cron is explicitly disabled via ENABLE_COUPON_EXPIRY_CRON=false",
      ranAt: new Date().toISOString(),
    });
  }

  const result = await expireCoupons();
  return ok({ ok: true, ...result, ranAt: new Date().toISOString() });
}
