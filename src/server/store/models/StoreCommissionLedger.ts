import { Schema, Document, Model, Connection, Types } from "mongoose";

export type CommissionType = "SALE_DIRECT" | "SALE_REVERSAL";
export type CommissionStatus =
  | "PENDING"
  | "PAYABLE"
  | "PAID"
  | "CANCELLED"
  | "REVERSED";

export interface IStoreCommissionLedger {
  memberId: Types.ObjectId; // Sponsor earning the commission
  sourceMemberId: Types.ObjectId; // Purchasing member
  orderRef: string;
  idempotencyKey: string;
  type: CommissionType;
  status: CommissionStatus;
  level: number; // Mandatory safeguard 3: strictly 1 (direct sponsor only)
  eligibleBasePaise: number;
  commissionRatePercentage: number;
  commissionAmountPaise: number;
  reversalReason?: string | null;
  originalCommissionId?: Types.ObjectId | null;
  settledAt?: Date | null;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreCommissionLedgerDoc
  extends IStoreCommissionLedger,
    Document {}

export const StoreCommissionLedgerSchema =
  new Schema<IStoreCommissionLedgerDoc>(
    {
      memberId: {
        type: Schema.Types.ObjectId,
        ref: "StoreMember",
        required: true,
        index: true,
      },
      sourceMemberId: {
        type: Schema.Types.ObjectId,
        ref: "StoreMember",
        required: true,
        index: true,
      },
      orderRef: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      idempotencyKey: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },
      type: {
        type: String,
        enum: ["SALE_DIRECT", "SALE_REVERSAL"],
        default: "SALE_DIRECT",
        required: true,
      },
      status: {
        type: String,
        enum: ["PENDING", "PAYABLE", "PAID", "CANCELLED", "REVERSED"],
        default: "PENDING",
        required: true,
        index: true,
      },
      level: {
        type: Number,
        required: true,
        default: 1,
        validate: {
          validator: (v: number) => v === 1,
          message: "Commission level must strictly be 1 (direct sponsor only).",
        },
      },
      eligibleBasePaise: {
        type: Number,
        required: true,
        min: 0,
      },
      commissionRatePercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      commissionAmountPaise: {
        type: Number,
        required: true,
        min: 0,
      },
      reversalReason: {
        type: String,
        default: null,
      },
      originalCommissionId: {
        type: Schema.Types.ObjectId,
        ref: "StoreCommissionLedger",
        default: null,
      },
      settledAt: {
        type: Date,
        default: null,
      },
      meta: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },
    {
      timestamps: true,
      collection: "store_commission_ledgers",
    },
  );

StoreCommissionLedgerSchema.index({ memberId: 1, createdAt: -1 });
StoreCommissionLedgerSchema.index({ orderRef: 1, type: 1 });

export function getStoreCommissionLedgerModel(
  conn: Connection,
): Model<IStoreCommissionLedgerDoc> {
  return (
    (conn.models.StoreCommissionLedger as Model<IStoreCommissionLedgerDoc>) ||
    conn.model<IStoreCommissionLedgerDoc>(
      "StoreCommissionLedger",
      StoreCommissionLedgerSchema,
    )
  );
}
