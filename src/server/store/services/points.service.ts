import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreWalletModel } from "../models/StoreWallet";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { issueStoreCoupon } from "./store-coupon.service";
import { StoreCouponSource, IStoreCouponDoc } from "../models/StoreCoupon";
import { DomainError } from "@/server/errors";

export interface PointsConfig {
  pointsPerRupeeSpent: number; // e.g. 0.1 (1 point per 10 rupees)
  pointsToRupeeRatio: number;  // e.g. 10 (10 points = 1 rupee)
  minPointsToRedeem: number;   // e.g. 5000 (minimum 5,000 points)
  stepPoints: number;          // e.g. 500 (multiples of 500 points)
  validityDays: number;        // e.g. 90 days
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  pointsPerRupeeSpent: 0.1,
  pointsToRupeeRatio: 10,
  minPointsToRedeem: 5000,
  stepPoints: 500,
  validityDays: 90,
};

let currentPointsConfig: PointsConfig = { ...DEFAULT_POINTS_CONFIG };

export function getPointsConfig(): PointsConfig {
  return { ...currentPointsConfig };
}

export function updatePointsConfig(newConfig: Partial<PointsConfig>): PointsConfig {
  currentPointsConfig = { ...currentPointsConfig, ...newConfig };
  return { ...currentPointsConfig };
}

/**
 * Accrues product points to member's wallet for a delivered/qualifying order.
 */
export async function accrueOrderPoints(input: {
  memberId: string | Types.ObjectId;
  orderRef: string;
  eligibleSpendPaise: number;
}): Promise<{ pointsAwarded: number }> {
  if (input.eligibleSpendPaise <= 0) {
    return { pointsAwarded: 0 };
  }

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const spendRupees = input.eligibleSpendPaise / 100;
  const pointsAwarded = Math.floor(spendRupees * currentPointsConfig.pointsPerRupeeSpent);

  if (pointsAwarded <= 0) {
    return { pointsAwarded: 0 };
  }

  const idempotencyKey = `points-accrue:${input.orderRef}:${memberObjectId.toString()}`;

  await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "PRODUCT_POINT",
    type: "CREDIT",
    unit: "LOYALTY_POINT",
    pointsDelta: pointsAwarded,
    referenceType: "PRODUCT_LOYALTY_REWARD",
    referenceId: input.orderRef,
    idempotencyKey,
    description: `Product points earned on order ${input.orderRef}`,
  });

  return { pointsAwarded };
}

/**
 * Converts accumulated product points into a native store coupon atomically.
 */
export async function convertPointsToStoreCoupon(input: {
  memberId: string | Types.ObjectId;
  pointsToConvert: number;
}): Promise<{
  coupon: IStoreCouponDoc;
  pointsDebited: number;
  faceValuePaise: number;
}> {
  const { pointsToConvert } = input;
  const config = currentPointsConfig;

  if (pointsToConvert < config.minPointsToRedeem) {
    throw new DomainError(
      `Minimum ${config.minPointsToRedeem.toLocaleString()} points required to redeem a coupon.`,
      400,
      "BELOW_MIN_POINTS",
    );
  }

  if (pointsToConvert % config.stepPoints !== 0) {
    throw new DomainError(
      `Points must be converted in increments of ${config.stepPoints.toLocaleString()}.`,
      400,
      "INVALID_STEP_POINTS",
    );
  }

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  // Calculate face value in paise: (points / ratio) * 100 paise
  const faceValueRupees = pointsToConvert / config.pointsToRupeeRatio;
  const faceValuePaise = Math.round(faceValueRupees * 100);

  const idempotencyKey = `points-convert:${memberObjectId.toString()}:${Date.now()}:${pointsToConvert}`;

  const debitRes = await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "PRODUCT_POINT",
    type: "DEBIT",
    unit: "LOYALTY_POINT",
    pointsDelta: pointsToConvert,
    referenceType: "COUPON_CONVERSION",
    referenceId: idempotencyKey,
    idempotencyKey,
    description: `Converted ${pointsToConvert} points to a ₹${faceValueRupees} store coupon`,
  });

  const coupon = await issueStoreCoupon({
    memberId: memberObjectId,
    faceValuePaise,
    source: StoreCouponSource.POINTS_CONVERSION,
    sourceRef: debitRes.ledger._id.toString(),
    validityDays: config.validityDays,
    isEligibleForDraw: true,
    metadata: {
      pointsDebited: pointsToConvert,
      conversionRatio: config.pointsToRupeeRatio,
    },
  });

  return {
    coupon,
    pointsDebited: pointsToConvert,
    faceValuePaise,
  };
}

/**
 * Gets a member's points status and convertible coupon value.
 */
export async function getMemberPointsStatus(memberId: string | Types.ObjectId): Promise<{
  productPoints: number;
  equivalentRupees: number;
  minPointsToRedeem: number;
  stepPoints: number;
  canRedeem: boolean;
}> {
  const db = await getStoreDb();
  const WalletModel = getStoreWalletModel(db);
  const memberObjectId =
    typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;

  const wallet = await WalletModel.findOne({ member: memberObjectId }).lean();
  const points = wallet?.productPoints ?? 0;
  const config = currentPointsConfig;

  return {
    productPoints: points,
    equivalentRupees: Math.floor(points / config.pointsToRupeeRatio),
    minPointsToRedeem: config.minPointsToRedeem,
    stepPoints: config.stepPoints,
    canRedeem: points >= config.minPointsToRedeem,
  };
}
