import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreCouponModel, StoreCouponStatus } from "../models/StoreCoupon";
import { validateBhavikaCoupon } from "./bhavika-client.service";
import { DomainError } from "@/server/errors";

export interface ResolvedAuthoritativeCoupon {
  code: string;
  source: "STORE" | "BHAVIKA" | "CUSTOM";
  valueRupees: number;
  valuePaise: number;
}

export interface AuthoritativeCouponResolution {
  coupons: ResolvedAuthoritativeCoupon[];
  totalDiscountPaise: number;
  totalDiscountRupees: number;
}

export interface ResolveCouponsInput {
  couponCodes: string[];
  memberId?: string | Types.ObjectId;
  customValidator?: (
    code: string,
  ) => Promise<{ valid: boolean; valueRupees?: number; error?: string }>;
}

/**
 * Authoritatively validates coupon codes against native JMD store records and
 * the upstream Bhavika coupon integration contract.
 *
 * CRITICAL SECURITY PRINCIPLE:
 * Client-submitted discount numbers (valueRupees, couponDiscountRupees, etc.)
 * are completely rejected. The server derives the discount value exclusively
 * from verified database records or cryptographically signed upstream validation.
 */
export async function resolveAuthoritativeCoupons(
  input: ResolveCouponsInput,
): Promise<AuthoritativeCouponResolution> {
  const { couponCodes, memberId, customValidator } = input;

  if (!couponCodes || couponCodes.length === 0) {
    return {
      coupons: [],
      totalDiscountPaise: 0,
      totalDiscountRupees: 0,
    };
  }

  // 1. Clean, normalize and deduplicate coupon codes
  const cleanCodes: string[] = [];
  const seen = new Set<string>();

  for (const rawCode of couponCodes) {
    if (typeof rawCode !== "string") continue;
    const clean = rawCode.trim().toUpperCase();
    if (!clean) continue;

    if (seen.has(clean)) {
      throw new DomainError(
        `Duplicate coupon code '${clean}' detected in submission. A coupon code cannot be applied more than once per order.`,
        400,
        "DUPLICATE_COUPON_CODE",
      );
    }
    seen.add(clean);
    cleanCodes.push(clean);
  }

  if (cleanCodes.length === 0) {
    return {
      coupons: [],
      totalDiscountPaise: 0,
      totalDiscountRupees: 0,
    };
  }

  const resolved: ResolvedAuthoritativeCoupon[] = [];
  let totalDiscountPaise = 0;

  const db = await getStoreDb();
  const StoreCoupon = getStoreCouponModel(db);

  for (const code of cleanCodes) {
    // A. Check native JMD store coupons first
    const storeCoupon = await StoreCoupon.findOne({ couponCode: code });

    if (storeCoupon) {
      if (
        memberId &&
        storeCoupon.member &&
        storeCoupon.member.toString() !== memberId.toString()
      ) {
        throw new DomainError(
          `Store coupon '${code}' does not belong to the current member.`,
          403,
          "COUPON_OWNERSHIP_MISMATCH",
        );
      }
      if (storeCoupon.status === StoreCouponStatus.LOCKED_IN_CHECKOUT) {
        if (storeCoupon.lockedExpiresAt && storeCoupon.lockedExpiresAt < new Date()) {
          // Lock expired from abandoned session; reclaim back to ACTIVE
          await StoreCoupon.updateOne(
            { _id: storeCoupon._id, status: StoreCouponStatus.LOCKED_IN_CHECKOUT },
            {
              $set: {
                status: StoreCouponStatus.ACTIVE,
                lockedOrderRef: null,
                lockedExpiresAt: null,
              },
            },
          );
          storeCoupon.status = StoreCouponStatus.ACTIVE;
        } else {
          throw new DomainError(
            `Store coupon '${code}' is currently locked in an active checkout session.`,
            409,
            "COUPON_LOCKED_IN_CHECKOUT",
          );
        }
      }
      if (storeCoupon.status !== StoreCouponStatus.ACTIVE) {
        throw new DomainError(
          `Store coupon '${code}' is ${storeCoupon.status.toLowerCase()} and cannot be used.`,
          400,
          "COUPON_NOT_ACTIVE",
        );
      }
      if (storeCoupon.expiresAt < new Date()) {
        throw new DomainError(
          `Store coupon '${code}' expired on ${storeCoupon.expiresAt.toISOString()}.`,
          400,
          "COUPON_EXPIRED",
        );
      }
      const valPaise = storeCoupon.faceValuePaise;
      resolved.push({
        code,
        source: "STORE",
        valueRupees: valPaise / 100,
        valuePaise: valPaise,
      });
      totalDiscountPaise += valPaise;
      continue;
    }

    // B. Check mock/injected validator (used in integration tests for external coupons)
    if (customValidator) {
      const customRes = await customValidator(code);
      if (!customRes.valid || typeof customRes.valueRupees !== "number" || customRes.valueRupees <= 0) {
        throw new DomainError(
          customRes.error || `Coupon code '${code}' is invalid or expired.`,
          400,
          "INVALID_COUPON",
        );
      }
      const valPaise = Math.round(customRes.valueRupees * 100);
      resolved.push({
        code,
        source: "CUSTOM",
        valueRupees: customRes.valueRupees,
        valuePaise: valPaise,
      });
      totalDiscountPaise += valPaise;
      continue;
    }

    // C. Check external Bhavika coupons
    // If HMAC secret is configured, call official signed endpoint
    const hasBhavikaSecret = Boolean(process.env.BHAVIKA_INTEGRATION_SECRET);

    if (hasBhavikaSecret) {
      const bhavikaRes = await validateBhavikaCoupon(code);
      if (!bhavikaRes.valid || !bhavikaRes.valueRupees || bhavikaRes.valueRupees <= 0) {
        throw new DomainError(
          bhavikaRes.error || `Bhavika coupon '${code}' is invalid, expired, or already redeemed.`,
          400,
          "INVALID_BHAVIKA_COUPON",
        );
      }
      const valPaise = Math.round(bhavikaRes.valueRupees * 100);
      resolved.push({
        code,
        source: "BHAVIKA",
        valueRupees: bhavikaRes.valueRupees,
        valuePaise: valPaise,
      });
      totalDiscountPaise += valPaise;
      continue;
    }

    // Fallback in local development / monorepo when secret is unconfigured:
    // query Bhavika coupon model directly
    try {
      const { validateCoupon } = await import("@/server/services/coupon.service");
      const localVal = await validateCoupon(code);
      if (!localVal.valid || !localVal.coupon || localVal.coupon.valueRupees <= 0) {
        throw new DomainError(
          `Coupon '${code}' is invalid or unusable (reason: ${localVal.reason || "NOT_FOUND"}).`,
          400,
          "INVALID_COUPON",
        );
      }
      const valPaise = Math.round(localVal.coupon.valueRupees * 100);
      resolved.push({
        code,
        source: "BHAVIKA",
        valueRupees: localVal.coupon.valueRupees,
        valuePaise: valPaise,
      });
      totalDiscountPaise += valPaise;
      continue;
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw new DomainError(
        `Coupon code '${code}' could not be verified against the coupon register.`,
        400,
        "COUPON_VERIFICATION_FAILED",
      );
    }
  }

  return {
    coupons: resolved,
    totalDiscountPaise,
    totalDiscountRupees: totalDiscountPaise / 100,
  };
}
