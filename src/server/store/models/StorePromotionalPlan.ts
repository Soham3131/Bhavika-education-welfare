import { Schema, Document, Model, Connection } from "mongoose";

export interface IStorePromotionalPlan {
  planCode: string; // e.g. "PROMO_PLAN_850", "PROMO_PLAN_1500"
  name: string;
  description: string;
  pricePaise: number; // e.g. 85000 for ₹850, 150000 for ₹1,500
  productWalletBenefitPaise: number; // e.g. 100000 for ₹1,000, 200000 for ₹2,000
  superCouponCount: number; // 2 for Plan 1, 5 for Plan 2
  superCouponType: "SUPER" | "STANDARD" | "MINI";
  superCouponFaceValuePaise: number; // e.g. 50000 for ₹500
  pointsReward: number; // Configurable loyalty points reward
  commissionEligible: boolean; // Direct sponsor commission eligibility
  directCommissionPercentage: number;
  isPurchaseActive: boolean; // Mandatory guard: false until client confirms business rules
  validityDays: number;
  maxPurchasesPerMember: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStorePromotionalPlanDoc
  extends IStorePromotionalPlan,
    Document {}

export const StorePromotionalPlanSchema =
  new Schema<IStorePromotionalPlanDoc>(
    {
      planCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        default: "",
      },
      pricePaise: {
        type: Number,
        required: true,
        min: 0,
      },
      productWalletBenefitPaise: {
        type: Number,
        required: true,
        min: 0,
      },
      superCouponCount: {
        type: Number,
        required: true,
        min: 0,
      },
      superCouponType: {
        type: String,
        enum: ["SUPER", "STANDARD", "MINI"],
        default: "SUPER",
      },
      superCouponFaceValuePaise: {
        type: Number,
        default: 50000,
        min: 0,
      },
      pointsReward: {
        type: Number,
        default: 0,
        min: 0,
      },
      commissionEligible: {
        type: Boolean,
        default: false,
      },
      directCommissionPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      isPurchaseActive: {
        type: Boolean,
        default: false, // Strict safety requirement: purchases gated pending client confirmation
        index: true,
      },
      validityDays: {
        type: Number,
        default: 365,
        min: 1,
      },
      maxPurchasesPerMember: {
        type: Number,
        default: 1,
        min: 1,
      },
    },
    {
      timestamps: true,
      collection: "store_promotional_plans",
    },
  );

export function getStorePromotionalPlanModel(
  conn: Connection,
): Model<IStorePromotionalPlanDoc> {
  return (
    (conn.models.StorePromotionalPlan as Model<IStorePromotionalPlanDoc>) ||
    conn.model<IStorePromotionalPlanDoc>(
      "StorePromotionalPlan",
      StorePromotionalPlanSchema,
    )
  );
}
