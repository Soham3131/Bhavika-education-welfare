import { Schema, Document, Model, Connection } from "mongoose";
import { StoreMemberTier } from "./StoreMember";

export type MembershipPlanStatus = "FINAL" | "DEV-CONFIRMED" | "PROPOSED";

export interface IStoreMembershipPlan {
  tier: StoreMemberTier;
  name: string;
  description: string;
  annualFeePaise: number;
  monthlyFeePaise: number;
  isFeeRequired: boolean; // Safeguard: keep false unless approved
  qualificationThresholdPaise: number; // e.g. 200000 paise (Rs 2000) for Paid
  productDiscountPercentage: number; // e.g. 0% Free, 5% Area, 10% Chief
  directReferralCommissionPercentage: number; // e.g. 0% Free, 5% Area, 8% Chief
  status: MembershipPlanStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreMembershipPlanDoc
  extends IStoreMembershipPlan,
    Document {}

export const StoreMembershipPlanSchema = new Schema<IStoreMembershipPlanDoc>(
  {
    tier: {
      type: String,
      enum: ["FREE", "AREA", "CHIEF"],
      required: true,
      unique: true,
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
    annualFeePaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthlyFeePaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    isFeeRequired: {
      type: Boolean,
      default: false, // Mandatory safeguard 1: unapproved fee charges stay disabled
    },
    qualificationThresholdPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    productDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    directReferralCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["FINAL", "DEV-CONFIRMED", "PROPOSED"],
      default: "PROPOSED",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "store_membership_plans",
  },
);

export function getStoreMembershipPlanModel(
  conn: Connection,
): Model<IStoreMembershipPlanDoc> {
  return (
    (conn.models.StoreMembershipPlan as Model<IStoreMembershipPlanDoc>) ||
    conn.model<IStoreMembershipPlanDoc>(
      "StoreMembershipPlan",
      StoreMembershipPlanSchema,
    )
  );
}
