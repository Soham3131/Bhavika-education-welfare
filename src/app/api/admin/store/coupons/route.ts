import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listAllStoreCoupons,
  issueStoreCoupon,
} from "@/server/store/services/store-coupon.service";
import {
  StoreCouponSource,
  StoreCouponStatus,
} from "@/server/store/models/StoreCoupon";
import { AdminAuditLog } from "@/server/models";
import { z } from "zod";

const issueCouponSchema = z.object({
  memberId: z.string().min(1, "Member ID required"),
  faceValueRupees: z.number().int().min(1, "Face value must be at least ₹1"),
  reason: z.string().min(3, "Reason required"),
  validityDays: z.number().int().min(1).max(365).optional().default(90),
});

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");

  const url = new URL(req.url);
  const source = url.searchParams.get("source") as StoreCouponSource | null;
  const status = url.searchParams.get("status") as StoreCouponStatus | null;
  const limit = Number(url.searchParams.get("limit") || 50);
  const skip = Number(url.searchParams.get("skip") || 0);

  const data = await listAllStoreCoupons({
    source: source || undefined,
    status: status || undefined,
    limit,
    skip,
  });

  return ok(data);
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = issueCouponSchema.parse(body);

  const faceValuePaise = parsed.faceValueRupees * 100;
  const coupon = await issueStoreCoupon({
    memberId: parsed.memberId,
    faceValuePaise,
    source: StoreCouponSource.ADMIN_GRANT,
    sourceRef: `admin:${admin.id}`,
    validityDays: parsed.validityDays,
    isEligibleForDraw: true,
    metadata: {
      adminId: admin.id,
      adminEmail: admin.email,
      reason: parsed.reason,
    },
  });

  // Audit log entry
  try {
    const { Types } = await import("mongoose");
    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "STORE_COUPON_ADMIN_GRANT",
      targetType: "STORE_COUPON",
      targetId: null,
      reason: parsed.reason,
      meta: {
        couponCode: coupon.couponCode,
        memberId: parsed.memberId,
        faceValueRupees: parsed.faceValueRupees,
      },
    });
  } catch {
    // Audit failure non-blocking
  }

  return ok({
    message: `Coupon ${coupon.couponCode} of ₹${parsed.faceValueRupees} successfully issued!`,
    coupon,
  });
});
