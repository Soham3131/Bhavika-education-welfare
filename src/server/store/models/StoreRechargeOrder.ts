import { Schema, Document, Model, Connection, Types } from "mongoose";

export const RechargeServiceType = {
  MOBILE_PREPAID: "MOBILE_PREPAID",
  DTH: "DTH",
  FASTAG: "FASTAG",
  ELECTRICITY: "ELECTRICITY",
  GAS: "GAS",
  WATER: "WATER",
} as const;

export type RechargeServiceType =
  (typeof RechargeServiceType)[keyof typeof RechargeServiceType];

export const RechargeStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  SUBMITTED_TO_PROVIDER: "SUBMITTED_TO_PROVIDER",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
} as const;

export type RechargeStatus =
  (typeof RechargeStatus)[keyof typeof RechargeStatus];

export const RechargeCommissionStatus = {
  NONE: "NONE",
  CREDITED: "CREDITED",
  REVERSED: "REVERSED",
} as const;

export type RechargeCommissionStatus =
  (typeof RechargeCommissionStatus)[keyof typeof RechargeCommissionStatus];

export interface IStoreRechargeOrder {
  rechargeRef: string;
  member: Types.ObjectId;
  serviceType: RechargeServiceType;
  operator: string;
  consumerNumber: string;
  circle?: string | null;
  amountPaise: number;
  status: RechargeStatus;
  providerName: string;
  providerRef?: string | null;
  providerPayoutPaise: number;
  memberCommissionPaise: number;
  commissionStatus: RechargeCommissionStatus;
  paymentMethod: "WALLET" | "ONLINE";
  failureReason?: string | null;
  reconciledAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreRechargeOrderDoc extends IStoreRechargeOrder, Document {}

export const StoreRechargeOrderSchema = new Schema<IStoreRechargeOrderDoc>(
  {
    rechargeRef: {
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
    serviceType: {
      type: String,
      required: true,
      enum: Object.values(RechargeServiceType),
      index: true,
    },
    operator: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    consumerNumber: {
      type: String,
      required: true,
      trim: true,
    },
    circle: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 100, // min ₹1
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(RechargeStatus),
      default: RechargeStatus.PENDING_PAYMENT,
      index: true,
    },
    providerName: {
      type: String,
      required: true,
      default: "MOCK_PROVIDER",
    },
    providerRef: {
      type: String,
      default: null,
      index: true,
    },
    providerPayoutPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    memberCommissionPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionStatus: {
      type: String,
      required: true,
      enum: Object.values(RechargeCommissionStatus),
      default: RechargeCommissionStatus.NONE,
      index: true,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["WALLET", "ONLINE"],
      default: "WALLET",
    },
    failureReason: {
      type: String,
      default: null,
    },
    reconciledAt: {
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

StoreRechargeOrderSchema.index({ member: 1, createdAt: -1 });
StoreRechargeOrderSchema.index({ status: 1, createdAt: 1 });

export function getStoreRechargeOrderModel(
  conn: Connection,
): Model<IStoreRechargeOrderDoc> {
  return (
    (conn.models.StoreRechargeOrder as Model<IStoreRechargeOrderDoc>) ||
    conn.model<IStoreRechargeOrderDoc>(
      "StoreRechargeOrder",
      StoreRechargeOrderSchema,
    )
  );
}
