import { Schema, Document, Connection, Types, Model } from "mongoose";

export enum LuckyDrawStatus {
  UPCOMING = "UPCOMING",
  ACTIVE = "ACTIVE",
  LOCKED = "LOCKED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface ILuckyDrawPrize {
  rank: number;
  prizeTitle: string;
  prizeDescription?: string;
  prizeValueRupees?: number;
  winnerCount: number;
}

export interface ILuckyDrawWinner {
  rank: number;
  prizeTitle: string;
  ticketNumber: string;
  member: Types.ObjectId;
  memberName?: string;
  memberPhone?: string;
  orderRef?: string;
  awardedAt: Date;
}

export interface ILuckyDrawSnapshot {
  takenAt: Date | null;
  totalEligibleTickets: number;
  snapshotHash: string | null;
  ticketNumbers: string[];
}

export interface IStoreLuckyDraw {
  drawCode: string;
  title: string;
  description: string;
  bannerUrl?: string;
  status: LuckyDrawStatus;
  minOrderAmountPaise: number;
  startDate: Date;
  endDate: Date;
  scheduledDrawDate: Date;
  prizes: ILuckyDrawPrize[];
  snapshot: ILuckyDrawSnapshot;
  winners: ILuckyDrawWinner[];
  randomSeed: string | null;
  drawnAt: Date | null;
  drawnBy: Types.ObjectId | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreLuckyDrawDoc extends IStoreLuckyDraw, Document {}

const PrizeSchema = new Schema<ILuckyDrawPrize>(
  {
    rank: { type: Number, required: true },
    prizeTitle: { type: String, required: true, trim: true },
    prizeDescription: { type: String, default: null },
    prizeValueRupees: { type: Number, default: 0 },
    winnerCount: { type: Number, required: true, default: 1, min: 1 },
  },
  { _id: false },
);

const WinnerSchema = new Schema<ILuckyDrawWinner>(
  {
    rank: { type: Number, required: true },
    prizeTitle: { type: String, required: true },
    ticketNumber: { type: String, required: true },
    member: { type: Schema.Types.ObjectId, ref: "StoreMember", required: true },
    memberName: { type: String, default: null },
    memberPhone: { type: String, default: null },
    orderRef: { type: String, default: null },
    awardedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SnapshotSchema = new Schema<ILuckyDrawSnapshot>(
  {
    takenAt: { type: Date, default: null },
    totalEligibleTickets: { type: Number, default: 0 },
    snapshotHash: { type: String, default: null },
    ticketNumbers: [{ type: String }],
  },
  { _id: false },
);

const StoreLuckyDrawSchema = new Schema<IStoreLuckyDrawDoc>(
  {
    drawCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    bannerUrl: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(LuckyDrawStatus),
      default: LuckyDrawStatus.UPCOMING,
      index: true,
    },
    minOrderAmountPaise: { type: Number, required: true, default: 99900 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    scheduledDrawDate: { type: Date, required: true },
    prizes: { type: [PrizeSchema], default: [] },
    snapshot: {
      type: SnapshotSchema,
      default: () => ({
        takenAt: null,
        totalEligibleTickets: 0,
        snapshotHash: null,
        ticketNumbers: [],
      }),
    },
    winners: { type: [WinnerSchema], default: [] },
    randomSeed: { type: String, default: null },
    drawnAt: { type: Date, default: null },
    drawnBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    cancellationReason: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

export function getStoreLuckyDrawModel(conn: Connection): Model<IStoreLuckyDrawDoc> {
  return conn.models.StoreLuckyDraw || conn.model<IStoreLuckyDrawDoc>("StoreLuckyDraw", StoreLuckyDrawSchema);
}
