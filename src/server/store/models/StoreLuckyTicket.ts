import { Schema, Document, Connection, Types, Model } from "mongoose";

export enum LuckyTicketStatus {
  ISSUED = "ISSUED",
  WON = "WON",
  NOT_SELECTED = "NOT_SELECTED",
  VOIDED = "VOIDED",
}

export interface IStoreLuckyTicket {
  ticketNumber: string;
  luckyDraw: Types.ObjectId;
  member: Types.ObjectId;
  orderRef: string;
  status: LuckyTicketStatus;
  prizeWon?: string | null;
  rankWon?: number | null;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreLuckyTicketDoc extends IStoreLuckyTicket, Document {}

const StoreLuckyTicketSchema = new Schema<IStoreLuckyTicketDoc>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    luckyDraw: {
      type: Schema.Types.ObjectId,
      ref: "StoreLuckyDraw",
      required: true,
      index: true,
    },
    member: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    orderRef: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(LuckyTicketStatus),
      default: LuckyTicketStatus.ISSUED,
      index: true,
    },
    prizeWon: { type: String, default: null },
    rankWon: { type: Number, default: null },
    issuedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

export function getStoreLuckyTicketModel(conn: Connection): Model<IStoreLuckyTicketDoc> {
  return conn.models.StoreLuckyTicket || conn.model<IStoreLuckyTicketDoc>("StoreLuckyTicket", StoreLuckyTicketSchema);
}
