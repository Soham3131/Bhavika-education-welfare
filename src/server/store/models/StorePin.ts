import { Schema, Document, Connection, Types, Model } from "mongoose";

export enum PinStatus {
  ACTIVE = "ACTIVE",
  REDEEMED = "REDEEMED",
  TRANSFERRED = "TRANSFERRED",
  CANCELLED = "CANCELLED",
}

export enum PinTier {
  AREA = "AREA",
  CHIEF = "CHIEF",
}

export interface IPinTransferRecord {
  fromMember: Types.ObjectId;
  toMember: Types.ObjectId;
  transferredAt: Date;
  note?: string | null;
}

export interface IStorePin {
  pinCode: string;
  tier: PinTier;
  faceValuePaise: number;
  status: PinStatus;
  ownerMember: Types.ObjectId;
  purchaserMember: Types.ObjectId;
  redeemedByMember?: Types.ObjectId | null;
  redeemedAt?: Date | null;
  transferHistory: IPinTransferRecord[];
  purchaseWalletTxId?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStorePinDoc extends IStorePin, Document {}

const PinTransferSchema = new Schema<IPinTransferRecord>(
  {
    fromMember: { type: Schema.Types.ObjectId, ref: "StoreMember", required: true },
    toMember: { type: Schema.Types.ObjectId, ref: "StoreMember", required: true },
    transferredAt: { type: Date, default: Date.now },
    note: { type: String, default: null },
  },
  { _id: false },
);

const StorePinSchema = new Schema<IStorePinDoc>(
  {
    pinCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    tier: {
      type: String,
      enum: Object.values(PinTier),
      required: true,
      index: true,
    },
    faceValuePaise: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(PinStatus),
      default: PinStatus.ACTIVE,
      index: true,
    },
    ownerMember: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    purchaserMember: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    redeemedByMember: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      default: null,
      index: true,
    },
    redeemedAt: { type: Date, default: null },
    transferHistory: { type: [PinTransferSchema], default: [] },
    purchaseWalletTxId: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

export function getStorePinModel(conn: Connection): Model<IStorePinDoc> {
  return conn.models.StorePin || conn.model<IStorePinDoc>("StorePin", StorePinSchema);
}
