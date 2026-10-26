import crypto from "crypto";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStorePaymentAttemptModel,
  IStorePaymentAttemptDoc,
  PaymentAttemptStatus,
} from "../models/StorePaymentAttempt";

export interface VerifySignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  secret: string;
}

export interface VerifyWebhookParams {
  rawBody: string;
  signature: string;
  secret: string;
}

/**
 * Timing-safe HMAC verification for Razorpay checkout payment responses.
 * Razorpay format: HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature
 */
export function verifyRazorpaySignature(params: VerifySignatureParams): boolean {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, secret } =
    params;
  if (
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    !secret
  ) {
    return false;
  }

  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(razorpaySignature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Timing-safe HMAC verification for Razorpay webhook payloads.
 */
export function verifyRazorpayWebhookSignature(
  params: VerifyWebhookParams,
): boolean {
  const { rawBody, signature, secret } = params;
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Creates a recorded payment attempt for an order.
 * Tracks idempotency per attempt (`pay:${orderRef}:${attemptNumber}`).
 */
export async function createPaymentAttempt(params: {
  orderRef: string;
  orderId: string | Types.ObjectId;
  memberId: string | Types.ObjectId;
  attemptNumber: number;
  amountPaise: number;
  razorpayOrderId?: string;
}): Promise<IStorePaymentAttemptDoc> {
  const {
    orderRef,
    orderId,
    memberId,
    attemptNumber,
    amountPaise,
    razorpayOrderId,
  } = params;

  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error("attemptNumber must be an integer >= 1");
  }
  if (!Number.isInteger(amountPaise) || amountPaise < 1) {
    throw new Error("amountPaise must be an integer >= 1");
  }

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);
  const idempotencyKey = `pay:${orderRef}:${attemptNumber}`;

  // Check if this attempt already exists
  const existing = await PaymentAttempt.findOne({ idempotencyKey });
  if (existing) {
    return existing;
  }

  const attempt = new PaymentAttempt({
    orderRef,
    orderId: new Types.ObjectId(orderId.toString()),
    memberId: new Types.ObjectId(memberId.toString()),
    attemptNumber,
    idempotencyKey,
    gateway: "RAZORPAY",
    amountPaise,
    currency: "INR",
    razorpayOrderId,
    status: "CREATED",
  });

  return await attempt.save();
}

/**
 * Strictly restricted atomic state transition for payment attempts.
 * Transitions to SUCCESS are strictly permitted ONLY from ['CREATED', 'PENDING_CAPTURE'].
 * Terminal states (REFUNDED, FAILED, CANCELLED, EXPIRED) can never be overwritten to SUCCESS.
 */
export async function recordPaymentSuccess(params: {
  paymentAttemptId: string | Types.ObjectId;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  amountPaise?: number;
  currency?: string;
  rawWebhookPayload?: Record<string, unknown>;
}): Promise<{ attempt: IStorePaymentAttemptDoc; isReplay: boolean }> {
  const {
    paymentAttemptId,
    razorpayPaymentId,
    razorpaySignature,
    amountPaise,
    currency,
    rawWebhookPayload,
  } = params;

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);

  // Check current state for replay detection
  const current = await PaymentAttempt.findById(
    new Types.ObjectId(paymentAttemptId.toString()),
  );
  if (!current) {
    throw new Error(`Payment attempt ${paymentAttemptId.toString()} not found`);
  }

  // Idempotency: If already in SUCCESS, return existing document without re-executing
  if (current.status === "SUCCESS") {
    return { attempt: current, isReplay: true };
  }

  // Financial safety check: Verify payment amount and currency
  if (typeof amountPaise === "number" && amountPaise !== current.amountPaise) {
    throw new Error(
      `Payment amount mismatch: expected ${current.amountPaise} paise but received ${amountPaise} paise`,
    );
  }
  if (
    typeof currency === "string" &&
    currency.toUpperCase() !== current.currency.toUpperCase()
  ) {
    throw new Error(
      `Payment currency mismatch: expected ${current.currency} but received ${currency}`,
    );
  }

  // Disallow transition from terminal states
  const allowedSourceStates: PaymentAttemptStatus[] = [
    "CREATED",
    "PENDING_CAPTURE",
  ];
  if (!allowedSourceStates.includes(current.status)) {
    throw new Error(
      `Illegal payment state transition: cannot transition from terminal state '${current.status}' to 'SUCCESS'`,
    );
  }

  // Atomic update with state guard
  const updated = await PaymentAttempt.findOneAndUpdate(
    {
      _id: current._id,
      status: { $in: allowedSourceStates },
    },
    {
      $set: {
        status: "SUCCESS",
        razorpayPaymentId,
        razorpaySignature,
        webhookProcessedAt: new Date(),
        rawWebhookPayload,
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) {
    throw new Error(
      `Concurrent transition conflict: payment attempt ${paymentAttemptId.toString()} could not be transitioned to SUCCESS`,
    );
  }

  return { attempt: updated, isReplay: false };
}

/**
 * Marks a payment attempt as failed or cancelled with error details.
 */
export async function recordPaymentFailure(params: {
  paymentAttemptId: string | Types.ObjectId;
  errorDetails: string;
  status?: "FAILED" | "CANCELLED" | "EXPIRED";
}): Promise<IStorePaymentAttemptDoc> {
  const { paymentAttemptId, errorDetails, status = "FAILED" } = params;

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);

  const updated = await PaymentAttempt.findOneAndUpdate(
    {
      _id: new Types.ObjectId(paymentAttemptId.toString()),
      status: { $in: ["CREATED", "PENDING_CAPTURE"] },
    },
    {
      $set: {
        status,
        errorDetails,
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) {
    const existing = await PaymentAttempt.findById(
      new Types.ObjectId(paymentAttemptId.toString()),
    );
    if (!existing) {
      throw new Error(
        `Payment attempt ${paymentAttemptId.toString()} not found`,
      );
    }
    return existing;
  }

  return updated;
}

/**
 * Idempotent refund processor for payment attempts.
 * Only permits refunding attempts in SUCCESS or PARTIALLY_REFUNDED state.
 */
export async function processRefund(params: {
  paymentAttemptId: string | Types.ObjectId;
  refundAmountPaise: number;
  refundReason: string;
  idempotencyKey: string;
  rawWebhookPayload?: Record<string, unknown>;
}): Promise<{ attempt: IStorePaymentAttemptDoc; isReplay: boolean }> {
  const {
    paymentAttemptId,
    refundAmountPaise,
    refundReason,
    idempotencyKey,
    rawWebhookPayload,
  } = params;

  if (!Number.isInteger(refundAmountPaise) || refundAmountPaise <= 0) {
    throw new Error("refundAmountPaise must be a positive integer");
  }

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);

  const current = await PaymentAttempt.findById(
    new Types.ObjectId(paymentAttemptId.toString()),
  );
  if (!current) {
    throw new Error(`Payment attempt ${paymentAttemptId.toString()} not found`);
  }

  // Idempotency: if already REFUNDED, return replay
  if (current.status === "REFUNDED") {
    return { attempt: current, isReplay: true };
  }

  const allowedSourceStates: PaymentAttemptStatus[] = [
    "SUCCESS",
    "PARTIALLY_REFUNDED",
  ];
  if (!allowedSourceStates.includes(current.status)) {
    throw new Error(
      `Cannot refund payment attempt in '${current.status}' state: must be in SUCCESS or PARTIALLY_REFUNDED`,
    );
  }

  if (refundAmountPaise > current.amountPaise) {
    throw new Error(
      `Refund amount (${refundAmountPaise}) cannot exceed payment attempt amount (${current.amountPaise})`,
    );
  }

  const targetStatus: PaymentAttemptStatus =
    refundAmountPaise === current.amountPaise
      ? "REFUNDED"
      : "PARTIALLY_REFUNDED";

  const updated = await PaymentAttempt.findOneAndUpdate(
    {
      _id: current._id,
      status: { $in: allowedSourceStates },
    },
    {
      $set: {
        status: targetStatus,
        errorDetails: `Refund: ${refundReason} (Key: ${idempotencyKey})`,
        rawWebhookPayload,
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) {
    throw new Error(
      `Concurrent transition conflict: refund could not be applied to payment attempt ${paymentAttemptId.toString()}`,
    );
  }

  return { attempt: updated, isReplay: false };
}
