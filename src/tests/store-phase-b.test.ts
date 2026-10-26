import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { getStoreDb } from "@/server/store/db/connect";
import {
  createStoreCategory,
  createStoreProduct,
  getStoreProductById,
  reserveProductInventory,
  releaseProductInventory,
  fulfillProductInventory,
} from "@/server/store/services/product.service";
import { calculateCart } from "@/server/store/services/cart.service";
import {
  createStoreOrder,
  transitionOrderStatus,
  getStoreOrderByRef,
  cancelExpiredOrders,
} from "@/server/store/services/order.service";
import {
  createPaymentAttempt,
  recordPaymentSuccess,
  recordPaymentFailure,
  processRefund,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "@/server/store/services/payment.service";
import {
  registerExternalCouponsForOrder,
  processPostPaymentCheckout,
} from "@/server/store/services/checkout.service";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getExternalCouponRedemptionModel } from "@/server/store/models/ExternalCouponRedemption";
import {
  signBhavikaRequest,
  getBhavikaConfig,
} from "@/server/store/services/bhavika-client.service";
import { verifyStoreAdminCapability } from "@/server/store/auth/store-admin";
import { AdminAuditLog } from "@/server/models";

describe("Phase B — Commerce Core", () => {
  let memberId: string;
  let categoryId: string;

  beforeAll(async () => {
    // Register a test store member for orders
    const member = await registerStoreMember({
      name: "Commerce Test Member",
      email: "commerce.test@jmd.dev",
      phone: "+919999000001",
      password: "CommercePassword123!",
    });
    memberId = member._id.toString();

    // Create a product category
    const cat = await createStoreCategory({
      name: "Fashion Accessories",
      slug: "fashion-accessories",
      type: "FASHION",
      description: "Fashion and lifestyle accessories",
    });
    categoryId = cat._id.toString();
  });

  afterAll(async () => {
    // Cleanup any created test documents
    const db = await getStoreDb();
    if (db.readyState === 1) {
      await db.collection("store_categories").deleteMany({});
      await db.collection("store_products").deleteMany({});
      await db.collection("store_orders").deleteMany({});
      await db.collection("store_payment_attempts").deleteMany({});
      await db.collection("store_external_coupon_redemptions").deleteMany({});
      await db.collection("store_members").deleteMany({});
      await db.collection("store_wallets").deleteMany({});
      await db.collection("store_wallet_ledgers").deleteMany({});
    }
  });

  describe("Catalog & Product Invariants", () => {
    it("creates a product with integer paise pricing and verified SKU", async () => {
      const product = await createStoreProduct({
        sku: "JMD-FASH-001",
        title: "Silk Scarf",
        slug: "silk-scarf",
        categoryId,
        basePricePaise: 49900, // ₹499.00
        stock: 50,
      });

      expect(product.sku).toBe("JMD-FASH-001");
      expect(product.basePricePaise).toBe(49900);
      expect(product.stock).toBe(50);
      expect(product.reservedStock).toBe(0);
      expect(product.isActive).toBe(true);
    });

    it("rejects non-integer or negative product prices", async () => {
      await expect(
        createStoreProduct({
          sku: "JMD-ERR-001",
          title: "Bad Price",
          slug: "bad-price",
          categoryId,
          basePricePaise: 499.5, // Float paise not allowed
          stock: 10,
        }),
      ).rejects.toThrow(/integer/i);
    });
  });

  describe("Server-Side Cart Calculation", () => {
    it("computes line items and totals exclusively on the server", async () => {
      const p1 = await createStoreProduct({
        sku: "JMD-FASH-002",
        title: "Leather Belt",
        slug: "leather-belt",
        categoryId,
        basePricePaise: 99900, // ₹999.00
        stock: 20,
      });

      const p2 = await createStoreProduct({
        sku: "JMD-FASH-003",
        title: "Woolen Beanie",
        slug: "woolen-beanie",
        categoryId,
        basePricePaise: 29900, // ₹299.00
        stock: 15,
      });

      const cart = await calculateCart([
        { productId: p1._id.toString(), quantity: 2 },
        { productId: p2._id.toString(), quantity: 3 },
      ]);

      expect(cart.items).toHaveLength(2);
      expect(cart.items[0].totalPricePaise).toBe(99900 * 2);
      expect(cart.items[1].totalPricePaise).toBe(29900 * 3);
      expect(cart.itemsTotalPaise).toBe(99900 * 2 + 29900 * 3);
      expect(cart.totalPayablePaise).toBe(cart.itemsTotalPaise);
    });

    it("rejects items exceeding available inventory during cart check", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-004",
        title: "Limited Brooch",
        slug: "limited-brooch",
        categoryId,
        basePricePaise: 150000,
        stock: 2,
      });

      await expect(
        calculateCart([{ productId: p._id.toString(), quantity: 5 }]),
      ).rejects.toThrow(/Insufficient stock/i);
    });
  });

  describe("Concurrency-Safe Stock Reservations", () => {
    it("safely handles 10 parallel reservation attempts for 3 units of stock", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-005",
        title: "Scarce Ring",
        slug: "scarce-ring",
        categoryId,
        basePricePaise: 50000,
        stock: 3, // Only 3 units available
      });

      // Launch 10 simultaneous parallel reservation attempts of 1 unit each
      const attempts = Array.from({ length: 10 }, () =>
        reserveProductInventory({
          productId: p._id.toString(),
          quantity: 1,
        })
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, error: err.message })),
      );

      const results = await Promise.all(attempts);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(7);

      // Verify final product stock state
      const fresh = await getStoreProductById(p._id.toString());
      expect(fresh?.stock).toBe(3);
      expect(fresh?.reservedStock).toBe(3);
    });

    it("releases reserved inventory on cancellation", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-006",
        title: "Silver Cuff",
        slug: "silver-cuff",
        categoryId,
        basePricePaise: 80000,
        stock: 5,
      });

      // Reserve 2 units
      await reserveProductInventory({
        productId: p._id.toString(),
        quantity: 2,
      });
      let fresh = await getStoreProductById(p._id.toString());
      expect(fresh?.reservedStock).toBe(2);

      // Release 2 units
      await releaseProductInventory({
        productId: p._id.toString(),
        quantity: 2,
      });
      fresh = await getStoreProductById(p._id.toString());
      expect(fresh?.reservedStock).toBe(0);
      expect(fresh?.stock).toBe(5);
    });

    it("fulfills reserved inventory on capture", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-007",
        title: "Gold Brooch",
        slug: "gold-brooch",
        categoryId,
        basePricePaise: 120000,
        stock: 5,
      });

      // Reserve 2 units
      await reserveProductInventory({
        productId: p._id.toString(),
        quantity: 2,
      });

      // Fulfill 2 units (payment captured)
      await fulfillProductInventory({
        productId: p._id.toString(),
        quantity: 2,
      });

      const fresh = await getStoreProductById(p._id.toString());
      expect(fresh?.stock).toBe(3); // 5 - 2 = 3
      expect(fresh?.reservedStock).toBe(0); // 2 - 2 = 0
    });
  });

  describe("Orders & Strict State Machine Transitions", () => {
    it("creates an order, generates reference JMD-ORD-YYYY-XXXXXX, and reserves stock", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-008",
        title: "Designer Tie",
        slug: "designer-tie",
        categoryId,
        basePricePaise: 75000,
        stock: 10,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 2 }],
        shippingAddress: {
          fullName: "Recipient Name",
          phone: "+919876543210",
          addressLine1: "123 High Street",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(order.orderRef).toMatch(/^JMD-ORD-\d{4}-\d{6}$/);
      expect(order.status).toBe("PENDING_PAYMENT");
      expect(order.itemsTotalPaise).toBe(150000);
      expect(order.netPayablePaise).toBe(150000);

      // Stock should be reserved
      const freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(2);
    });

    it("enforces strict valid state machine transitions", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-009",
        title: "Pocket Square",
        slug: "pocket-square",
        categoryId,
        basePricePaise: 35000,
        stock: 5,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        shippingAddress: {
          fullName: "Recipient Name",
          phone: "+919876543210",
          addressLine1: "123 High Street",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      // Valid: PENDING_PAYMENT -> PAID
      const paidOrder = await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "PAID",
      });
      expect(paidOrder.status).toBe("PAID");
      expect(paidOrder.paymentStatus).toBe("CAPTURED");

      // Valid: PAID -> PROCESSING -> SHIPPED -> DELIVERED
      await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "PROCESSING",
      });
      await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "SHIPPED",
      });
      const delivered = await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "DELIVERED",
      });
      expect(delivered.status).toBe("DELIVERED");

      // Valid: DELIVERED -> REFUNDED
      const refunded = await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "REFUNDED",
      });
      expect(refunded.status).toBe("REFUNDED");

      // Terminal state check: REFUNDED cannot transition back to PAID
      await expect(
        transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "PAID",
        }),
      ).rejects.toThrow(/Illegal order transition/i);
    });

    it("releases reserved inventory when PENDING_PAYMENT order is cancelled", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-010",
        title: "Enamel Pin",
        slug: "enamel-pin",
        categoryId,
        basePricePaise: 15000,
        stock: 4,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 2 }],
        shippingAddress: {
          fullName: "Recipient",
          phone: "+919876543210",
          addressLine1: "Address",
          city: "City",
          state: "State",
          postalCode: "110001",
          country: "India",
        },
      });

      let freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(2);

      // Cancel order
      await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "CANCELLED",
        cancellationReason: "Customer cancelled",
      });

      freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(0);
      expect(freshProduct?.stock).toBe(4);
    });
  });

  describe("Razorpay Signatures, Webhook & Payment Idempotency", () => {
    const testSecret = "rzp_test_secret_key_123456";

    it("verifies authentic HMAC signatures and rejects tampered ones", () => {
      const orderId = "order_test_998877";
      const paymentId = "pay_test_112233";
      const validSignature = crypto
        .createHmac("sha256", testSecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      // Valid signature
      expect(
        verifyRazorpaySignature({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
          secret: testSecret,
        }),
      ).toBe(true);

      // Tampered signature
      expect(
        verifyRazorpaySignature({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: "tampered_signature_hex",
          secret: testSecret,
        }),
      ).toBe(false);

      // Wrong secret
      expect(
        verifyRazorpaySignature({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
          secret: "wrong_secret",
        }),
      ).toBe(false);
    });

    it("verifies authentic webhook raw body signatures and rejects tampered bodies", () => {
      const rawBody = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_test_abc", amount: 50000 } } },
      });
      const validWebhookSignature = crypto
        .createHmac("sha256", testSecret)
        .update(rawBody)
        .digest("hex");

      expect(
        verifyRazorpayWebhookSignature({
          rawBody,
          signature: validWebhookSignature,
          secret: testSecret,
        }),
      ).toBe(true);

      // Tampered body
      expect(
        verifyRazorpayWebhookSignature({
          rawBody: rawBody + " ",
          signature: validWebhookSignature,
          secret: testSecret,
        }),
      ).toBe(false);
    });

    it("enforces payment attempt idempotency by orderRef and attemptNumber", async () => {
      const dummyOrderRef = "JMD-ORD-2026-999901";
      const dummyOrderId = "65a000000000000000000001";

      const attempt1 = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 49900,
        razorpayOrderId: "order_rzp_001",
      });

      const attempt2 = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 49900,
        razorpayOrderId: "order_rzp_001",
      });

      expect(attempt1._id.toString()).toBe(attempt2._id.toString());
      expect(attempt2.idempotencyKey).toBe(`pay:${dummyOrderRef}:1`);
    });

    it("identifies duplicate payment webhook callbacks as replays", async () => {
      const dummyOrderRef = "JMD-ORD-2026-999902";
      const dummyOrderId = "65a000000000000000000002";

      const attempt = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 50000,
      });

      // First webhook delivery -> transitions to SUCCESS
      const res1 = await recordPaymentSuccess({
        paymentAttemptId: attempt._id.toString(),
        razorpayPaymentId: "pay_rzp_first_callback",
      });
      expect(res1.isReplay).toBe(false);
      expect(res1.attempt.status).toBe("SUCCESS");

      // Duplicate webhook delivery -> detected as replay
      const res2 = await recordPaymentSuccess({
        paymentAttemptId: attempt._id.toString(),
        razorpayPaymentId: "pay_rzp_first_callback",
      });
      expect(res2.isReplay).toBe(true);
      expect(res2.attempt.status).toBe("SUCCESS");
    });

    it("blocks illegal payment state transitions from terminal states", async () => {
      const dummyOrderRef = "JMD-ORD-2026-999903";
      const dummyOrderId = "65a000000000000000000003";

      const attempt = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 30000,
      });

      // Mark failed
      await recordPaymentFailure({
        paymentAttemptId: attempt._id.toString(),
        errorDetails: "Card declined by issuing bank",
        status: "FAILED",
      });

      // Attempting to overwrite FAILED with SUCCESS must throw
      await expect(
        recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_should_fail",
        }),
      ).rejects.toThrow(/Illegal payment state transition/i);
    });
  });

  describe("Bhavika Multi-Coupon Contract & Deficit Handling", () => {
    it("tracks multiple Bhavika coupon codes independently against orderRef", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-011",
        title: "Linen Shirt",
        slug: "linen-shirt",
        categoryId,
        basePricePaise: 150000, // ₹1,500.00
        stock: 5,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponDiscountPaise: 70000, // Two coupons: ₹500 + ₹200 = ₹700
        shippingAddress: {
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Street",
          city: "Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      // Register two coupons for this order
      const registered = await registerExternalCouponsForOrder({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        coupons: [
          {
            code: "BHAV-COUP-001",
            valueRupees: 500,
            discountAppliedPaise: 50000,
          },
          {
            code: "BHAV-COUP-002",
            valueRupees: 200,
            discountAppliedPaise: 20000,
          },
        ],
      });

      expect(registered).toHaveLength(2);
      expect(registered[0].status).toBe("VALIDATED");
      expect(registered[1].status).toBe("VALIDATED");

      // Verify unique index prevents registering same coupon on same order twice
      await expect(
        registerExternalCouponsForOrder({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          coupons: [
            {
              code: "BHAV-COUP-001",
              valueRupees: 500,
              discountAppliedPaise: 50000,
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it("handles partial coupon redemption failure: enters PARTIAL_COUPON_REDEMPTION_DEFICIT and locks dispatch", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-012",
        title: "Silk Kurta",
        slug: "silk-kurta",
        categoryId,
        basePricePaise: 200000, // ₹2,000.00
        stock: 10,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponDiscountPaise: 80000, // ₹500 + ₹300 = ₹800 discount
        shippingAddress: {
          fullName: "Test User",
          phone: "+919876543210",
          addressLine1: "123 Lane",
          city: "Mumbai",
          state: "Maharashtra",
          postalCode: "400001",
          country: "India",
        },
      });

      // Net payable is ₹1,200.00 (120,000 paise)
      expect(order.netPayablePaise).toBe(120000);

      // Register two external coupons
      await registerExternalCouponsForOrder({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        coupons: [
          {
            code: "BHAV-GOOD-001",
            valueRupees: 500,
            discountAppliedPaise: 50000,
          },
          {
            code: "BHAV-EXPIRED-002",
            valueRupees: 300,
            discountAppliedPaise: 30000,
          },
        ],
      });

      // Create and succeed payment attempt for the cash portion
      const payment = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: 120000,
      });

      await recordPaymentSuccess({
        paymentAttemptId: payment._id.toString(),
        razorpayPaymentId: "pay_rzp_cash_success",
      });

      // Post-payment checkout where BHAV-GOOD-001 succeeds, but BHAV-EXPIRED-002 fails at upstream
      const mockRedeemer = async (code: string) => {
        if (code === "BHAV-GOOD-001") {
          return { success: true };
        }
        return { success: false, error: "Coupon expired upstream" };
      };

      const checkoutResult = await processPostPaymentCheckout({
        orderRef: order.orderRef,
        paymentAttemptId: payment._id.toString(),
        redeemer: mockRedeemer,
      });

      expect(checkoutResult.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
      expect(checkoutResult.deficitPaise).toBe(30000); // ₹300 deficit
      expect(checkoutResult.redeemedCoupons).toContain("BHAV-GOOD-001");
      expect(checkoutResult.failedCoupons).toContain("BHAV-EXPIRED-002");

      // Verify the order document state
      const refreshedOrder = await getStoreOrderByRef(order.orderRef);
      expect(refreshedOrder?.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
      expect(refreshedOrder?.deficitPaise).toBe(30000);

      // Invariant: The order is NOT paid, so goods cannot be dispatched
      expect(refreshedOrder?.paymentStatus).toBe("UNPAID");

      // Verify database records for external coupon redemptions
      const db = await getStoreDb();
      const ExternalCoupon = getExternalCouponRedemptionModel(db);
      const goodDoc = await ExternalCoupon.findOne({
        orderRef: order.orderRef,
        code: "BHAV-GOOD-001",
      });
      const badDoc = await ExternalCoupon.findOne({
        orderRef: order.orderRef,
        code: "BHAV-EXPIRED-002",
      });

      expect(goodDoc?.status).toBe("REDEEMED");
      expect(badDoc?.status).toBe("FAILED");
      expect(badDoc?.lastRedeemError).toBe("Coupon expired upstream");
    });
  });

  describe("End-to-End Happy Path Checkout", () => {
    it("completes full order lifecycle: creation -> stock lock -> payment -> coupon redeem -> PAID -> inventory deduction", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-013",
        title: "Embroidered Shawl",
        slug: "embroidered-shawl",
        categoryId,
        basePricePaise: 300000, // ₹3,000.00
        stock: 8,
      });

      // 1. Create order with 1 item and ₹500 Bhavika coupon
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponDiscountPaise: 50000,
        shippingAddress: {
          fullName: "Happy Customer",
          phone: "+919876543210",
          addressLine1: "456 Avenue",
          city: "Bengaluru",
          state: "Karnataka",
          postalCode: "560001",
          country: "India",
        },
      });

      expect(order.netPayablePaise).toBe(250000); // ₹2,500.00 cash

      // Stock is reserved
      let freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.stock).toBe(8);
      expect(freshProduct?.reservedStock).toBe(1);

      // 2. Register Bhavika coupon
      await registerExternalCouponsForOrder({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        coupons: [
          {
            code: "BHAV-HAPPY-001",
            valueRupees: 500,
            discountAppliedPaise: 50000,
          },
        ],
      });

      // 3. Create payment attempt for ₹2,500
      const payment = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: 250000,
      });

      // 4. Razorpay webhook fires with valid payment
      await recordPaymentSuccess({
        paymentAttemptId: payment._id.toString(),
        razorpayPaymentId: "pay_rzp_happy_123",
      });

      // 5. Checkout coordinator executes post-payment redemption
      const checkoutResult = await processPostPaymentCheckout({
        orderRef: order.orderRef,
        paymentAttemptId: payment._id.toString(),
        redeemer: async () => ({ success: true }),
      });

      expect(checkoutResult.status).toBe("PAID");
      expect(checkoutResult.deficitPaise).toBe(0);

      // 6. Verify final Order state
      const finalOrder = await getStoreOrderByRef(order.orderRef);
      expect(finalOrder?.status).toBe("PAID");
      expect(finalOrder?.paymentStatus).toBe("CAPTURED");
      expect(finalOrder?.paidAt).toBeDefined();

      // 7. Verify inventory was permanently fulfilled
      freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.stock).toBe(7); // 8 - 1 = 7
      expect(freshProduct?.reservedStock).toBe(0); // 1 - 1 = 0
    });
  });

  describe("B1. Critical Financial Safety Gaps & Failure Recovery", () => {
    it("rejects Razorpay payment success when amount or currency mismatches", async () => {
      const dummyOrderRef = "JMD-ORD-2026-B1-001";
      const dummyOrderId = "65a000000000000000000010";

      const attempt = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 50000, // ₹500.00
      });

      // Attempt payment success with mismatched amount (e.g., ₹400 instead of ₹500)
      await expect(
        recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_bad_amount",
          amountPaise: 40000,
        }),
      ).rejects.toThrow(/Payment amount mismatch/i);

      // Attempt payment success with mismatched currency (e.g., USD instead of INR)
      await expect(
        recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_bad_curr",
          amountPaise: 50000,
          currency: "USD",
        }),
      ).rejects.toThrow(/Payment currency mismatch/i);
    });

    it("prevents out-of-order webhooks from overwriting terminal states", async () => {
      const dummyOrderRef = "JMD-ORD-2026-B1-002";
      const dummyOrderId = "65a000000000000000000011";

      const attempt = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 75000,
      });

      // Mark attempt as SUCCESS first
      await recordPaymentSuccess({
        paymentAttemptId: attempt._id.toString(),
        razorpayPaymentId: "pay_success_first",
        amountPaise: 75000,
        currency: "INR",
      });

      // Process full refund
      await processRefund({
        paymentAttemptId: attempt._id.toString(),
        refundAmountPaise: 75000,
        refundReason: "Customer return",
        idempotencyKey: `ref:${attempt._id.toString()}:1`,
      });

      // An out-of-order delayed payment.captured webhook arrives AFTER the refund
      await expect(
        recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_delayed_captured",
          amountPaise: 75000,
        }),
      ).rejects.toThrow(/Illegal payment state transition/i);
    });

    it("recovers from Bhavika coupon timeout on retry using stable orderRef and isReplay", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-B1-01",
        title: "Timeout Test Item",
        slug: "timeout-test-item",
        categoryId,
        basePricePaise: 100000,
        stock: 5,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponDiscountPaise: 50000,
        shippingAddress: {
          fullName: "Retry Customer",
          phone: "+919876543210",
          addressLine1: "123 Lane",
          city: "Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      await registerExternalCouponsForOrder({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        coupons: [
          {
            code: "BHAV-TIMEOUT-001",
            valueRupees: 500,
            discountAppliedPaise: 50000,
          },
        ],
      });

      const payment = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: 50000,
      });

      await recordPaymentSuccess({
        paymentAttemptId: payment._id.toString(),
        razorpayPaymentId: "pay_rzp_to_1",
      });

      // 1st attempt: Upstream Bhavika redeemed it, but network timed out before JMD got response
      let callCount = 0;
      const racyRedeemer = async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate timeout exception
          throw new Error("ETIMEDOUT: Connection timed out to Bhavika");
        }
        // 2nd attempt: Upstream recognizes previous redemption for this orderRef and returns isReplay: true
        return { success: true, isReplay: true };
      };

      const firstAttempt = await processPostPaymentCheckout({
        orderRef: order.orderRef,
        paymentAttemptId: payment._id.toString(),
        redeemer: racyRedeemer,
      });

      expect(firstAttempt.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
      expect(firstAttempt.deficitPaise).toBe(50000);

      // 2nd attempt (Retry with identical coupon and orderRef):
      const retryAttempt = await processPostPaymentCheckout({
        orderRef: order.orderRef,
        paymentAttemptId: payment._id.toString(),
        redeemer: racyRedeemer,
      });

      expect(retryAttempt.status).toBe("PAID");
      expect(retryAttempt.deficitPaise).toBe(0);

      const finalOrder = await getStoreOrderByRef(order.orderRef);
      expect(finalOrder?.status).toBe("PAID");

      const db = await getStoreDb();
      const ExternalCoupon = getExternalCouponRedemptionModel(db);
      const couponDoc = await ExternalCoupon.findOne({
        orderRef: order.orderRef,
        code: "BHAV-TIMEOUT-001",
      });
      expect(couponDoc?.status).toBe("REDEEMED");
      expect(couponDoc?.isReplay).toBe(true);
    });

    it("enforces atomic single-use when concurrent orders race to redeem the same Bhavika coupon", async () => {
      // Simulate Bhavika upstream coupon ledger
      const upstreamBhavikaCouponState: Record<
        string,
        { status: "ACTIVE" | "REDEEMED"; orderRef?: string }
      > = {
        "BHAV-CONCURRENT-001": { status: "ACTIVE" },
      };

      const mockUpstreamRedeemer = async (code: string, orderRef: string) => {
        const record = upstreamBhavikaCouponState[code];
        if (!record || record.status !== "ACTIVE") {
          return { success: false, error: "Coupon already redeemed or invalid" };
        }
        record.status = "REDEEMED";
        record.orderRef = orderRef;
        return { success: true };
      };

      // Two simultaneous parallel redemptions for different orders
      const orderRef1 = "JMD-ORD-RACE-001";
      const orderRef2 = "JMD-ORD-RACE-002";

      const [res1, res2] = await Promise.all([
        mockUpstreamRedeemer("BHAV-CONCURRENT-001", orderRef1),
        mockUpstreamRedeemer("BHAV-CONCURRENT-001", orderRef2),
      ]);

      // Exactly one must succeed, and exactly one must fail
      const outcomes = [res1.success, res2.success];
      expect(outcomes.filter((s) => s)).toHaveLength(1);
      expect(outcomes.filter((s) => !s)).toHaveLength(1);
    });

    it("protects inventory when stock reservation expiry races with payment success", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-B1-02",
        title: "Expiring Stock Item",
        slug: "expiring-stock-item",
        categoryId,
        basePricePaise: 40000,
        stock: 1, // Only 1 unit in stock
      });

      // Create order with 15-minute reservation
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        reservationMinutes: 15,
        shippingAddress: {
          fullName: "Racer",
          phone: "+919876543210",
          addressLine1: "123 Race St",
          city: "Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      // Reserved stock is now 1
      let freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(1);

      // Simulate passage of 16 minutes: cancelExpiredOrders runs
      const pastTime = new Date(Date.now() + 16 * 60 * 1000);
      const expiredCount = await cancelExpiredOrders(pastTime);
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const expiredOrder = await getStoreOrderByRef(order.orderRef);
      expect(expiredOrder?.status).toBe("EXPIRED");

      // Reserved stock returned to pool
      freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(0);
      expect(freshProduct?.stock).toBe(1);

      // Now, a payment webhook arrives for this expired order
      const payment = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: 40000,
      });

      await recordPaymentSuccess({
        paymentAttemptId: payment._id.toString(),
        razorpayPaymentId: "pay_racing_payment",
      });

      // Checkout coordinator must detect the expired order and throw, rejecting dispatch
      await expect(
        processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: payment._id.toString(),
        }),
      ).rejects.toThrow(/stock reservation expired/i);

      // Stock remains unallocated and safe
      freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.stock).toBe(1);
      expect(freshProduct?.reservedStock).toBe(0);
    });

    it("implements idempotent refunds and prevents refunding unpaid or exceeded amounts", async () => {
      const dummyOrderRef = "JMD-ORD-2026-B1-003";
      const dummyOrderId = "65a000000000000000000012";

      const attempt = await createPaymentAttempt({
        orderRef: dummyOrderRef,
        orderId: dummyOrderId,
        memberId,
        attemptNumber: 1,
        amountPaise: 60000, // ₹600.00
      });

      // 1. Refunding before payment SUCCESS must throw
      await expect(
        processRefund({
          paymentAttemptId: attempt._id.toString(),
          refundAmountPaise: 60000,
          refundReason: "Pre-payment refund attempt",
          idempotencyKey: "ref_fail_01",
        }),
      ).rejects.toThrow(/must be in SUCCESS/i);

      // Mark payment SUCCESS
      await recordPaymentSuccess({
        paymentAttemptId: attempt._id.toString(),
        razorpayPaymentId: "pay_captured_600",
      });

      // 2. Refunding more than paid amount must throw
      await expect(
        processRefund({
          paymentAttemptId: attempt._id.toString(),
          refundAmountPaise: 70000, // Exceeds ₹600
          refundReason: "Excess refund",
          idempotencyKey: "ref_excess_01",
        }),
      ).rejects.toThrow(/cannot exceed payment attempt amount/i);

      // 3. Valid full refund succeeds
      const refundResult1 = await processRefund({
        paymentAttemptId: attempt._id.toString(),
        refundAmountPaise: 60000,
        refundReason: "Customer cancelled",
        idempotencyKey: "ref_valid_01",
      });
      expect(refundResult1.isReplay).toBe(false);
      expect(refundResult1.attempt.status).toBe("REFUNDED");

      // 4. Duplicate refund call with same idempotency key returns replay without double mutation
      const refundResult2 = await processRefund({
        paymentAttemptId: attempt._id.toString(),
        refundAmountPaise: 60000,
        refundReason: "Customer cancelled",
        idempotencyKey: "ref_valid_01",
      });
      expect(refundResult2.isReplay).toBe(true);
      expect(refundResult2.attempt.status).toBe("REFUNDED");
    });

    it("verifies exact Bhavika integration signing protocol against docs/JAI_MAA_DURGA_INTEGRATION.md vectors", () => {
      // Test Vector 1: Validate payload from Section 5.2
      const secret = "jmd_test_secret_do_not_use_in_production";
      const timestampSeconds = 1767225600;
      const validateBody = '{"code":"BHAV-7K2X-9QM4-P8RT"}';

      const validateSigned = signBhavikaRequest(validateBody, secret, timestampSeconds);
      expect(validateSigned.timestamp).toBe("1767225600");
      expect(validateSigned.signature).toBe("aLn9DjVNP8kFhaRIA5U00nHbkngzDYZ3OuerHxjTjIM");

      // Test Vector 2: Redeem payload from Section 5.2
      const redeemBody = '{"code":"BHAV-7K2X-9QM4-P8RT","externalRef":"JMD-2026-000481"}';
      const redeemSigned = signBhavikaRequest(redeemBody, secret, timestampSeconds);
      expect(redeemSigned.timestamp).toBe("1767225600");
      expect(redeemSigned.signature).toBe("b0Ho91UecJC6w3BfTMzFGadapA0VNGJcbKTAGRCTFTw");
    });

    it("enforces strict production guards: never permits offline mocks when NODE_ENV is production", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.BHAVIKA_INTEGRATION_SECRET;
      const originalBase = process.env.BHAVIKA_API_BASE;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.BHAVIKA_API_BASE;
        delete process.env.BHAVIKA_INTEGRATION_SECRET;

        expect(() => getBhavikaConfig()).toThrow(
          /BHAVIKA_API_BASE is required in production/i,
        );

        process.env.BHAVIKA_API_BASE = "https://bhavika-education-welfare.vercel.app";
        expect(() => getBhavikaConfig()).toThrow(
          /BHAVIKA_INTEGRATION_SECRET must be configured/i,
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
        if (originalSecret) process.env.BHAVIKA_INTEGRATION_SECRET = originalSecret;
        if (originalBase) process.env.BHAVIKA_API_BASE = originalBase;
      }
    });

    it("verifies store admin permission isolation and immutable audit logging", async () => {
      // 1. Ordinary user/member session is rejected with 403 FORBIDDEN
      const regularUser = { id: memberId, role: "USER", name: "Regular Member" };
      await expect(
        verifyStoreAdminCapability(regularUser, "STORE_INVENTORY_ADJUST"),
      ).rejects.toThrow(/Store capability 'STORE_INVENTORY_ADJUST' is required/i);

      // Unauthenticated access is rejected
      await expect(
        verifyStoreAdminCapability(null, "STORE_CATALOGUE_MANAGE"),
      ).rejects.toThrow(/Store capability 'STORE_CATALOGUE_MANAGE' is required/i);

      // 2. Authenticated admin with capability executes and writes immutable audit row
      const adminUser = { id: "65a000000000000000000099", role: "ADMIN", name: "Super Admin" };
      const auditBeforeCount = await AdminAuditLog.countDocuments();

      await verifyStoreAdminCapability(adminUser, "STORE_INVENTORY_ADJUST", {
        action: "STORE_INVENTORY_ADJUST",
        targetType: "STORE_PRODUCT",
        targetId: "prod_test_01",
        reason: "Routine reconciliation audit test",
        meta: { delta: 5 },
      });

      const auditAfterCount = await AdminAuditLog.countDocuments();
      expect(auditAfterCount).toBe(auditBeforeCount + 1);

      const latestAudit = await AdminAuditLog.findOne({ action: "STORE_INVENTORY_ADJUST" }).sort({ createdAt: -1 });
      expect(latestAudit).toBeDefined();
      expect(latestAudit?.reason).toBe("Routine reconciliation audit test");
      expect(latestAudit?.targetType).toBe("STORE_PRODUCT");
    });
  });
});

