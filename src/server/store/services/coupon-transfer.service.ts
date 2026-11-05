import "server-only";
import { Types } from "mongoose";
import { withStoreTransaction } from "../db/connect";
import {
  getStoreCouponModel,
  IStoreCouponDoc,
  StoreCouponStatus,
  StoreCouponSource,
} from "../models/StoreCoupon";
import { getStoreMemberModel } from "../models/StoreMember";
import { getStoreWalletModel } from "../models/StoreWallet";
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
  const fromObjectId = new Types.ObjectId(input.fromMemberId);

  return withStoreTransaction(async (session, conn) => {
    const CouponModel = getStoreCouponModel(conn);
    const MemberModel = getStoreMemberModel(conn);
    const WalletModel = getStoreWalletModel(conn);

    const coupon = await CouponModel.findOne({
      _id: input.couponId,
      member: fromObjectId,
      status: StoreCouponStatus.ACTIVE,
    }).session(session);

    if (!coupon) {
      throw new DomainError("Active coupon not found in your account.", 404, "COUPON_NOT_FOUND");
    }

    if (coupon.expiresAt < new Date()) {
      coupon.status = StoreCouponStatus.EXPIRED;
      await coupon.save({ session });
      await WalletModel.updateOne(
        { member: fromObjectId },
        { $inc: { couponWalletPaise: -coupon.faceValuePaise } },
        { session },
      );
      throw new DomainError("This coupon has expired.", 400, "COUPON_EXPIRED");
    }

    const recipient = await MemberModel.findOne({ phone: input.toPhone.trim() }).session(session);
    if (!recipient) {
      throw new DomainError("Recipient member not found with this phone number.", 404, "RECIPIENT_NOT_FOUND");
    }

    if (recipient._id.toString() === fromObjectId.toString()) {
      throw new DomainError("Cannot transfer a coupon to yourself.", 400, "SELF_TRANSFER");
    }

    // 1. Mark sender's coupon as TRANSFERRED
    coupon.status = StoreCouponStatus.TRANSFERRED;
    coupon.transferredToMember = recipient._id;
    coupon.transferredAt = new Date();
    coupon.metadata = {
      ...coupon.metadata,
      transferredAt: new Date().toISOString(),
      transferredTo: recipient._id.toString(),
      recipientPhone: recipient.phone,
      transferNote: input.note || null,
    };
    await coupon.save({ session });

    // 2. Decrement sender's coupon wallet cache
    await WalletModel.updateOne(
      { member: fromObjectId },
      { $inc: { couponWalletPaise: -coupon.faceValuePaise } },
      { session },
    );

    // 3. Mint new coupon for recipient with identical face value, couponType, and remaining expiry
    let newCode = generateStoreCouponCode();
    while (await CouponModel.findOne({ couponCode: newCode }).session(session)) {
      newCode = generateStoreCouponCode();
    }

    const [newCoupon] = await CouponModel.create(
      [
        {
          couponCode: newCode,
          member: recipient._id,
          faceValuePaise: coupon.faceValuePaise,
          couponType: coupon.couponType ?? "STANDARD",
          source: StoreCouponSource.REFERRAL_REWARD,
          sourceRef: coupon.couponCode,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: coupon.expiresAt,
          isEligibleForDraw: coupon.isEligibleForDraw,
          metadata: {
            transferredFrom: fromObjectId.toString(),
            originalCouponCode: coupon.couponCode,
            note: input.note || null,
          },
        },
      ],
      { session },
    );

    // 4. Increment recipient's coupon wallet cache
    await WalletModel.findOneAndUpdate(
      { member: recipient._id },
      {
        $inc: { couponWalletPaise: coupon.faceValuePaise },
        $setOnInsert: {
          member: recipient._id,
          addMoneyPaise: 0,
          memberActivationPaise: 0,
          productPoints: 0,
          freeReferralPaise: 0,
          paidReferralPaise: 0,
          rechargePaise: 0,
        },
      },
      { upsert: true, session },
    );

    return {
      transferredCoupon: coupon,
      newCoupon,
    };
  });
}
