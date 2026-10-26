import { Schema, Document, Connection, Types, Model } from "mongoose";

export enum EmiStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  DEFAULTED = "DEFAULTED",
}

export enum InstalmentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  WAIVED_BY_PRIZE_WIN = "WAIVED_BY_PRIZE_WIN",
}

export interface IEmiInstalment {
  instalmentNumber: number;
  dueDate: Date;
  amountPaise: number;
  status: InstalmentStatus;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  walletTxId?: string | null;
  couponIssuedId?: Types.ObjectId | null;
  waivedAt?: Date | null;
  waiverReason?: string | null;
}

export interface IStoreEmiSchedule {
  emiRef: string;
  order: Types.ObjectId;
  orderRef: string;
  member: Types.ObjectId;
  totalPrincipalPaise: number;
  totalInstalments: number;
  monthlyAmountPaise: number;
  status: EmiStatus;
  instalments: IEmiInstalment[];
  paidInstalmentsCount: number;
  waivedInstalmentsCount: number;
  winnerStopsEmiApplied: boolean;
  winnerStopsEmiRef?: string | null;
  cancellationRequested: boolean;
  cancellationReason?: string | null;
  cancellationApprovedBy?: Types.ObjectId | null;
  cancellationApprovedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreEmiScheduleDoc extends IStoreEmiSchedule, Document {}

const InstalmentSchema = new Schema<IEmiInstalment>(
  {
    instalmentNumber: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amountPaise: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(InstalmentStatus),
      default: InstalmentStatus.PENDING,
    },
    paidAt: { type: Date, default: null },
    paymentMethod: { type: String, default: null },
    walletTxId: { type: String, default: null },
    couponIssuedId: { type: Schema.Types.ObjectId, ref: "StoreCoupon", default: null },
    waivedAt: { type: Date, default: null },
    waiverReason: { type: String, default: null },
  },
  { _id: false },
);

const StoreEmiScheduleSchema = new Schema<IStoreEmiScheduleDoc>(
  {
    emiRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    order: { type: Schema.Types.ObjectId, ref: "StoreOrder", required: true, index: true },
    orderRef: { type: String, required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: "StoreMember", required: true, index: true },
    totalPrincipalPaise: { type: Number, required: true },
    totalInstalments: { type: Number, required: true },
    monthlyAmountPaise: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(EmiStatus),
      default: EmiStatus.ACTIVE,
      index: true,
    },
    instalments: { type: [InstalmentSchema], default: [] },
    paidInstalmentsCount: { type: Number, default: 0 },
    waivedInstalmentsCount: { type: Number, default: 0 },
    winnerStopsEmiApplied: { type: Boolean, default: false },
    winnerStopsEmiRef: { type: String, default: null },
    cancellationRequested: { type: Boolean, default: false },
    cancellationReason: { type: String, default: null },
    cancellationApprovedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    cancellationApprovedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

export function getStoreEmiScheduleModel(conn: Connection): Model<IStoreEmiScheduleDoc> {
  return conn.models.StoreEmiSchedule || conn.model<IStoreEmiScheduleDoc>("StoreEmiSchedule", StoreEmiScheduleSchema);
}
