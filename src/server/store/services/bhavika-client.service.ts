import "server-only";
import { createHmac } from "node:crypto";

/**
 * Bhavika ↔ Jai Maa Durga — Store-side Integration Client
 * Implemented strictly according to docs/JAI_MAA_DURGA_INTEGRATION.md
 *
 * Configured via:
 * - BHAVIKA_API_BASE: Base URL of the Bhavika platform (e.g. https://bhavika-education-welfare.vercel.app)
 * - BHAVIKA_INTEGRATION_SECRET: 64-char shared secret (matching Bhavika's JMD_INTEGRATION_SECRET)
 */

export interface BhavikaValidateResult {
  valid: boolean;
  valueRupees?: number;
  currency?: string;
  expiresAt?: string;
  error?: string;
}

export interface BhavikaRedeemResult {
  redeemed: boolean;
  replay: boolean;
  code?: string;
  valueRupees?: number;
  currency?: string;
  externalRef?: string;
  redeemedAt?: string;
  error?: string;
  errorCode?: string;
  statusCode?: number;
  // Aliases for compatibility
  success: boolean;
  isReplay: boolean;
}

/**
 * Generates RFC 4648 §5 base64url HMAC-SHA256 signature for store requests.
 * Uses whole-second Unix timestamp and exact string body bytes.
 */
export function signBhavikaRequest(
  bodyString: string,
  secret: string,
  timestampSeconds?: number,
): { timestamp: string; signature: string } {
  const timestamp = String(
    timestampSeconds ?? Math.floor(Date.now() / 1000),
  );
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${bodyString}`)
    .digest("base64url");

  return { timestamp, signature };
}

/**
 * Retrieves store-side integration credentials from environment.
 * Enforces production security: never permits dummy/offline fallback in production.
 */
export function getBhavikaConfig(): {
  apiBase: string;
  secret: string;
} {
  const apiBase = process.env.BHAVIKA_API_BASE;
  const secret = process.env.BHAVIKA_INTEGRATION_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!apiBase) {
      throw new Error(
        "[BhavikaClient] BHAVIKA_API_BASE is required in production.",
      );
    }
    if (!secret || secret.length < 32) {
      throw new Error(
        "[BhavikaClient] BHAVIKA_INTEGRATION_SECRET must be configured with at least 32 bytes in production.",
      );
    }
  }

  return {
    apiBase: apiBase || "http://localhost:3000",
    secret: secret || "",
  };
}

/**
 * Advisory check of coupon validity and rupee value before checkout.
 * POST /api/integration/coupons/validate
 */
export async function validateBhavikaCoupon(
  code: string,
): Promise<BhavikaValidateResult> {
  const config = getBhavikaConfig();

  if (!config.secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Bhavika integration secret is not configured.");
    }
    return {
      valid: false,
      error: "BHAVIKA_INTEGRATION_SECRET is not configured in this environment.",
    };
  }

  const payload = { code: code.trim().toUpperCase() };
  const body = JSON.stringify(payload); // Serialise ONCE
  const { timestamp, signature } = signBhavikaRequest(body, config.secret);

  try {
    const res = await fetch(
      `${config.apiBase}/api/integration/coupons/validate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jmd-timestamp": timestamp,
          "x-jmd-signature": signature,
        },
        body,
        cache: "no-store",
      },
    );

    const json = await res.json().catch(() => null);

    if (res.ok && json?.valid) {
      return {
        valid: true,
        valueRupees: json.valueRupees,
        currency: json.currency || "INR",
        expiresAt: json.expiresAt,
      };
    }

    return {
      valid: false,
      error: json?.message || json?.error || `Validation failed (${res.status})`,
    };
  } catch (err: unknown) {
    return {
      valid: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error reaching Bhavika server",
    };
  }
}

/**
 * Authoritative redemption of coupon against a stable order reference.
 * POST /api/integration/coupons/redeem
 */
export async function redeemBhavikaCoupon(
  code: string,
  externalRef: string,
): Promise<BhavikaRedeemResult> {
  const config = getBhavikaConfig();

  if (!config.secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Bhavika integration secret is not configured.");
    }
    return {
      redeemed: false,
      replay: false,
      success: false,
      isReplay: false,
      error: "BHAVIKA_INTEGRATION_SECRET is not configured in this environment.",
      errorCode: "NOT_CONFIGURED",
      statusCode: 503,
    };
  }

  const payload = {
    code: code.trim().toUpperCase(),
    externalRef: externalRef.trim(),
  };
  const body = JSON.stringify(payload); // Serialise ONCE
  const { timestamp, signature } = signBhavikaRequest(body, config.secret);

  try {
    const res = await fetch(
      `${config.apiBase}/api/integration/coupons/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jmd-timestamp": timestamp,
          "x-jmd-signature": signature,
        },
        body,
        cache: "no-store",
      },
    );

    const json = await res.json().catch(() => null);

    if (res.ok && json?.redeemed) {
      return {
        redeemed: true,
        replay: Boolean(json.replay),
        success: true,
        isReplay: Boolean(json.replay),
        code: json.code,
        valueRupees: json.valueRupees,
        currency: json.currency || "INR",
        externalRef: json.externalRef,
        redeemedAt: json.redeemedAt,
        statusCode: res.status,
      };
    }

    return {
      redeemed: false,
      replay: false,
      success: false,
      isReplay: false,
      error: json?.error || json?.message || `Redemption failed (${res.status})`,
      errorCode: json?.code,
      statusCode: res.status,
    };
  } catch (err: unknown) {
    return {
      redeemed: false,
      replay: false,
      success: false,
      isReplay: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error reaching Bhavika server",
      statusCode: 0,
    };
  }
}
