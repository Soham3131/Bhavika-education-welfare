import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreCouponModel,
  IStoreCouponDoc,
  StoreCouponStatus,
  StoreCouponSource,
} from "../models/StoreCoupon";
import { getStoreMemberModel } from "../models/StoreMember";
import { generateStoreCouponCode } from "./store-coupon.service";
import { DomainError } from "@/server/errors";

export async function transferStoreCoupon(input: {
  couponId: string | Types.ObjectId;
  fromMemberId: string | Types.ObjectId;
  toPhone: string;
  note?: string;
}): Promise<{
  transferredCoupon: IStoreCouponDoc;
  newCoupon: IStoreCouponDoc;
}> {
  const db = await getStoreDb();
  const CouponModel = getStoreCouponModel(db);
  const MemberModel = getStoreMemberModel(db);

  const fromObjectId = new Types.ObjectId(input.fromMemberId);
  const coupon = await CouponModel.findOne({
    _id: input.couponId,
    member: fromObjectId,
    status: StoreCouponStatus.ACTIVE,
  });

  if (!coupon) {
    throw new DomainError("Active coupon not found in your account.", 404, "COUPON_NOT_FOUND");
  }

  if (coupon.expiresAt < new Date()) {
    coupon.status = StoreCouponStatus.EXPIRED;
    await coupon.save();
    throw new DomainError("This coupon has expired.", 400, "COUPON_EXPIRED");
  }

  const recipient = await MemberModel.findOne({ phone: input.toPhone.trim() });
  if (!recipient) {
    throw new DomainError("Recipient member not found with this phone number.", 404, "RECIPIENT_NOT_FOUND");
  }

  if (recipient._id.toString() === fromObjectId.toString()) {
    throw new DomainError("Cannot transfer a coupon to yourself.", 400, "SELF_TRANSFER");
  }

  // 1. Invalidate sender's coupon claim immediately
  coupon.status = StoreCouponStatus.REDEEMED;
  coupon.metadata = {
    ...coupon.metadata,
    transferredAt: new Date(),
    transferredTo: recipient._id.toString(),
    transferNote: input.note || null,
  };
  await coupon.save();

  // 2. Mint new coupon for recipient with identical face value and remaining expiry
  const newCoupon = new CouponModel({
    couponCode: generateStoreCouponCode(),
    member: recipient._id,
    faceValuePaise: coupon.faceValuePaise,
    source: StoreCouponSource.ADMIN_GRANT, // Transfer source
    status: StoreCouponStatus.ACTIVE,
    expiresAt: coupon.expiresAt,
    isEligibleForDraw: coupon.isEligibleForDraw,
    metadata: {
      transferredFrom: fromObjectId.toString(),
      originalCouponCode: coupon.couponCode,
      note: input.note || null,
    },
  });

  await newCoupon.save();

  return {
    transferredCoupon: coupon,
    newCoupon,
  };
}
