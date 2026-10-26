import { Schema, Document, Model, Connection, Types } from "mongoose";

export type PaymentAttemptStatus =
  | "CREATED"
  | "PENDING_CAPTURE"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "DISPUTED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "EXPIRED";

export interface IStorePaymentAttempt {
  orderRef: string;
  orderId: Types.ObjectId;
  memberId: Types.ObjectId;
  attemptNumber: number;
  idempotencyKey: string;
  gateway: "RAZORPAY";
  amountPaise: number;
  currency: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentAttemptStatus;
  errorDetails?: string;
  webhookProcessedAt?: Date;
  rawWebhookPayload?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStorePaymentAttemptDoc
  extends IStorePaymentAttempt,
    Document {}

export const StorePaymentAttemptSchema = new Schema<IStorePaymentAttemptDoc>(
  {
    orderRef: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "StoreOrder",
      required: true,
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "attemptNumber must be an integer",
      },
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: ["RAZORPAY"],
      default: "RAZORPAY",
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "amountPaise must be an integer",
      },
    },
    currency: {
      type: String,
      default: "INR",
      required: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "CREATED",
        "PENDING_CAPTURE",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
        "DISPUTED",
        "REFUND_PENDING",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
        "EXPIRED",
      ],
      default: "CREATED",
      required: true,
      index: true,
    },
    errorDetails: {
      type: String,
    },
    webhookProcessedAt: {
      type: Date,
    },
    rawWebhookPayload: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: "store_payment_attempts",
  },
);

StorePaymentAttemptSchema.index(
  { orderRef: 1, attemptNumber: 1 },
  { unique: true },
);

export function getStorePaymentAttemptModel(
  conn: Connection,
): Model<IStorePaymentAttemptDoc> {
  return (
    (conn.models.StorePaymentAttempt as Model<IStorePaymentAttemptDoc>) ||
    conn.model<IStorePaymentAttemptDoc>(
      "StorePaymentAttempt",
      StorePaymentAttemptSchema,
    )
  );
}
