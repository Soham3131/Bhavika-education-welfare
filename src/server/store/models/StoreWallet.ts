import { Schema, Document, Model, Connection, Types } from "mongoose";

export interface IStoreWallet {
  member: Types.ObjectId;
  addMoneyPaise: number;
  memberActivationPaise: number;
  productPoints: number;
  freeReferralPaise: number;
  paidReferralPaise: number;
  rechargePaise: number;
  /**
   * Derived valuation cache of active native coupons held by the member.
   * This is NOT an independently spendable monetary pool.
   */
  couponWalletPaise: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreWalletDoc extends IStoreWallet, Document {}

export const StoreWalletSchema = new Schema<IStoreWalletDoc>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      unique: true,
      index: true,
    },
    addMoneyPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    memberActivationPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    productPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    freeReferralPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidReferralPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    rechargePaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    couponWalletPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "store_wallets",
  },
);

export function getStoreWalletModel(conn: Connection): Model<IStoreWalletDoc> {
  return (conn.models.StoreWallet as Model<IStoreWalletDoc>) || conn.model<IStoreWalletDoc>("StoreWallet", StoreWalletSchema);
}
