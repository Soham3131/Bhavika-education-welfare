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

  // Fail closed in production if Razorpay credentials are not configured
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET)
  ) {
    return fail("Payment gateway is not configured for production.", 503);
  }

  // Check attempt number
  const attemptNumber = 1;

  const attempt = await createPaymentAttempt({
    orderRef: order.orderRef,
    orderId: order._id.toString(),
    memberId: session.storeMemberId,
    attemptNumber,
    amountPaise,
  });

  return ok({
    success: true,
    paymentAttemptId: attempt._id.toString(),
    orderRef: order.orderRef,
    amountPaise,
    amountRupees: amountPaise / 100,
    currency: "INR",
    razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_stub",
  });
});
