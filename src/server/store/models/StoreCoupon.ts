import { Schema, Document, Model, Connection, Types } from "mongoose";

export const StoreCouponSource = {
  FREE_REGISTRATION: "FREE_REGISTRATION",
  ORDER_PURCHASE: "ORDER_PURCHASE",
  POINTS_CONVERSION: "POINTS_CONVERSION",
  RECHARGE: "RECHARGE",
  PIN_PURCHASE: "PIN_PURCHASE",
  EMI_INSTALMENT: "EMI_INSTALMENT",
  ADMIN_GRANT: "ADMIN_GRANT",
  REFERRAL_REWARD: "REFERRAL_REWARD",
} as const;

export type StoreCouponSource =
  (typeof StoreCouponSource)[keyof typeof StoreCouponSource];

export const StoreCouponStatus = {
  ACTIVE: "ACTIVE",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  TRANSFERRED: "TRANSFERRED",
} as const;

export type StoreCouponStatus =
  (typeof StoreCouponStatus)[keyof typeof StoreCouponStatus];

export interface IStoreCoupon {
  couponCode: string;
  member: Types.ObjectId;
  faceValuePaise: number;
  source: StoreCouponSource;
  sourceRef?: string | null;
  status: StoreCouponStatus;
  expiresAt: Date;
  redeemedAt?: Date | null;
  redeemedOrderRef?: string | null;
  isEligibleForDraw: boolean;
  transferredToMember?: Types.ObjectId | null;
  transferredAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreCouponDoc extends IStoreCoupon, Document {}

export const StoreCouponSchema = new Schema<IStoreCouponDoc>(
  {
    couponCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    member: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    faceValuePaise: {
      type: Number,
      required: true,
      min: 1,
    },
    source: {
      type: String,
      required: true,
      enum: Object.values(StoreCouponSource),
      index: true,
    },
    sourceRef: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(StoreCouponStatus),
      default: StoreCouponStatus.ACTIVE,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
    redeemedOrderRef: {
      type: String,
      default: null,
      index: true,
    },
    isEligibleForDraw: {
      type: Boolean,
      default: true,
      index: true,
    },
    transferredToMember: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      default: null,
    },
    transferredAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

StoreCouponSchema.index({ member: 1, status: 1 });
StoreCouponSchema.index({ status: 1, expiresAt: 1 });
StoreCouponSchema.index({ source: 1, sourceRef: 1 });

export function getStoreCouponModel(
  conn: Connection,
): Model<IStoreCouponDoc> {
  return (
    (conn.models.StoreCoupon as Model<IStoreCouponDoc>) ||
    conn.model<IStoreCouponDoc>("StoreCoupon", StoreCouponSchema)
  );
}
