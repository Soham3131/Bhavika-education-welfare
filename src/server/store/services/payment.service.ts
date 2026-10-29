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
  razorpayRefundId?: string;
  rawWebhookPayload?: Record<string, unknown>;
}): Promise<{ attempt: IStorePaymentAttemptDoc; isReplay: boolean }> {
  const {
    paymentAttemptId,
    refundAmountPaise,
    refundReason,
    idempotencyKey,
    razorpayRefundId,
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

  // Idempotency: if already REFUNDED, check for conflicting payload
  if (current.status === "REFUNDED") {
    if (current.refundAmountPaise && current.refundAmountPaise !== refundAmountPaise) {
      throw new Error(
        `Conflicting refund payload: payment attempt ${current._id.toString()} was already refunded for ${current.refundAmountPaise} paise, but requested ${refundAmountPaise} paise`,
      );
    }
    return { attempt: current, isReplay: true };
  }

  const allowedSourceStates: PaymentAttemptStatus[] = [
    "SUCCESS",
    "REFUND_PENDING",
    "PARTIALLY_REFUNDED",
  ];
  if (!allowedSourceStates.includes(current.status)) {
    throw new Error(
      `Cannot refund payment attempt in '${current.status}' state: must be in SUCCESS, REFUND_PENDING or PARTIALLY_REFUNDED`,
    );
  }

  const previousRefunded = current.status === "PARTIALLY_REFUNDED" ? (current.refundAmountPaise || 0) : 0;
  const newTotalRefunded = previousRefunded + refundAmountPaise;

  if (newTotalRefunded > current.amountPaise) {
    throw new Error(
      `Refund amount (${newTotalRefunded}) cannot exceed payment attempt amount (${current.amountPaise})`,
    );
  }

  const targetStatus: PaymentAttemptStatus =
    newTotalRefunded >= current.amountPaise
      ? "REFUNDED"
      : "PARTIALLY_REFUNDED";

  const updateSet: Record<string, unknown> = {
    status: targetStatus,
    refundAmountPaise: newTotalRefunded,
    errorDetails: `Refund: ${refundReason} (Key: ${idempotencyKey})`,
    rawWebhookPayload,
  };
  if (razorpayRefundId) {
    updateSet.razorpayRefundId = razorpayRefundId;
  }

  const updated = await PaymentAttempt.findOneAndUpdate(
    {
      _id: current._id,
      status: { $in: allowedSourceStates },
    },
    {
      $set: updateSet,
    },
    { returnDocument: "after" },
  );

  if (!updated) {
    // Check if a concurrent worker already transitioned it to REFUNDED
    const recheck = await PaymentAttempt.findById(current._id);
    if (recheck && (recheck.status === "REFUNDED" || recheck.status === "PARTIALLY_REFUNDED")) {
      return { attempt: recheck, isReplay: true };
    }
    throw new Error(
      `Concurrent transition conflict: refund could not be applied to payment attempt ${paymentAttemptId.toString()}`,
    );
  }

  return { attempt: updated, isReplay: false };
}

export type RefundGatewayFn = (params: {
  paymentId: string;
  amountPaise: number;
  idempotencyKey: string;
  reason?: string;
  notes?: Record<string, string>;
  existingRefundId?: string;
}) => Promise<{
  success: boolean;
  refundId?: string;
  providerStatus?: "processed" | "pending" | "failed";
  isReplay?: boolean;
  error?: string;
  failureCategory?: "DEFINITIVE_REJECTION" | "AMBIGUOUS_TIMEOUT";
}>;

/**
 * Reconciles and executes a refund for a payment attempt against the payment gateway (Razorpay).
 * Guarantees idempotency via documented X-Refund-Idempotency header.
 *
 * Full Lifecycle Guarantee:
 * - When provider returns "failed": auditable history preserved, attempt flagged, obligation remains visible.
 * - Background sweep skips repeatedly resubmitting terminal failed refunds.
 * - Explicit retry (initiateNewCycle: true) safely creates a genuinely new refund with incremented cycle key.
 * - Retries of an unconfirmed/pending refund reuse the original key and query by refundId rather than creating duplicate POSTs.
 * - An ambiguous timeout is reconciled before any new refund cycle is permitted.
 * - Cumulative confirmed refunds never exceed captured or owed amounts.
 */
export async function reconcilePaymentRefund(params: {
  paymentAttemptId: string | Types.ObjectId;
  refundAmountPaise?: number;
  refundReason?: string;
  refundGateway?: RefundGatewayFn;
  initiateNewCycle?: boolean;
}): Promise<{
  attempt: IStorePaymentAttemptDoc;
  status: "REFUNDED" | "REFUND_PENDING" | "PARTIALLY_REFUNDED" | "FAILED";
  isReplay: boolean;
  refundId?: string;
  providerStatus?: "processed" | "pending" | "failed";
  error?: string;
}> {
  const {
    paymentAttemptId,
    refundAmountPaise,
    refundReason = "Reconciled refund",
    refundGateway,
    initiateNewCycle = false,
  } = params;

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);
  const { getStoreOrderModel } = await import("../models/StoreOrder");
  const Order = getStoreOrderModel(db);

  const attempt = await PaymentAttempt.findById(
    new Types.ObjectId(paymentAttemptId.toString()),
  );
  if (!attempt) {
    throw new Error(`Payment attempt ${paymentAttemptId.toString()} not found`);
  }

  const order = await Order.findOne({ orderRef: attempt.orderRef });
  if (!order) {
    throw new Error(`Order ${attempt.orderRef} not found for payment attempt ${attempt._id.toString()}`);
  }

  const alreadyRefundedPaise = order.refundedPaise || 0;

  // Idempotency: If already completely refunded, return terminal record
  if (attempt.status === "REFUNDED" || alreadyRefundedPaise >= attempt.amountPaise) {
    return {
      attempt,
      status: "REFUNDED",
      isReplay: true,
      refundId: attempt.razorpayRefundId,
      providerStatus: "processed",
    };
  }

  if (!attempt.razorpayPaymentId) {
    throw new Error(
      `Payment attempt ${attempt._id.toString()} has no provider payment ID (razorpayPaymentId) to refund`,
    );
  }

  // Calculate outstanding refund obligation
  const remainingObligation = Math.max(0, attempt.amountPaise - alreadyRefundedPaise);
  const targetAmountPaise = refundAmountPaise !== undefined
    ? Math.min(refundAmountPaise, remainingObligation)
    : remainingObligation;

  if (targetAmountPaise <= 0) {
    return {
      attempt,
      status: alreadyRefundedPaise >= attempt.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED",
      isReplay: true,
      refundId: attempt.razorpayRefundId,
      providerStatus: "processed",
    };
  }

  // Safety check: Cumulative refunds must never exceed amount captured
  if (alreadyRefundedPaise + targetAmountPaise > attempt.amountPaise) {
    throw new Error(
      `Cumulative refund (${alreadyRefundedPaise + targetAmountPaise}) would exceed payment attempt captured amount (${attempt.amountPaise})`,
    );
  }

  // Handle explicit initiation of a new refund cycle after authoritative failure
  if (initiateNewCycle) {
    // Prerequisite: An ambiguous timeout must be reconciled before a new refund operation is created
    if (attempt.errorDetails?.includes("[AMBIGUOUS_TIMEOUT]") && attempt.lastRefundStatus !== "failed") {
      throw new Error(
        `Cannot initiate a new refund operation: existing refund for order ${attempt.orderRef} is in an ambiguous timeout state and must be reconciled against the provider before submitting a new refund`,
      );
    }

    if (attempt.lastRefundStatus === "pending" && attempt.razorpayRefundId) {
      throw new Error(
        `Cannot initiate a new refund operation: previous refund ${attempt.razorpayRefundId} is still pending bank settlement. A refund in pending state must be reconciled by its existing refund ID rather than duplicated`,
      );
    }

    const nextCycle = (attempt.refundAttemptCycle || 1) + 1;
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          refundAttemptCycle: nextCycle,
          lastRefundStatus: undefined,
          razorpayRefundId: undefined,
          errorDetails: `New refund cycle ${nextCycle} initiated: ${refundReason}`,
        },
      },
    );
    attempt.refundAttemptCycle = nextCycle;
    attempt.lastRefundStatus = undefined;
    attempt.razorpayRefundId = undefined;
  }

  // Formulate stable idempotency key:
  // Cycle 1 uses stable base key rfnd-${orderRef}-${attemptNumber}
  // Subsequent retry cycles use rfnd-${orderRef}-${attemptNumber}-${cycle}
  const cycle = attempt.refundAttemptCycle || 1;
  const refundIdempotencyKey = cycle === 1
    ? `rfnd-${attempt.orderRef}-${attempt.attemptNumber}`
    : `rfnd-${attempt.orderRef}-${attempt.attemptNumber}-${cycle}`;

  // Ensure durable state: mark as REFUND_PENDING if currently in SUCCESS
  if (attempt.status === "SUCCESS") {
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: "REFUND_PENDING",
          refundAmountPaise: targetAmountPaise,
          errorDetails: `Refund required: ${refundReason}`,
        },
      },
    );
    attempt.status = "REFUND_PENDING";
    attempt.refundAmountPaise = targetAmountPaise;
  }

  // Execute gateway refund request
  let gatewayResult: {
    success: boolean;
    refundId?: string;
    providerStatus?: "processed" | "pending" | "failed";
    isReplay?: boolean;
    error?: string;
    failureCategory?: "DEFINITIVE_REJECTION" | "AMBIGUOUS_TIMEOUT";
  };

  if (refundGateway) {
    try {
      gatewayResult = await refundGateway({
        paymentId: attempt.razorpayPaymentId,
        amountPaise: targetAmountPaise,
        idempotencyKey: refundIdempotencyKey,
        reason: refundReason,
        notes: { orderRef: attempt.orderRef },
        existingRefundId: attempt.razorpayRefundId,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      gatewayResult = {
        success: false,
        error: errMsg,
        failureCategory: "AMBIGUOUS_TIMEOUT",
      };
    }
  } else {
    // Check if live Razorpay credentials are configured
    const { env } = await import("@/lib/env");

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      // In unconfigured / offline test environment, durable state is safely preserved as REFUND_PENDING
      const pendingNotice = `[RECONCILIATION_PENDING] Razorpay provider credentials not configured in current environment. Payment ${attempt.razorpayPaymentId} (₹${(targetAmountPaise / 100).toFixed(2)}) preserved in REFUND_PENDING state for reconciliation worker.`;
      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        { $set: { errorDetails: pendingNotice, refundAmountPaise: targetAmountPaise } },
      );
      await Order.updateOne(
        { orderRef: attempt.orderRef },
        {
          $set: {
            paymentStatus: "REFUND_PENDING",
            refundRequiredPaise: remainingObligation,
            notes: pendingNotice,
          },
        },
      );
      return {
        attempt,
        status: "REFUND_PENDING",
        isReplay: false,
        error: pendingNotice,
      };
    }

    // Call live Razorpay Refund API with documented X-Refund-Idempotency header
    try {
      const auth = Buffer.from(
        `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
      ).toString("base64");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // If attempt already has razorpayRefundId and was in pending state,
      // reconcile its status via GET /v1/payments/{payment_id}/refunds/{refund_id} rather than duplicating with a new POST
      let url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(attempt.razorpayPaymentId)}/refund`;
      let method = "POST";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "X-Refund-Idempotency": refundIdempotencyKey,
      };
      // Note: JMD uses standard direct merchant payments without linked-account transfers; reverse_all is omitted
      let body: string | undefined = JSON.stringify({
        amount: targetAmountPaise,
        notes: {
          orderRef: attempt.orderRef,
          idempotencyKey: refundIdempotencyKey,
          reason: refundReason,
        },
      });

      if (attempt.razorpayRefundId && attempt.status === "REFUND_PENDING" && attempt.lastRefundStatus !== "failed") {
        url = `https://api.razorpay.com/v1/payments/${encodeURIComponent(attempt.razorpayPaymentId)}/refunds/${encodeURIComponent(attempt.razorpayRefundId)}`;
        method = "GET";
        body = undefined;
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[Razorpay Refund Error]:", res.status, detail);
        gatewayResult = {
          success: false,
          error: `Razorpay HTTP ${res.status}: ${detail}`,
          failureCategory: res.status >= 500 ? "AMBIGUOUS_TIMEOUT" : "DEFINITIVE_REJECTION",
        };
      } else {
        const data = (await res.json()) as {
          id: string;
          status?: "processed" | "pending" | "failed";
          amount?: number;
        };
        gatewayResult = {
          success: true,
          refundId: data.id,
          providerStatus: data.status || "processed",
          isReplay: false,
        };
      }
    } catch (netErr: unknown) {
      const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
      gatewayResult = {
        success: false,
        error: `Network error connecting to Razorpay refund API: ${errMsg}`,
        failureCategory: "AMBIGUOUS_TIMEOUT",
      };
    }
  }

  // Handle gateway result
  if (gatewayResult.success && gatewayResult.refundId) {
    const provStatus = gatewayResult.providerStatus || "processed";

    // 1. Authoritative completion confirmed by provider
    if (provStatus === "processed") {
      const refundRes = await processRefund({
        paymentAttemptId: attempt._id,
        refundAmountPaise: targetAmountPaise,
        refundReason,
        idempotencyKey: refundIdempotencyKey,
        razorpayRefundId: gatewayResult.refundId,
      });

      const newTotalRefunded = alreadyRefundedPaise + targetAmountPaise;
      const isFullRefund = newTotalRefunded >= attempt.amountPaise;
      const targetPaymentStatus: "REFUNDED" | "PARTIALLY_REFUNDED" = isFullRefund
        ? "REFUNDED"
        : "PARTIALLY_REFUNDED";

      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        {
          $set: {
            lastRefundStatus: "processed",
            razorpayRefundId: gatewayResult.refundId,
          },
          $push: {
            refundHistory: {
              refundId: gatewayResult.refundId,
              amountPaise: targetAmountPaise,
              idempotencyKey: refundIdempotencyKey,
              status: "processed",
              createdAt: new Date(),
            },
          },
        },
      );

      await Order.updateOne(
        { orderRef: attempt.orderRef },
        {
          $set: {
            paymentStatus: targetPaymentStatus,
            refundedPaise: newTotalRefunded,
            refundId: gatewayResult.refundId,
            refundedAt: new Date(),
            notes: `Refund confirmed processed by provider (${gatewayResult.refundId})`,
          },
        },
      );

      return {
        attempt: refundRes.attempt,
        status: targetPaymentStatus,
        isReplay: Boolean(gatewayResult.isReplay),
        refundId: gatewayResult.refundId,
        providerStatus: "processed",
      };
    }

    // 2. Provider accepted request, but status is pending banking processing.
    // A refund ID alone NEVER proves completion! Must remain in REFUND_PENDING.
    if (provStatus === "pending") {
      const pendingDetail = `[PROVIDER_PENDING] Refund request accepted by provider (${gatewayResult.refundId}), awaiting bank settlement`;
      const updatedAttempt = await PaymentAttempt.findByIdAndUpdate(
        attempt._id,
        {
          $set: {
            status: "REFUND_PENDING",
            razorpayRefundId: gatewayResult.refundId,
            lastRefundStatus: "pending",
            refundAmountPaise: targetAmountPaise,
            errorDetails: pendingDetail,
          },
          $push: {
            refundHistory: {
              refundId: gatewayResult.refundId,
              amountPaise: targetAmountPaise,
              idempotencyKey: refundIdempotencyKey,
              status: "pending",
              createdAt: new Date(),
            },
          },
        },
        { returnDocument: "after" },
      );

      await Order.updateOne(
        { orderRef: attempt.orderRef },
        {
          $set: {
            paymentStatus: "REFUND_PENDING",
            refundRequiredPaise: remainingObligation,
            refundId: gatewayResult.refundId,
            notes: `Refund initiated with provider (${gatewayResult.refundId}), awaiting authoritative settlement (status: pending)`,
          },
        },
      );

      return {
        attempt: updatedAttempt || attempt,
        status: "REFUND_PENDING",
        isReplay: false,
        refundId: gatewayResult.refundId,
        providerStatus: "pending",
        error: pendingDetail,
      };
    }

    // 3. Provider authoritatively returned status: "failed"
    const failDetail = `[DEFINITIVE_REJECTION] Provider refund failed (${gatewayResult.refundId}): ${gatewayResult.error || "Declined by bank"}`;
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: "REFUND_PENDING",
          razorpayRefundId: gatewayResult.refundId,
          lastRefundStatus: "failed",
          errorDetails: failDetail,
        },
        $push: {
          refundHistory: {
            refundId: gatewayResult.refundId,
            amountPaise: targetAmountPaise,
            idempotencyKey: refundIdempotencyKey,
            status: "failed",
            failureReason: gatewayResult.error || "Provider declined refund",
            createdAt: new Date(),
          },
        },
      },
    );

    // The outstanding refund obligation remains visible and recoverable on the order
    await Order.updateOne(
      { orderRef: attempt.orderRef },
      {
        $set: {
          paymentStatus: "REFUND_PENDING",
          refundRequiredPaise: remainingObligation,
          notes: failDetail,
        },
      },
    );

    return {
      attempt,
      status: "FAILED",
      isReplay: false,
      refundId: gatewayResult.refundId,
      providerStatus: "failed",
      error: failDetail,
    };
  }

  // Gateway request failed or timed out: preserve durable REFUND_PENDING state
  const failCategory = gatewayResult.failureCategory || "REFUND_FAILED";
  const errDetail = `[${failCategory}] ${gatewayResult.error || "Provider refund failed"}`;

  await PaymentAttempt.updateOne(
    { _id: attempt._id },
    { $set: { status: "REFUND_PENDING", errorDetails: errDetail, refundAmountPaise: targetAmountPaise } },
  );

  await Order.updateOne(
    { orderRef: attempt.orderRef },
    {
      $set: {
        paymentStatus: "REFUND_PENDING",
        refundRequiredPaise: remainingObligation,
        notes: `Refund pending provider reconciliation: ${errDetail}`,
      },
    },
  );

  return {
    attempt,
    status: "REFUND_PENDING",
    isReplay: false,
    error: errDetail,
  };
}

/**
 * Sweeps all payment attempts in REFUND_PENDING state.
 * Rediscoverable across process restarts by querying the persistent MongoDB store.
 * Safe & Idempotent:
 *   - Skips repeatedly submitting operations whose current cycle has authoritatively failed at the provider.
 *   - Concurrent sweeps are protected against duplicate executions and race conditions.
 */
export async function sweepPendingRefunds(options?: {
  refundGateway?: RefundGatewayFn;
  limit?: number;
}): Promise<{
  discovered: number;
  processed: number;
  succeeded: number;
  pending: number;
  failed: number;
  details: Array<{
    attemptId: string;
    orderRef: string;
    status: string;
    refundId?: string;
    error?: string;
  }>;
}> {
  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);

  const limit = options?.limit || 50;
  // Rediscover pending refunds across process restarts
  const pendingAttempts = await PaymentAttempt.find({
    status: "REFUND_PENDING",
  })
    .sort({ updatedAt: 1 })
    .limit(limit);

  const results: Array<{
    attemptId: string;
    orderRef: string;
    status: string;
    refundId?: string;
    error?: string;
  }> = [];

  let succeeded = 0;
  let pending = 0;
  let failed = 0;

  for (const attempt of pendingAttempts) {
    // If the attempt's current refund cycle authoritatively failed at the provider,
    // do NOT repeatedly submit or hammer Razorpay! Mark as requiring operational intervention.
    if (attempt.lastRefundStatus === "failed") {
      failed++;
      results.push({
        attemptId: attempt._id.toString(),
        orderRef: attempt.orderRef,
        status: "FAILED",
        refundId: attempt.razorpayRefundId,
        error: attempt.errorDetails || "[DEFINITIVE_REJECTION] Provider refund failed; requires operational retry",
      });
      continue;
    }

    try {
      const res = await reconcilePaymentRefund({
        paymentAttemptId: attempt._id,
        refundReason: "Scheduled reconciliation sweep",
        refundGateway: options?.refundGateway,
      });

      if (res.status === "REFUNDED" || res.status === "PARTIALLY_REFUNDED") {
        succeeded++;
      } else if (res.status === "REFUND_PENDING") {
        pending++;
      } else {
        failed++;
      }

      results.push({
        attemptId: attempt._id.toString(),
        orderRef: attempt.orderRef,
        status: res.status,
        refundId: res.refundId,
        error: res.error,
      });
    } catch (err: unknown) {
      failed++;
      results.push({
        attemptId: attempt._id.toString(),
        orderRef: attempt.orderRef,
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    discovered: pendingAttempts.length,
    processed: results.length,
    succeeded,
    pending,
    failed,
    details: results,
  };
}

/**
 * Handles refund lifecycle webhook events (refund.processed, refund.failed) from Razorpay.
 * Idempotent: Handles duplicate and out-of-order webhooks safely.
 */
export async function handleRazorpayRefundWebhook(eventPayload: {
  event?: string;
  payload?: {
    refund?: {
      entity?: {
        id: string;
        payment_id: string;
        amount?: number;
        status?: string;
        notes?: Record<string, string>;
      };
    };
  };
}): Promise<{ processed: boolean; status?: string; refundId?: string }> {
  const refundEntity = eventPayload.payload?.refund?.entity;
  if (!refundEntity) {
    return { processed: false };
  }

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);
  const { getStoreOrderModel } = await import("@/server/store/models/StoreOrder");
  const Order = getStoreOrderModel(db);

  // Correlate to the exact refund ID, refund history, payment ID or order reference
  const attempt = await PaymentAttempt.findOne({
    $or: [
      { razorpayRefundId: refundEntity.id },
      { "refundHistory.refundId": refundEntity.id },
      ...(refundEntity.payment_id ? [{ razorpayPaymentId: refundEntity.payment_id }] : []),
      ...(refundEntity.notes?.orderRef ? [{ orderRef: refundEntity.notes.orderRef }] : []),
    ],
  });

  if (!attempt) {
    return { processed: false };
  }

  // 1. Authoritative Refund Operation Mapping:
  // Only an exact known refund ID or an unambiguous, persisted mapping to that refund operation
  // may authorize a cycle-specific state transition. Matching by payment ID or order reference alone
  // must not authorize a refund-cycle state transition.
  const isExactActiveRefund = Boolean(
    attempt.razorpayRefundId && attempt.razorpayRefundId === refundEntity.id,
  );
  const isHistoricalRefund = Boolean(
    attempt.refundHistory?.some((h) => h.refundId === refundEntity.id),
  );

  const cycle = attempt.refundAttemptCycle || 1;
  const activeCycleIdempotencyKey =
    cycle === 1
      ? `rfnd-${attempt.orderRef}-${attempt.attemptNumber}`
      : `rfnd-${attempt.orderRef}-${attempt.attemptNumber}-${cycle}`;

  const webhookIdempotencyKey = refundEntity.notes?.idempotencyKey;
  const isMappedToActiveCycleByKey = Boolean(
    webhookIdempotencyKey && webhookIdempotencyKey === activeCycleIdempotencyKey,
  );
  const isMappedToHistoricalCycleByKey = Boolean(
    webhookIdempotencyKey &&
      attempt.refundHistory?.some((h) => h.idempotencyKey === webhookIdempotencyKey),
  );

  // If no refund operation was ever recorded yet on this payment attempt (no active refund ID, no history)
  // and it is a refund.processed event, it is the initial provider-initiated refund for the captured payment.
  const isInitialUnrecordedRefundProcessed = Boolean(
    eventPayload.event === "refund.processed" &&
      !attempt.razorpayRefundId &&
      (!attempt.refundHistory || attempt.refundHistory.length === 0) &&
      attempt.status === "SUCCESS",
  );

  const isKnownRefund =
    isExactActiveRefund ||
    isHistoricalRefund ||
    isMappedToActiveCycleByKey ||
    isMappedToHistoricalCycleByKey ||
    isInitialUnrecordedRefundProcessed;

  // Unknown refund ID: Matching by payment ID or order reference alone must NOT authorize
  // a refund-cycle state transition. Safely log for operational investigation without
  // modifying cycle 2's active refund ID, status, amount, or idempotency key.
  if (!isKnownRefund) {
    const unmatchedLog = `[UNMATCHED_REFUND_EVENT] Received ${eventPayload.event} for unknown refund ID '${refundEntity.id}' on payment attempt ${attempt._id.toString()} (${attempt.orderRef}). Payment ID or order reference matched, but refund ID has no persistent correlation to any refund operation. Event safely recorded without modifying cycle state.`;
    console.warn(unmatchedLog);
    return {
      processed: false,
      status: "IGNORED_UNKNOWN_REFUND_ID",
      refundId: refundEntity.id,
    };
  }

  // Cross-cycle isolation checks:
  const isActiveCycle =
    isExactActiveRefund ||
    isInitialUnrecordedRefundProcessed ||
    (!attempt.razorpayRefundId && isMappedToActiveCycleByKey);
  const isStaleCycleEvent =
    !isActiveCycle &&
    (isHistoricalRefund ||
      isMappedToHistoricalCycleByKey ||
      (attempt.refundAttemptCycle || 1) > 1);

  if (eventPayload.event === "refund.processed") {
    // 1. If payment is already terminal REFUNDED, protect against duplicate replay
    if (attempt.status === "REFUNDED") {
      return { processed: true, status: "REFUNDED", refundId: refundEntity.id };
    }

    // 2. Duplicate protection: if this exact refund ID was already recorded as processed
    const alreadyProcessedInHistory = attempt.refundHistory?.some(
      (h) => h.refundId === refundEntity.id && h.status === "processed",
    );
    if (alreadyProcessedInHistory) {
      return { processed: true, status: "IGNORED_DUPLICATE", refundId: refundEntity.id };
    }

    const currentOrder = await Order.findOne({ orderRef: attempt.orderRef });
    const currentRefunded = currentOrder?.refundedPaise || 0;
    const refundAmt =
      refundEntity.amount || Math.max(0, attempt.amountPaise - currentRefunded);
    const newTotalRefunded = currentRefunded + refundAmt;
    const isFullRefund = newTotalRefunded >= attempt.amountPaise;

    await processRefund({
      paymentAttemptId: attempt._id,
      refundAmountPaise: refundAmt,
      refundReason: "Confirmed via Razorpay refund.processed webhook",
      idempotencyKey:
        refundEntity.notes?.idempotencyKey || `rfnd-wh-${refundEntity.id}`,
      razorpayRefundId: refundEntity.id,
      rawWebhookPayload: eventPayload as Record<string, unknown>,
    });

    const updateSet: Record<string, unknown> = {
      lastRefundStatus: "processed",
    };
    if (isActiveCycle) {
      updateSet.razorpayRefundId = refundEntity.id;
    }

    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: updateSet,
        $push: {
          refundHistory: {
            refundId: refundEntity.id,
            amountPaise: refundAmt,
            idempotencyKey:
              refundEntity.notes?.idempotencyKey || `rfnd-wh-${refundEntity.id}`,
            status: "processed",
            createdAt: new Date(),
          },
        },
      },
    );

    await Order.updateOne(
      { orderRef: attempt.orderRef },
      {
        $set: {
          paymentStatus: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundedPaise: Math.min(newTotalRefunded, attempt.amountPaise),
          refundId: refundEntity.id,
          refundedAt: new Date(),
          notes: `Refund processed confirmed via Razorpay webhook (${refundEntity.id})`,
        },
      },
    );

    return {
      processed: true,
      status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundId: refundEntity.id,
    };
  }

  if (eventPayload.event === "refund.failed") {
    // 1. Terminal state protection: late refund.failed cannot overwrite confirmed REFUNDED status
    if (attempt.status === "REFUNDED") {
      return {
        processed: false,
        status: "IGNORED_ALREADY_REFUNDED",
        refundId: refundEntity.id,
      };
    }

    // 2. Duplicate protection: if this exact refund ID already failed in history, ignore replay
    const alreadyFailedInHistory = attempt.refundHistory?.some(
      (h) => h.refundId === refundEntity.id && h.status === "failed",
    );
    if (alreadyFailedInHistory) {
      return {
        processed: false,
        status: "IGNORED_DUPLICATE",
        refundId: refundEntity.id,
      };
    }

    // 3. Cross-cycle isolation: a stale failed event for an older cycle must NOT modify active cycle's status or refund ID
    if (isStaleCycleEvent) {
      const failMsg = `[DEFINITIVE_REJECTION] Razorpay webhook refund.failed received for prior cycle refund ${refundEntity.id}`;
      await PaymentAttempt.updateOne(
        { _id: attempt._id },
        {
          $push: {
            refundHistory: {
              refundId: refundEntity.id,
              amountPaise: refundEntity.amount || attempt.amountPaise,
              idempotencyKey:
                refundEntity.notes?.idempotencyKey || `rfnd-wh-fail-${refundEntity.id}`,
              status: "failed",
              failureReason: failMsg,
              createdAt: new Date(),
            },
          },
        },
      );
      return {
        processed: false,
        status: "IGNORED_STALE_CYCLE",
        refundId: refundEntity.id,
      };
    }

    // 4. Active cycle failure: update active attempt and order notes
    const failMsg = `[DEFINITIVE_REJECTION] Razorpay webhook refund.failed received for refund ${refundEntity.id}`;
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          lastRefundStatus: "failed",
          razorpayRefundId: refundEntity.id,
          errorDetails: failMsg,
        },
        $push: {
          refundHistory: {
            refundId: refundEntity.id,
            amountPaise: refundEntity.amount || attempt.amountPaise,
            idempotencyKey:
              refundEntity.notes?.idempotencyKey || `rfnd-wh-fail-${refundEntity.id}`,
            status: "failed",
            failureReason: failMsg,
            createdAt: new Date(),
          },
        },
      },
    );
    await Order.updateOne(
      { orderRef: attempt.orderRef },
      { $set: { notes: failMsg } },
    );
    return { processed: true, status: "FAILED", refundId: refundEntity.id };
  }

  return { processed: false };
}

