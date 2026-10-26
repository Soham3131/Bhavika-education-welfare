import { Schema, Document, Model, Connection, Types } from "mongoose";

export type StoreWalletType =
  | "ADD_MONEY"
  | "MEMBER_ACTIVATION"
  | "PRODUCT_POINT"
  | "FREE_REFERRAL"
  | "PAID_REFERRAL"
  | "RECHARGE"
  | "COUPON";

export type StoreLedgerTxType = "CREDIT" | "DEBIT";
export type StoreLedgerUnit = "INR_PAISE" | "LOYALTY_POINT";

export type StoreLedgerRefType =
  | "PAYMENT_GATEWAY_TOPUP"
  | "ORDER_CHECKOUT"
  | "ORDER_REFUND"
  | "MEMBER_ACTIVATION_FEE"
  | "PRODUCT_LOYALTY_REWARD"
  | "REFERRAL_COMMISSION"
  | "RECHARGE_SUBMISSION"
  | "RECHARGE_REVERSAL"
  | "COUPON_CONVERSION"
  | "BANK_PAYOUT"
  | "ADMIN_CORRECTION";

export interface IStoreWalletLedger {
  member: Types.ObjectId;
  walletType: StoreWalletType;
  type: StoreLedgerTxType;
  unit: StoreLedgerUnit;
  amountPaise: number | null;
  pointsDelta: number | null;
  balanceAfterPaise: number | null;
  pointsAfter: number | null;
  referenceType: StoreLedgerRefType;
  referenceId: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface IStoreWalletLedgerDoc extends IStoreWalletLedger, Document {}

export const StoreWalletLedgerSchema = new Schema<IStoreWalletLedgerDoc>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    walletType: {
      type: String,
      enum: [
        "ADD_MONEY",
        "MEMBER_ACTIVATION",
        "PRODUCT_POINT",
        "FREE_REFERRAL",
        "PAID_REFERRAL",
        "RECHARGE",
        "COUPON",
      ],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    unit: {
      type: String,
      enum: ["INR_PAISE", "LOYALTY_POINT"],
      required: true,
    },
    amountPaise: {
      type: Number,
      default: null,
      validate: {
        validator(this: unknown, v: number | null) {
          const doc = this as { unit?: StoreLedgerUnit };
          if (doc && doc.unit === "INR_PAISE") {
            return typeof v === "number" && Number.isInteger(v) && v > 0;
          }
          return v === null || v === 0;
        },
        message: "amountPaise must be a positive integer when unit is INR_PAISE, or null/0 otherwise",
      },
    },
    pointsDelta: {
      type: Number,
      default: null,
      validate: {
        validator(this: unknown, v: number | null) {
          const doc = this as { unit?: StoreLedgerUnit };
          if (doc && doc.unit === "LOYALTY_POINT") {
            return typeof v === "number" && Number.isInteger(v) && v > 0;
          }
          return v === null || v === 0;
        },
        message: "pointsDelta must be a positive integer when unit is LOYALTY_POINT, or null/0 otherwise",
      },
    },
    balanceAfterPaise: {
      type: Number,
      default: null,
    },
    pointsAfter: {
      type: Number,
      default: null,
    },
    referenceType: {
      type: String,
      enum: [
        "PAYMENT_GATEWAY_TOPUP",
        "ORDER_CHECKOUT",
        "ORDER_REFUND",
        "MEMBER_ACTIVATION_FEE",
        "PRODUCT_LOYALTY_REWARD",
        "REFERRAL_COMMISSION",
        "RECHARGE_SUBMISSION",
        "RECHARGE_REVERSAL",
        "COUPON_CONVERSION",
        "BANK_PAYOUT",
        "ADMIN_CORRECTION",
      ],
      required: true,
    },
    referenceId: {
      type: String,
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "store_wallet_ledgers",
  },
);

StoreWalletLedgerSchema.index({ member: 1, walletType: 1, createdAt: -1 });
StoreWalletLedgerSchema.index({ referenceType: 1, referenceId: 1 });

export function getStoreWalletLedgerModel(conn: Connection): Model<IStoreWalletLedgerDoc> {
  return (conn.models.StoreWalletLedger as Model<IStoreWalletLedgerDoc>) || conn.model<IStoreWalletLedgerDoc>("StoreWalletLedger", StoreWalletLedgerSchema);
}
