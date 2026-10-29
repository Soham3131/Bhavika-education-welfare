import { handle, ok, fail } from "@/server/http";
import {
  verifyRazorpayWebhookSignature,
  recordPaymentSuccess,
} from "@/server/store/services/payment.service";
import { processPostPaymentCheckout } from "@/server/store/services/checkout.service";
import { getStoreDb } from "@/server/store/db/connect";
import { getStorePaymentAttemptModel } from "@/server/store/models/StorePaymentAttempt";

export const POST = handle(async (req) => {
  const signature = req.headers.get("x-razorpay-signature");
  const rawBody = await req.text();

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!secret || !signature) {
      return fail("Webhook secret and signature are mandatory in production.", 401);
    }
  }

  if (secret && signature) {
    const isValid = verifyRazorpayWebhookSignature({
      rawBody,
      signature,
      secret,
    });
    if (!isValid) {
      return fail("Invalid webhook signature.", 400);
    }
  }

  let eventPayload: {
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id: string;
          order_id?: string;
          amount: number;
          currency: string;
          notes?: Record<string, string>;
        };
      };
      refund?: {
        entity?: {
          id: string;
          payment_id: string;
          amount: number;
          status: string;
          notes?: Record<string, string>;
        };
      };
    };
  };

  try {
    eventPayload = JSON.parse(rawBody);
  } catch {
    return fail("Invalid webhook JSON payload.", 400);
  }

  if (eventPayload.event === "payment.captured") {
    const entity = eventPayload.payload?.payment?.entity;
    if (entity) {
      const db = await getStoreDb();
      const PaymentAttempt = getStorePaymentAttemptModel(db);

      // Look up payment attempt by order reference or razorpay order id
      const attempt = await PaymentAttempt.findOne({
        $or: [
          { razorpayOrderId: entity.order_id },
          { orderRef: entity.notes?.orderRef },
        ],
      });

      if (attempt) {
        // Record payment success with amount and currency safety checks
        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: entity.id,
          amountPaise: entity.amount,
          currency: entity.currency,
          rawWebhookPayload: eventPayload as Record<string, unknown>,
        });

        // Trigger post-payment checkout (catches refund-pending states to acknowledge webhook cleanly)
        try {
          await processPostPaymentCheckout({
            orderRef: attempt.orderRef,
            paymentAttemptId: attempt._id.toString(),
          });
        } catch (postCheckoutErr) {
          console.warn(
            `[Razorpay Webhook] Post-payment checkout for order ${attempt.orderRef} entered refund/reconciliation:`,
            postCheckoutErr,
          );
        }
      }
    }
  }

  if (eventPayload.event === "refund.processed" || eventPayload.event === "refund.failed") {
    const { handleRazorpayRefundWebhook } = await import("@/server/store/services/payment.service");
    await handleRazorpayRefundWebhook(eventPayload);
  }

  return ok({ received: true });
});
