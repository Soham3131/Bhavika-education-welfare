import { Schema, Document, Model, Connection, Types } from "mongoose";

export const WithdrawalStatus = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  PAID: "PAID",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
} as const;

export type WithdrawalStatus =
  (typeof WithdrawalStatus)[keyof typeof WithdrawalStatus];

export interface IStoreWithdrawalRequest {
  withdrawalRef: string;
  member: Types.ObjectId;
  walletType: "FREE_REFERRAL" | "PAID_REFERRAL";
  amountPaise: number;
  status: WithdrawalStatus;
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  };
  adminNotes?: string | null;
  rejectionReason?: string | null;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  processedAt?: Date | null;
  paidAt?: Date | null;
  rejectedAt?: Date | null;
  payoutProvider?: string | null;
  providerPayoutRef?: string | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreWithdrawalRequestDoc
  extends IStoreWithdrawalRequest,
    Document {}

export const StoreWithdrawalRequestSchema =
  new Schema<IStoreWithdrawalRequestDoc>(
    {
      withdrawalRef: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },
      member: {
        type: Schema.Types.ObjectId,
        ref: "StoreMember",
        required: true,
        index: true,
      },
      walletType: {
        type: String,
        enum: ["FREE_REFERRAL", "PAID_REFERRAL"],
        required: true,
      },
      amountPaise: {
        type: Number,
        required: true,
        min: 100,
      },
      status: {
        type: String,
        enum: Object.values(WithdrawalStatus),
        default: WithdrawalStatus.REQUESTED,
        index: true,
      },
      bankDetails: {
        accountHolderName: { type: String, required: true, trim: true },
        accountNumber: { type: String, required: true, trim: true },
        ifscCode: { type: String, required: true, uppercase: true, trim: true },
        bankName: { type: String, required: true, trim: true },
      },
      adminNotes: { type: String, default: null },
      rejectionReason: { type: String, default: null },
      approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
      approvedAt: { type: Date, default: null },
      processedAt: { type: Date, default: null },
      paidAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null },
      payoutProvider: {
        type: String,
        default: "MANUAL_HOLD_NO_PROVIDER_CONFIGURED",
      },
      providerPayoutRef: { type: String, default: null },
      idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },
    },
    {
      timestamps: true,
      collection: "store_withdrawal_requests",
    },
  );

StoreWithdrawalRequestSchema.index({ member: 1, status: 1 });
StoreWithdrawalRequestSchema.index({ status: 1, createdAt: -1 });

// Atomic database-level guarantee: A member can have at most ONE active pending withdrawal
StoreWithdrawalRequestSchema.index(
  { member: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [WithdrawalStatus.REQUESTED, WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING] },
    },
    name: "unique_active_withdrawal_per_member",
  },
);

export function getStoreWithdrawalRequestModel(
  conn: Connection,
): Model<IStoreWithdrawalRequestDoc> {
  return (
    (conn.models.StoreWithdrawalRequest as Model<IStoreWithdrawalRequestDoc>) ||
    conn.model<IStoreWithdrawalRequestDoc>(
      "StoreWithdrawalRequest",
      StoreWithdrawalRequestSchema,
    )
  );
}
