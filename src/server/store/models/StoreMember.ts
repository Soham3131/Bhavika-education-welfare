import { Schema, Document, Model, Connection } from "mongoose";

export type StoreMemberTier = "FREE" | "AREA" | "CHIEF";
export type StoreMemberStatus = "ACTIVE" | "BLOCKED" | "SUSPENDED";

export interface IStoreMember {
  memberId: string;
  sponsorId: string | null;
  sponsorPath: string[];
  name: string;
  phone: string;
  email?: string | null;
  passwordHash: string;
  tier: StoreMemberTier;
  tierExpiresAt: Date | null;
  status: StoreMemberStatus;
  lifetimePaidPaise: number;
  highestSingleOrderPaise: number;
  totalDirectSalesPaise: number;
  directReferralCount: number;
  hasPurchasedOnboardingKit: boolean;
  hasPinPrivilege: boolean;
  pinPrivilegeExpiresAt: Date | null;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreMemberDoc extends IStoreMember, Document {}

export const StoreMemberSchema = new Schema<IStoreMemberDoc>(
  {
    memberId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    sponsorId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },
    sponsorPath: {
      type: [String],
      default: [],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    tier: {
      type: String,
      enum: ["FREE", "AREA", "CHIEF"],
      default: "FREE",
      index: true,
    },
    tierExpiresAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
    lifetimePaidPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    highestSingleOrderPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDirectSalesPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    directReferralCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    hasPurchasedOnboardingKit: {
      type: Boolean,
      default: false,
    },
    hasPinPrivilege: {
      type: Boolean,
      default: false,
    },
    pinPrivilegeExpiresAt: {
      type: Date,
      default: null,
    },
    sessionVersion: {
      type: Number,
      default: 1,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "store_members",
  },
);

export function getStoreMemberModel(conn: Connection): Model<IStoreMemberDoc> {
  return (conn.models.StoreMember as Model<IStoreMemberDoc>) || conn.model<IStoreMemberDoc>("StoreMember", StoreMemberSchema);
}
