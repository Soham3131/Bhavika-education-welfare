import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { withStoreTransaction, getStoreDb } from "../db/connect";
import {
  getStoreCouponModel,
  IStoreCouponDoc,
  StoreCouponSource,
  StoreCouponStatus,
} from "../models/StoreCoupon";
import { getStoreWalletModel } from "../models/StoreWallet";
import { DomainError } from "@/server/errors";

export interface IssueStoreCouponInput {
  memberId: string | Types.ObjectId;
  faceValuePaise: number;
  source: StoreCouponSource;
  sourceRef?: string | null;
  validityDays?: number;
  isEligibleForDraw?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RedeemStoreCouponInput {
  couponCode: string;
  memberId: string | Types.ObjectId;
  orderRef: string;
}

/**
 * Generates an unambiguous, unique coupon code in format: JMD-CPN-YYYY-XXXXXXXX
 * (8 characters using unambiguous uppercase alphanumeric set)
 */
export function generateStoreCouponCode(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-CPN-${year}-${random}`;
}

/**
 * Issues a new native StoreCoupon atomically and updates member's couponWalletPaise cache.
 */
export async function issueStoreCoupon(
  input: IssueStoreCouponInput,
): Promise<IStoreCouponDoc> {
  if (input.faceValuePaise <= 0 || !Number.isInteger(input.faceValuePaise)) {
    throw new DomainError("Face value must be a positive integer in paise.", 400, "INVALID_FACE_VALUE");
  }

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const validityDays = input.validityDays ?? 90;
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

  return withStoreTransaction(async (session, conn) => {
    const CouponModel = getStoreCouponModel(conn);
    const WalletModel = getStoreWalletModel(conn);

    let couponCode = generateStoreCouponCode();
    // Guarantee uniqueness
    while (await CouponModel.findOne({ couponCode }).session(session)) {
      couponCode = generateStoreCouponCode();
    }

    const [coupon] = await CouponModel.create(
      [
        {
          couponCode,
          member: memberObjectId,
          faceValuePaise: input.faceValuePaise,
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          status: StoreCouponStatus.ACTIVE,
          expiresAt,
          isEligibleForDraw: input.isEligibleForDraw ?? true,
          metadata: input.metadata ?? {},
        },
      ],
      { session },
    );

    // Atomically increment the derived coupon valuation cache on the member's wallet
    await WalletModel.findOneAndUpdate(
      { member: memberObjectId },
      {
        $inc: { couponWalletPaise: input.faceValuePaise },
        $setOnInsert: {
          member: memberObjectId,
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

    return coupon;
  });
}

/**
 * Validates a native store coupon for checkout applicability.
 */
export async function validateStoreCoupon(input: {
  couponCode: string;
  memberId: string | Types.ObjectId;
}): Promise<{
  valid: boolean;
  coupon: IStoreCouponDoc | null;
  reason?: string;
}> {
  const db = await getStoreDb();
  const CouponModel = getStoreCouponModel(db);

  const cleanCode = input.couponCode.trim().toUpperCase();
  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const coupon = await CouponModel.findOne({
    couponCode: cleanCode,
    member: memberObjectId,
  });

  if (!coupon) {
    return { valid: false, coupon: null, reason: "Coupon not found or does not belong to this member." };
  }

  if (coupon.status !== StoreCouponStatus.ACTIVE) {
    return { valid: false, coupon, reason: `Coupon is ${coupon.status.toLowerCase()}.` };
  }

  if (coupon.expiresAt < new Date()) {
    return { valid: false, coupon, reason: "Coupon has expired." };
  }

  return { valid: true, coupon };
}

/**
 * Atomically redeems a native store coupon for an order, preventing double-spends.
 */
export async function redeemStoreCoupon(
  input: RedeemStoreCouponInput,
): Promise<{
  redeemed: boolean;
  coupon: IStoreCouponDoc;
  faceValuePaise: number;
}> {
  const cleanCode = input.couponCode.trim().toUpperCase();
  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  return withStoreTransaction(async (session, conn) => {
    const CouponModel = getStoreCouponModel(conn);
    const WalletModel = getStoreWalletModel(conn);

    // Atomically locate active coupon with write lock
    const coupon = await CouponModel.findOne({
      couponCode: cleanCode,
      member: memberObjectId,
    }).session(session);

    if (!coupon) {
      throw new DomainError("Coupon not found or does not belong to member.", 404, "COUPON_NOT_FOUND");
    }

    if (coupon.status === StoreCouponStatus.REDEEMED) {
      if (coupon.redeemedOrderRef === input.orderRef) {
        // Idempotent retry on the same order reference
        return {
          redeemed: true,
          coupon,
          faceValuePaise: coupon.faceValuePaise,
        };
      }
      throw new DomainError("Coupon has already been redeemed on another order.", 409, "COUPON_ALREADY_REDEEMED");
    }

    if (coupon.status !== StoreCouponStatus.ACTIVE) {
      throw new DomainError(`Coupon is not active (${coupon.status}).`, 400, "COUPON_NOT_ACTIVE");
    }

    if (coupon.expiresAt < new Date()) {
      coupon.status = StoreCouponStatus.EXPIRED;
      await coupon.save({ session });
      await WalletModel.updateOne(
        { member: memberObjectId },
        { $inc: { couponWalletPaise: -coupon.faceValuePaise } },
        { session },
      );
      throw new DomainError("Coupon has expired.", 400, "COUPON_EXPIRED");
    }

    // Transition to REDEEMED
    coupon.status = StoreCouponStatus.REDEEMED;
    coupon.redeemedAt = new Date();
    coupon.redeemedOrderRef = input.orderRef;
    await coupon.save({ session });

    // Decrement couponWalletPaise cache
    await WalletModel.updateOne(
      { member: memberObjectId },
      { $inc: { couponWalletPaise: -coupon.faceValuePaise } },
      { session },
    );

    return {
      redeemed: true,
      coupon,
      faceValuePaise: coupon.faceValuePaise,
    };
  });
}

/**
 * Restores a native coupon when an order is cancelled before fulfillment.
 */
export async function restoreStoreCoupon(input: {
  couponCode: string;
  memberId: string | Types.ObjectId;
  orderRef: string;
  reason: string;
}): Promise<IStoreCouponDoc> {
  const cleanCode = input.couponCode.trim().toUpperCase();
  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  return withStoreTransaction(async (session, conn) => {
    const CouponModel = getStoreCouponModel(conn);
    const WalletModel = getStoreWalletModel(conn);

    const coupon = await CouponModel.findOne({
      couponCode: cleanCode,
      member: memberObjectId,
      redeemedOrderRef: input.orderRef,
      status: StoreCouponStatus.REDEEMED,
    }).session(session);

    if (!coupon) {
      throw new DomainError("No redeemed coupon found matching this order.", 404, "COUPON_NOT_FOUND");
    }

    coupon.status = StoreCouponStatus.ACTIVE;
    coupon.redeemedAt = null;
    coupon.redeemedOrderRef = null;
    coupon.metadata = {
      ...(coupon.metadata || {}),
      restoredFromOrderRef: input.orderRef,
      restoreReason: input.reason,
      restoredAt: new Date().toISOString(),
    };
    await coupon.save({ session });

    // Re-credit to wallet valuation cache
    await WalletModel.updateOne(
      { member: memberObjectId },
      { $inc: { couponWalletPaise: coupon.faceValuePaise } },
      { session },
    );

    return coupon;
  });
}

/**
 * Lists coupons belonging to a specific store member.
 */
export async function listMemberStoreCoupons(input: {
  memberId: string | Types.ObjectId;
  status?: StoreCouponStatus;
}): Promise<IStoreCouponDoc[]> {
  const db = await getStoreDb();
  const CouponModel = getStoreCouponModel(db);
  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const query: Record<string, unknown> = { member: memberObjectId };
  if (input.status) {
    query.status = input.status;
  }

  return CouponModel.find(query).sort({ createdAt: -1 }).lean() as unknown as IStoreCouponDoc[];
}

/**
 * Lists all store coupons for admin reporting.
 */
export async function listAllStoreCoupons(query: {
  source?: StoreCouponSource;
  status?: StoreCouponStatus;
  limit?: number;
  skip?: number;
}): Promise<{ coupons: IStoreCouponDoc[]; total: number }> {
  const db = await getStoreDb();
  const CouponModel = getStoreCouponModel(db);

  const filter: Record<string, unknown> = {};
  if (query.source) filter.source = query.source;
  if (query.status) filter.status = query.status;

  const limit = Math.min(query.limit ?? 50, 100);
  const skip = query.skip ?? 0;

  const [coupons, total] = await Promise.all([
    CouponModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("member", "name phone memberId")
      .lean() as unknown as IStoreCouponDoc[],
    CouponModel.countDocuments(filter),
  ]);

  return { coupons, total };
}
