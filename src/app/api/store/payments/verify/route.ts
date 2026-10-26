import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  recordPaymentSuccess,
  verifyRazorpaySignature,
} from "@/server/store/services/payment.service";
import { processPostPaymentCheckout } from "@/server/store/services/checkout.service";
import { z } from "zod";

const verifyPaymentSchema = z.object({
  paymentAttemptId: z.string().min(1, "Payment attempt ID required"),
  orderRef: z.string().min(1, "Order reference required"),
  razorpayPaymentId: z.string().min(1, "Razorpay payment ID required"),
  razorpayOrderId: z.string().optional(),
  razorpaySignature: z.string().optional(),
});

export const POST = handle(async (req) => {
  await requireStoreMember();
  const body = await req.json();
  const parsed = verifyPaymentSchema.parse(body);

  const secret = process.env.RAZORPAY_KEY_SECRET;

  // Fail closed in production if Razorpay is not configured or signature is missing
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return fail("Payment gateway secret is not configured in production.", 503);
    }
    if (!parsed.razorpayOrderId || !parsed.razorpaySignature) {
      return fail("Payment order ID and signature are mandatory in production.", 400);
    }
  }

  // If Razorpay secret is configured and client sent signature, verify it
  if (secret && parsed.razorpayOrderId && parsed.razorpaySignature) {
    const isValid = verifyRazorpaySignature({
      razorpayOrderId: parsed.razorpayOrderId,
      razorpayPaymentId: parsed.razorpayPaymentId,
      razorpaySignature: parsed.razorpaySignature,
      secret,
    });
    if (!isValid) {
      return fail("Invalid payment signature.", 400, {
        code: "INVALID_SIGNATURE",
      });
    }
  }

  // Record payment success
  await recordPaymentSuccess({
    paymentAttemptId: parsed.paymentAttemptId,
    razorpayPaymentId: parsed.razorpayPaymentId,
    razorpaySignature: parsed.razorpaySignature,
  });

  // Run post-payment coupon redemption and inventory fulfillment
  const checkoutResult = await processPostPaymentCheckout({
    orderRef: parsed.orderRef,
    paymentAttemptId: parsed.paymentAttemptId,
  });

  return ok({
    success: true,
    status: checkoutResult.status,
    deficitRupees: checkoutResult.deficitPaise / 100,
    orderRef: checkoutResult.order.orderRef,
  });
});
