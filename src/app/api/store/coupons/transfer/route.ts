import { handle, ok } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import { transferStoreCoupon } from "@/server/store/services/coupon-transfer.service";
import { z } from "zod";

const transferSchema = z.object({
  couponId: z.string().min(1, "couponId required"),
  toPhone: z.string().regex(/^\d{10}$/, "Valid 10-digit phone number required"),
  note: z.string().optional(),
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = transferSchema.parse(body);

  const result = await transferStoreCoupon({
    couponId: parsed.couponId,
    fromMemberId: session.memberId,
    toPhone: parsed.toPhone,
    note: parsed.note,
  });

  return ok({
    message: `Coupon successfully transferred to ${parsed.toPhone}! New coupon code: ${result.newCoupon.couponCode}`,
    newCouponCode: result.newCoupon.couponCode,
    faceValuePaise: result.newCoupon.faceValuePaise,
  });
});
