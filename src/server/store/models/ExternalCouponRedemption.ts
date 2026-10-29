import { Schema, Document, Model, Connection, Types } from "mongoose";

export type ExternalCouponStatus =
  | "VALIDATED"
  | "PENDING_REDEEM"
  | "REDEEMED"
  | "FAILED"
  | "REVERSED";

export interface IExternalCouponRedemption {
  orderRef: string;
  orderId?: Types.ObjectId;
  memberId: Types.ObjectId;
  code: string;
  status: ExternalCouponStatus;
  valueRupees: number;
  valuePaise: number;
  discountAppliedPaise: number;
  validatedAt?: Date;
  redeemedAt?: Date;
  isReplay: boolean;
  lastRedeemError?: string;
  failureCategory?: "DEFINITIVE_REJECTION" | "AMBIGUOUS_TIMEOUT";
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExternalCouponRedemptionDoc
  extends IExternalCouponRedemption,
    Document {}

export const ExternalCouponRedemptionSchema =
  new Schema<IExternalCouponRedemptionDoc>(
    {
      orderRef: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "StoreOrder",
        index: true,
      },
      memberId: {
        type: Schema.Types.ObjectId,
        ref: "StoreMember",
        required: true,
        index: true,
      },
      code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true,
      },
      status: {
        type: String,
        enum: [
          "VALIDATED",
          "PENDING_REDEEM",
          "REDEEMED",
          "FAILED",
          "REVERSED",
        ],
        required: true,
        default: "VALIDATED",
        index: true,
      },
      valueRupees: {
        type: Number,
        required: true,
        min: 0,
      },
      valuePaise: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: Number.isInteger,
          message: "valuePaise must be an integer",
        },
      },
      discountAppliedPaise: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: Number.isInteger,
          message: "discountAppliedPaise must be an integer",
        },
      },
      validatedAt: {
        type: Date,
      },
      redeemedAt: {
        type: Date,
      },
      isReplay: {
        type: Boolean,
        default: false,
      },
      lastRedeemError: {
        type: String,
      },
      failureCategory: {
        type: String,
        enum: ["DEFINITIVE_REJECTION", "AMBIGUOUS_TIMEOUT"],
      },
      metadata: {
        type: Schema.Types.Mixed,
      },
    },
    {
      timestamps: true,
      collection: "store_external_coupon_redemptions",
    },
  );

// Prevent the same Bhavika coupon from being registered multiple times on the same order
ExternalCouponRedemptionSchema.index(
  { orderRef: 1, code: 1 },
  { unique: true },
);
ExternalCouponRedemptionSchema.index({ memberId: 1, status: 1 });

export function getExternalCouponRedemptionModel(
  conn: Connection,
): Model<IExternalCouponRedemptionDoc> {
  return (
    (conn.models.ExternalCouponRedemption as Model<IExternalCouponRedemptionDoc>) ||
    conn.model<IExternalCouponRedemptionDoc>(
      "ExternalCouponRedemption",
      ExternalCouponRedemptionSchema,
    )
  );
}
