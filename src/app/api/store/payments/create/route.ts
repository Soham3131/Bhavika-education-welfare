import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import { getStoreOrderByRef } from "@/server/store/services/order.service";
import { createPaymentAttempt } from "@/server/store/services/payment.service";
import { z } from "zod";

const createPaymentSchema = z.object({
  orderRef: z.string().trim().min(1, "Order reference required"),
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = createPaymentSchema.parse(body);

  const order = await getStoreOrderByRef(parsed.orderRef);
  if (!order) {
    return fail("Order not found.", 404);
  }

  if (order.memberId.toString() !== session.storeMemberId) {
    return fail("Unauthorized.", 403);
  }

  if (
    order.status !== "PENDING_PAYMENT" &&
    order.status !== "PARTIAL_COUPON_REDEMPTION_DEFICIT"
  ) {
    return fail(`Order cannot be paid in current status: ${order.status}`, 400);
  }

  // Determine amount payable
  const amountPaise =
    order.status === "PARTIAL_COUPON_REDEMPTION_DEFICIT"
      ? order.deficitPaise
      : order.netPayablePaise;

  if (amountPaise <= 0) {
    return fail("Order net payable is 0.", 400);
  }

  const razorpayKeyId =
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  // Fail closed in production if Razorpay credentials are not configured
  if (
    process.env.NODE_ENV === "production" &&
    (!razorpayKeyId || !razorpayKeySecret)
  ) {
    return fail("Payment gateway is not configured for production.", 503);
  }

  // Check attempt number
  const attemptNumber = 1;

  // Create authoritative Razorpay order if gateway credentials are present
  let razorpayOrderId: string | undefined;
  if (razorpayKeyId && razorpayKeySecret) {
    try {
      const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: order.orderRef,
          notes: {
            orderRef: order.orderRef,
            memberId: session.storeMemberId,
          },
          payment_capture: 1,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        razorpayOrderId = data.id;
      } else {
        const errorText = await res.text().catch(() => "");
        console.error("[Razorpay API] Failed to create order:", res.status, errorText);
        if (process.env.NODE_ENV === "production") {
          return fail("Failed to create payment session with payment gateway.", 502);
        }
      }
    } catch (err) {
      console.error("[Razorpay API] Network error creating order:", err);
      if (process.env.NODE_ENV === "production") {
        return fail("Network error communicating with payment gateway.", 502);
      }
    }
  }

  const attempt = await createPaymentAttempt({
    orderRef: order.orderRef,
    orderId: order._id.toString(),
    memberId: session.storeMemberId,
    attemptNumber,
    amountPaise,
    razorpayOrderId,
  });

  return ok({
    success: true,
    paymentAttemptId: attempt._id.toString(),
    orderRef: order.orderRef,
    amountPaise,
    amountRupees: amountPaise / 100,
    currency: "INR",
    razorpayKeyId: razorpayKeyId || "rzp_test_stub",
    razorpayOrderId: razorpayOrderId || attempt.razorpayOrderId,
    isTestMode: (razorpayKeyId || "").startsWith("rzp_test_") || !razorpayKeyId,
  });
});
