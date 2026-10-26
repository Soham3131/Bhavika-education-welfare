import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  listMemberStoreCoupons,
  validateStoreCoupon,
} from "@/server/store/services/store-coupon.service";
import {
  getMemberPointsStatus,
  convertPointsToStoreCoupon,
} from "@/server/store/services/points.service";
import { z } from "zod";

const convertPointsSchema = z.object({
  action: z.literal("CONVERT_POINTS"),
  pointsToConvert: z.number().int().min(500),
});

const validateCouponSchema = z.object({
  action: z.literal("VALIDATE"),
  couponCode: z.string().trim().min(3),
});

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const [coupons, pointsStatus] = await Promise.all([
    listMemberStoreCoupons({ memberId: session.memberId }),
    getMemberPointsStatus(session.memberId),
  ]);

  return ok({
    coupons,
    pointsStatus,
  });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();

  if (body.action === "VALIDATE") {
    const parsed = validateCouponSchema.parse(body);
    const res = await validateStoreCoupon({
      couponCode: parsed.couponCode,
      memberId: session.memberId,
    });
    if (!res.valid) {
      return fail(res.reason || "Invalid coupon.", 400);
    }
    return ok({
      valid: true,
      couponCode: res.coupon!.couponCode,
      faceValuePaise: res.coupon!.faceValuePaise,
      faceValueRupees: res.coupon!.faceValuePaise / 100,
    });
  }

  if (body.action === "CONVERT_POINTS") {
    const parsed = convertPointsSchema.parse(body);
    const result = await convertPointsToStoreCoupon({
      memberId: session.memberId,
      pointsToConvert: parsed.pointsToConvert,
    });

    return ok({
      message: `Successfully converted ${result.pointsDebited.toLocaleString()} points into a ₹${(result.faceValuePaise / 100).toFixed(0)} coupon!`,
      coupon: result.coupon,
      pointsDebited: result.pointsDebited,
      faceValuePaise: result.faceValuePaise,
    });
  }

  return fail("Invalid action specified.", 400);
});
