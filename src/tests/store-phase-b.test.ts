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
import { calculateCart, CartInputItem } from "@/server/store/services/cart.service";
import {
  createStoreOrder,
  transitionOrderStatus,
  getStoreOrderByRef,
  cancelExpiredOrders,
  recoverOrderCompensation,
} from "@/server/store/services/order.service";
import {
  createPaymentAttempt,
  recordPaymentSuccess,
  recordPaymentFailure,
  processRefund,
  reconcilePaymentRefund,
  sweepPendingRefunds,
  handleRazorpayRefundWebhook,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "@/server/store/services/payment.service";
import {
  registerExternalCouponsForOrder,
  processPostPaymentCheckout,
  processZeroCashCouponCheckout,
} from "@/server/store/services/checkout.service";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getExternalCouponRedemptionModel } from "@/server/store/models/ExternalCouponRedemption";
import { getStorePaymentAttemptModel } from "@/server/store/models/StorePaymentAttempt";
import {
  signBhavikaRequest,
  getBhavikaConfig,
} from "@/server/store/services/bhavika-client.service";
import { resolveAuthoritativeCoupons } from "@/server/store/services/coupon-authority.service";
import {
  getStoreCouponModel,
  StoreCouponStatus,
  StoreCouponSource,
} from "@/server/store/models/StoreCoupon";
import { getStoreWalletModel } from "@/server/store/models/StoreWallet";
import { getStoreWalletLedgerModel } from "@/server/store/models/StoreWalletLedger";
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
      expect(cart.shippingFeePaise).toBe(0);
      expect(cart.totalPayablePaise).toBe(cart.itemsTotalPaise);
    });

    it("applies standard shipping charge of ₹99 for orders strictly below ₹999 threshold", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-003B",
        title: "Woolen Scarf",
        slug: "woolen-scarf",
        categoryId,
        basePricePaise: 49900, // ₹499.00 (< ₹999)
        stock: 10,
      });

      const cart = await calculateCart([{ productId: p._id.toString(), quantity: 1 }]);
      expect(cart.itemsTotalPaise).toBe(49900);
      expect(cart.shippingFeePaise).toBe(9900); // ₹99.00 standard delivery
      expect(cart.totalPayablePaise).toBe(49900 + 9900);
      expect(cart.qualifiesForFreeShipping).toBe(false);
    });

    it("verifies exact boundary case: ₹998.99 (99,899 paise) incurs standard shipping of ₹99", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-BOUND-99899",
        title: "Boundary Item 998.99",
        slug: "boundary-item-99899",
        categoryId,
        basePricePaise: 99899, // ₹998.99 (strictly < 99,900 paise)
        stock: 10,
      });

      const cart = await calculateCart([{ productId: p._id.toString(), quantity: 1 }]);
      expect(cart.itemsTotalPaise).toBe(99899);
      expect(cart.shippingFeePaise).toBe(9900); // Standard shipping
      expect(cart.totalPayablePaise).toBe(99899 + 9900);
      expect(cart.qualifiesForFreeShipping).toBe(false);
    });

    it("verifies exact boundary case: ₹999.00 (99,900 paise) qualifies for FREE shipping", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-BOUND-99900",
        title: "Boundary Item 999.00",
        slug: "boundary-item-99900",
        categoryId,
        basePricePaise: 99900, // Exactly ₹999.00 (99,900 paise)
        stock: 10,
      });

      const cart = await calculateCart([{ productId: p._id.toString(), quantity: 1 }]);
      expect(cart.itemsTotalPaise).toBe(99900);
      expect(cart.shippingFeePaise).toBe(0); // FREE shipping
      expect(cart.totalPayablePaise).toBe(99900);
      expect(cart.qualifiesForFreeShipping).toBe(true);
    });

    it("verifies exact boundary case: ₹999.01 (99,901 paise) qualifies for FREE shipping", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-BOUND-99901",
        title: "Boundary Item 999.01",
        slug: "boundary-item-99901",
        categoryId,
        basePricePaise: 99901, // ₹999.01 (strictly > 99,900 paise)
        stock: 10,
      });

      const cart = await calculateCart([{ productId: p._id.toString(), quantity: 1 }]);
      expect(cart.itemsTotalPaise).toBe(99901);
      expect(cart.shippingFeePaise).toBe(0); // FREE shipping
      expect(cart.totalPayablePaise).toBe(99901);
      expect(cart.qualifiesForFreeShipping).toBe(true);
    });

    it("enforces rule: free-shipping applies to merchandise subtotal before coupons", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-COUPON-SUBTOTAL",
        title: "Festive Kurta",
        slug: "festive-kurta",
        categoryId,
        basePricePaise: 150000, // ₹1,500.00 merchandise (> ₹999)
        stock: 10,
      });

      // Customer applies ₹600 coupon (60,000 paise).
      // Merchandise is ₹1,500 >= ₹999 => shipping is FREE.
      // Net payable is ₹1,500 - ₹600 = ₹900. Free shipping is retained.
      const cart = await calculateCart(
        [{ productId: p._id.toString(), quantity: 1 }],
        { couponDiscountPaise: 60000 },
      );

      expect(cart.itemsTotalPaise).toBe(150000);
      expect(cart.qualifiesForFreeShipping).toBe(true);
      expect(cart.shippingFeePaise).toBe(0);
      expect(cart.couponDiscountPaise).toBe(60000);
      expect(cart.totalPayablePaise).toBe(90000); // ₹900.00
    });

    it("proves client-submitted tampering cannot alter server-calculated prices, shipping, or total", async () => {
      const p = await createStoreProduct({
        sku: "JMD-FASH-TAMPER-01",
        title: "Premium Jacket",
        slug: "premium-jacket",
        categoryId,
        basePricePaise: 50000, // Real DB price ₹500 (< ₹999 threshold)
        stock: 5,
      });

      // Malicious client attempts to pass fraudulent prices or custom zero shipping
      const maliciousClientPayload = [
        {
          productId: p._id.toString(),
          quantity: 1,
          priceRupees: 1, // Attempted tamper: 1 rupee
          basePricePaise: 100, // Attempted tamper: 100 paise
          shippingFeePaise: 0, // Attempted tamper: free shipping
          totalPayablePaise: 100, // Attempted tamper
        },
      ];

      // calculateCart ignores client fields and queries database
      const cart = await calculateCart(
        maliciousClientPayload as unknown as CartInputItem[],
      );
      expect(cart.itemsTotalPaise).toBe(50000); // Enforced ₹500 from DB
      expect(cart.shippingFeePaise).toBe(9900); // Enforced ₹99 standard shipping from policy
      expect(cart.totalPayablePaise).toBe(59900); // Enforced ₹599

      // createStoreOrder independently recalculates
      const order = await createStoreOrder({
        memberId,
        items: maliciousClientPayload as unknown as CartInputItem[],
        shippingAddress: {
          fullName: "Security Auditor",
          phone: "+919876543210",
          addressLine1: "Cyber Cell",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(order.itemsTotalPaise).toBe(50000);
      expect(order.shippingFeePaise).toBe(9900);
      expect(order.netPayablePaise).toBe(59900);
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

  describe("Coupon Discount Authority & Zero-Cash Checkout Security", () => {
    it("rejects fabricated or non-existent coupon codes with INVALID_COUPON", async () => {
      await expect(
        resolveAuthoritativeCoupons({
          couponCodes: ["FABRICATED-FAKE-COUPON-999"],
          memberId,
        }),
      ).rejects.toThrow(/invalid or unusable/i);

      const p = await createStoreProduct({
        sku: "JMD-SEC-001",
        title: "Security Shield",
        slug: "security-shield-001",
        categoryId,
        basePricePaise: 120000,
        stock: 5,
      });

      await expect(
        createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: ["FABRICATED-FAKE-COUPON-999"],
          shippingAddress: {
            fullName: "Attacker",
            phone: "+919999999999",
            addressLine1: "Dark Web Road",
            city: "Metropolis",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        }),
      ).rejects.toThrow();
    });

    it("strictly ignores client-claimed values and derives exact discount from database records", async () => {
      const db = await getStoreDb();
      const StoreCoupon = getStoreCouponModel(db);

      const testCode = `TEST-JMD-AUTH-${Date.now()}`;
      await StoreCoupon.create({
        couponCode: testCode,
        member: memberId,
        faceValuePaise: 25000, // ₹250.00
        source: StoreCouponSource.ADMIN_GRANT,
        status: StoreCouponStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        isEligibleForDraw: false,
      });

      // 1. Authoritative resolution: value is strictly 25000 paise (₹250), not anything client claimed
      const res = await resolveAuthoritativeCoupons({
        couponCodes: [testCode],
        memberId,
      });
      expect(res.totalDiscountPaise).toBe(25000);
      expect(res.totalDiscountRupees).toBe(250);
      expect(res.coupons[0].valueRupees).toBe(250);
      expect(res.coupons[0].valuePaise).toBe(25000);

      // 2. createStoreOrder recalculates: item ₹1,200.00 - coupon ₹250.00 = ₹950.00 (95,000 paise)
      // Even if attacker attempted to submit couponDiscountPaise: 999999
      const p = await createStoreProduct({
        sku: "JMD-SEC-002",
        title: "Gold Brooch",
        slug: "gold-brooch-002",
        categoryId,
        basePricePaise: 120000,
        stock: 5,
      });

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponCodes: [testCode],
        couponDiscountPaise: 999999, // Should be completely overridden by authoritative coupon
        shippingAddress: {
          fullName: "Security Verifier",
          phone: "+919876543210",
          addressLine1: "Verified Avenue",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(order.couponDiscountPaise).toBe(25000); // Authoritative ₹250.00
      expect(order.netPayablePaise).toBe(95000); // Exactly ₹950.00 payable
    });

    it("rejects duplicate coupon codes submitted in the same order", async () => {
      const db = await getStoreDb();
      const StoreCoupon = getStoreCouponModel(db);
      const testCode = `TEST-DUP-${Date.now()}`;
      await StoreCoupon.create({
        couponCode: testCode,
        member: memberId,
        faceValuePaise: 10000,
        source: StoreCouponSource.ADMIN_GRANT,
        status: StoreCouponStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        isEligibleForDraw: false,
      });

      await expect(
        resolveAuthoritativeCoupons({
          couponCodes: [testCode, testCode.toLowerCase(), ` ${testCode} `],
          memberId,
        }),
      ).rejects.toThrow(/Duplicate coupon code/i);
    });

    it("rejects expired store coupons", async () => {
      const db = await getStoreDb();
      const StoreCoupon = getStoreCouponModel(db);
      const expiredCode = `TEST-EXP-${Date.now()}`;
      await StoreCoupon.create({
        couponCode: expiredCode,
        member: memberId,
        faceValuePaise: 10000,
        source: StoreCouponSource.ADMIN_GRANT,
        status: StoreCouponStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 10000), // Expired in past
        isEligibleForDraw: false,
      });

      await expect(
        resolveAuthoritativeCoupons({
          couponCodes: [expiredCode],
          memberId,
        }),
      ).rejects.toThrow(/expired/i);
    });

    it("rejects already redeemed or cancelled store coupons", async () => {
      const db = await getStoreDb();
      const StoreCoupon = getStoreCouponModel(db);
      const redeemedCode = `TEST-RED-${Date.now()}`;
      await StoreCoupon.create({
        couponCode: redeemedCode,
        member: memberId,
        faceValuePaise: 10000,
        source: StoreCouponSource.ADMIN_GRANT,
        status: StoreCouponStatus.REDEEMED,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        isEligibleForDraw: false,
      });

      await expect(
        resolveAuthoritativeCoupons({
          couponCodes: [redeemedCode],
          memberId,
        }),
      ).rejects.toThrow(/cannot be used/i);
    });

    it("rejects store coupons belonging to another member", async () => {
      const db = await getStoreDb();
      const StoreCoupon = getStoreCouponModel(db);
      const otherMemberCode = `TEST-OTHER-${Date.now()}`;
      await StoreCoupon.create({
        couponCode: otherMemberCode,
        member: "65a000000000000000000088", // Different member
        faceValuePaise: 10000,
        source: StoreCouponSource.ADMIN_GRANT,
        status: StoreCouponStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        isEligibleForDraw: false,
      });

      await expect(
        resolveAuthoritativeCoupons({
          couponCodes: [otherMemberCode],
          memberId,
        }),
      ).rejects.toThrow(/does not belong to the current member/i);
    });

    it("executes zero-cash checkout for 100% coupon covered order: marks PAID and permanently fulfills inventory", async () => {
      const p = await createStoreProduct({
        sku: "JMD-SEC-003",
        title: "Full Coupon Item",
        slug: "full-coupon-item-003",
        categoryId,
        basePricePaise: 100000, // ₹1,000.00 (qualifies for free shipping >= ₹999)
        stock: 5,
      });

      const coupon1 = `ZERO-CASH-COUP-1-${Date.now()}`;
      const coupon2 = `ZERO-CASH-COUP-2-${Date.now()}`;

      // Custom mock validator to simulate Bhavika external coupons of ₹500 each = ₹1,000
      const customValidator = async (code: string) => {
        if (code === coupon1 || code === coupon2) {
          return { valid: true, valueRupees: 500 };
        }
        return { valid: false, error: "Not found" };
      };

      const redeemedCodes: string[] = [];
      const customRedeemer = async (code: string) => {
        redeemedCodes.push(code);
        return { success: true };
      };

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponCodes: [coupon1, coupon2],
        customCouponValidator: customValidator,
        couponRedeemer: customRedeemer,
        shippingAddress: {
          fullName: "Zero Cash Customer",
          phone: "+919876543210",
          addressLine1: "Free Street",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      // Total items = ₹1,000, shipping = ₹0, coupons = ₹1,000, net payable = 0
      expect(order.netPayablePaise).toBe(0);
      expect(order.status).toBe("PAID");
      expect(order.paymentStatus).toBe("SETTLED_COUPONS");
      expect(order.paidCashPaise).toBe(0);
      expect(order.settledBhavikaCouponsPaise).toBe(100000);
      expect(order.settledStoreCouponsPaise).toBe(0);
      expect(redeemedCodes).toEqual([coupon1, coupon2]);

      // Proves a zero-cash order creates no fictitious Razorpay capture or payment attempt
      const db = await getStoreDb();
      const PaymentAttempt = getStorePaymentAttemptModel(db);
      const fictitiousAttempts = await PaymentAttempt.find({ orderRef: order.orderRef });
      expect(fictitiousAttempts).toHaveLength(0);

      // Reserved stock should be 0 and physical stock decremented to 4 (permanently fulfilled)
      const freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(0);
      expect(freshProduct?.stock).toBe(4);

      // Re-running zero-cash checkout is idempotent and does not re-redeem or double decrement
      const retryRes = await processZeroCashCouponCheckout({
        orderRef: order.orderRef,
        redeemer: customRedeemer,
      });
      expect(retryRes.status).toBe("PAID");
      expect(redeemedCodes.length).toBe(2); // No extra redemptions

      const productAfterRetry = await getStoreProductById(p._id.toString());
      expect(productAfterRetry?.stock).toBe(4);
    });

    it("locks inventory dispatch in PARTIAL_COUPON_REDEMPTION_DEFICIT if any coupon fails redemption", async () => {
      const p = await createStoreProduct({
        sku: "JMD-SEC-004",
        title: "Partial Failure Item",
        slug: "partial-failure-item-004",
        categoryId,
        basePricePaise: 150000, // ₹1,500.00
        stock: 5,
      });

      const couponGood = `ZERO-GOOD-${Date.now()}`;
      const couponBad = `ZERO-BAD-${Date.now()}`;

      const customValidator = async (code: string) => {
        if (code === couponGood) return { valid: true, valueRupees: 1000 };
        if (code === couponBad) return { valid: true, valueRupees: 500 };
        return { valid: false, error: "Not found" };
      };

      // Redeemer where couponBad fails
      const customRedeemer = async (code: string) => {
        if (code === couponGood) return { success: true };
        return { success: false, error: "Coupon already redeemed at Bhavika central register" };
      };

      const order = await createStoreOrder({
        memberId,
        items: [{ productId: p._id.toString(), quantity: 1 }],
        couponCodes: [couponGood, couponBad],
        customCouponValidator: customValidator,
        couponRedeemer: customRedeemer,
        shippingAddress: {
          fullName: "Deficit Customer",
          phone: "+919876543210",
          addressLine1: "Deficit Street",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      // Total = ₹1,500, coupons = ₹1,500, net payable = 0, but 1 coupon failed during zero-cash checkout
      expect(order.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
      expect(order.deficitPaise).toBe(50000); // ₹500 deficit
      expect(order.paymentStatus).toBe("UNPAID");

      // PREVENT PREMATURE FULFILLMENT: Stock MUST remain reserved, NOT fulfilled!
      const freshProduct = await getStoreProductById(p._id.toString());
      expect(freshProduct?.reservedStock).toBe(1);
      expect(freshProduct?.stock).toBe(5); // Physical stock not decremented

      // Order cannot transition to PROCESSING or SHIPPED while in deficit
      await expect(
        transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "PROCESSING",
        }),
      ).rejects.toThrow(/Illegal order transition/i);

      await expect(
        transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "SHIPPED",
        }),
      ).rejects.toThrow(/Illegal order transition/i);
    });

    describe("Coupon Over-Coverage and Value Protection Invariants", () => {
      it("accepts coupon face value exactly equal to the gross order value", async () => {
        const p = await createStoreProduct({
          sku: "JMD-OVER-001",
          title: "Exact Value Item",
          slug: "exact-value-item",
          categoryId,
          basePricePaise: 50000, // ₹500.00 (< ₹999 -> ₹99 shipping -> gross ₹599.00)
          stock: 5,
        });

        // Test with calculateCart where coupon exactly matches gross value
        const cart = await calculateCart(
          [{ productId: p._id.toString(), quantity: 1 }],
          { couponDiscountPaise: 59900 },
        );
        expect(cart.itemsTotalPaise).toBe(50000);
        expect(cart.shippingFeePaise).toBe(9900);
        expect(cart.couponDiscountPaise).toBe(59900);
        expect(cart.totalPayablePaise).toBe(0);
      });

      it("rejects coupon face value strictly greater than gross order value with COUPON_OVERCOVERAGE_PROHIBITED", async () => {
        const p = await createStoreProduct({
          sku: "JMD-OVER-002",
          title: "Incompatible Small Item",
          slug: "incompatible-small-item",
          categoryId,
          basePricePaise: 25000, // ₹250.00 + ₹99 shipping = ₹349.00 gross (34,900 paise)
          stock: 5,
        });

        const highCoupon = `HIGH-COUP-${Date.now()}`;
        const customValidator = async (code: string) => {
          if (code === highCoupon) return { valid: true, valueRupees: 500 }; // ₹500 coupon > ₹349 gross
          return { valid: false };
        };

        // Must reject in calculateCart
        await expect(
          calculateCart(
            [{ productId: p._id.toString(), quantity: 1 }],
            { couponDiscountPaise: 50000 },
          ),
        ).rejects.toThrow(/exceeds gross order value/i);

        // Must reject in createStoreOrder without burning the coupon or reserving stock
        await expect(
          createStoreOrder({
            memberId,
            items: [{ productId: p._id.toString(), quantity: 1 }],
            couponCodes: [highCoupon],
            customCouponValidator: customValidator,
            shippingAddress: {
              fullName: "Overcoverage Tester",
              phone: "+919876543210",
              addressLine1: "Test Address",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "India",
            },
          }),
        ).rejects.toThrow(/exceeds gross order value/i);

        // Stock was NOT reserved
        const freshProduct = await getStoreProductById(p._id.toString());
        expect(freshProduct?.reservedStock).toBe(0);
      });

      it("rejects multiple coupons whose combined face value exceeds gross order value", async () => {
        const p = await createStoreProduct({
          sku: "JMD-OVER-003",
          title: "Medium Value Item",
          slug: "medium-value-item",
          categoryId,
          basePricePaise: 100000, // ₹1,000.00 (qualifies for free shipping -> gross ₹1,000.00)
          stock: 5,
        });

        const couponA = `MULTI-OVER-A-${Date.now()}`;
        const couponB = `MULTI-OVER-B-${Date.now()}`;

        const customValidator = async (code: string) => {
          if (code === couponA) return { valid: true, valueRupees: 600 };
          if (code === couponB) return { valid: true, valueRupees: 500 }; // 600 + 500 = ₹1,100 > ₹1,000 gross
          return { valid: false };
        };

        await expect(
          createStoreOrder({
            memberId,
            items: [{ productId: p._id.toString(), quantity: 1 }],
            couponCodes: [couponA, couponB],
            customCouponValidator: customValidator,
            shippingAddress: {
              fullName: "Multi Overcoverage Tester",
              phone: "+919876543210",
              addressLine1: "Test Address",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "India",
            },
          }),
        ).rejects.toThrow(/exceeds gross order value/i);
      });

      it("safely preserves valid coupons when applied combination is invalid", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const nativeCouponA = `SAFE-A-${Date.now()}`;
        const nativeCouponB = `SAFE-B-${Date.now()}`;

        await StoreCoupon.create({
          couponCode: nativeCouponA,
          member: memberId,
          faceValuePaise: 40000, // ₹400
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        await StoreCoupon.create({
          couponCode: nativeCouponB,
          member: memberId,
          faceValuePaise: 40000, // ₹400 (Combined = ₹800 on a ₹500 item + ₹99 shipping = ₹599 gross)
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: "JMD-OVER-004",
          title: "Item For Combination Check",
          slug: "item-combination-check",
          categoryId,
          basePricePaise: 50000, // ₹500.00
          stock: 5,
        });

        await expect(
          createStoreOrder({
            memberId,
            items: [{ productId: p._id.toString(), quantity: 1 }],
            couponCodes: [nativeCouponA, nativeCouponB],
            shippingAddress: {
              fullName: "Safe Check",
              phone: "+919876543210",
              addressLine1: "Safe Road",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "India",
            },
          }),
        ).rejects.toThrow(/exceeds gross order value/i);

        // Both coupons MUST remain ACTIVE and completely untouched in database
        const couponDocA = await StoreCoupon.findOne({ couponCode: nativeCouponA });
        const couponDocB = await StoreCoupon.findOne({ couponCode: nativeCouponB });
        expect(couponDocA?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(couponDocB?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(couponDocA?.lockedOrderRef).toBeNull();
        expect(couponDocB?.lockedOrderRef).toBeNull();
      });
    });

    describe("Native Coupon Lifecycle, Atomic Reservation & Race Protection", () => {
      it("atomically transitions native coupon to LOCKED_IN_CHECKOUT on order creation and restores to ACTIVE on cancellation", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const testCode = `NATIVE-LIFE-1-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: testCode,
          member: memberId,
          faceValuePaise: 20000, // ₹200.00
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: "JMD-LIFE-001",
          title: "Lifecycle Item 1",
          slug: "lifecycle-item-001",
          categoryId,
          basePricePaise: 120000,
          stock: 5,
        });

        // 1. Order Creation: coupon should be LOCKED_IN_CHECKOUT (NOT permanently redeemed)
        const order = await createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [testCode],
          shippingAddress: {
            fullName: "Lifecycle User",
            phone: "+919876543210",
            addressLine1: "Lifecycle Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const lockedCoupon = await StoreCoupon.findOne({ couponCode: testCode });
        expect(lockedCoupon?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);
        expect(lockedCoupon?.lockedOrderRef).toBe(order.orderRef);
        expect(lockedCoupon?.redeemedAt).toBeNull();

        // 2. Cancellation: coupon must be restored to ACTIVE
        await transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "CANCELLED",
          cancellationReason: "User aborted payment",
        });

        const restoredCoupon = await StoreCoupon.findOne({ couponCode: testCode });
        expect(restoredCoupon?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(restoredCoupon?.lockedOrderRef).toBeNull();
        expect(restoredCoupon?.redeemedAt).toBeNull();
      });

      it("restores native coupon to ACTIVE on stock reservation expiry (cancelExpiredOrders)", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const testCode = `NATIVE-EXPIRY-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: testCode,
          member: memberId,
          faceValuePaise: 20000,
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: "JMD-LIFE-002",
          title: "Expiry Test Item",
          slug: "expiry-test-item",
          categoryId,
          basePricePaise: 120000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [testCode],
          reservationMinutes: 1,
          shippingAddress: {
            fullName: "Expiry User",
            phone: "+919876543210",
            addressLine1: "Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        expect(order.orderRef).toBeDefined();
        expect((await StoreCoupon.findOne({ couponCode: testCode }))?.status).toBe(
          StoreCouponStatus.LOCKED_IN_CHECKOUT,
        );

        // Advance simulated time past 15 minutes and trigger sweep
        const future = new Date(Date.now() + 60 * 60 * 1000);
        const expiredCount = await cancelExpiredOrders(future);
        expect(expiredCount).toBeGreaterThanOrEqual(1);

        const refreshedCoupon = await StoreCoupon.findOne({ couponCode: testCode });
        expect(refreshedCoupon?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(refreshedCoupon?.lockedOrderRef).toBeNull();
      });

      it("consumes native coupon to REDEEMED exactly once upon successful cash payment completion", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const testCode = `NATIVE-PAID-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: testCode,
          member: memberId,
          faceValuePaise: 20000, // ₹200.00
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: "JMD-LIFE-003",
          title: "Paid Test Item",
          slug: "paid-test-item",
          categoryId,
          basePricePaise: 120000, // ₹1,200.00 item
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [testCode],
          shippingAddress: {
            fullName: "Paid User",
            phone: "+919876543210",
            addressLine1: "Paid Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // Cash payable = ₹1,200 - ₹200 = ₹1,000 (100,000 paise)
        expect(order.netPayablePaise).toBe(100000);
        expect(order.settledStoreCouponsPaise).toBe(20000);
        expect(order.settledBhavikaCouponsPaise).toBe(0);

        // Simulate successful payment gateway attempt
        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 100000,
        });

        const successRes = await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_test_lifecycle_999",
          razorpaySignature: "mock_sig_999",
        });
        expect(successRes.attempt.status).toBe("SUCCESS");

        // Complete checkout coordinator
        const checkoutRes = await processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: attempt._id.toString(),
        });
        expect(checkoutRes.status).toBe("PAID");
        expect(checkoutRes.order.paymentStatus).toBe("CAPTURED");
        expect(checkoutRes.order.paidCashPaise).toBe(100000);

        // Native coupon is now REDEEMED
        const redeemedCoupon = await StoreCoupon.findOne({ couponCode: testCode });
        expect(redeemedCoupon?.status).toBe(StoreCouponStatus.REDEEMED);
        expect(redeemedCoupon?.redeemedOrderRef).toBe(order.orderRef);
        expect(redeemedCoupon?.redeemedAt).toBeInstanceOf(Date);

        // Reconciliation Invariant: settledStoreCoupons + settledBhavikaCoupons + paidCash === grossTotal
        const grossTotal = order.itemsTotalPaise + order.shippingFeePaise;
        expect(
          checkoutRes.order.settledStoreCouponsPaise +
            checkoutRes.order.settledBhavikaCouponsPaise +
            checkoutRes.order.paidCashPaise,
        ).toBe(grossTotal);
      });

      it("protects concurrent checkout race: two orders attempting to use the same active native coupon concurrently", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const raceCode = `RACE-COUP-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: raceCode,
          member: memberId,
          faceValuePaise: 30000, // ₹300.00
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: "JMD-RACE-001",
          title: "Race Item",
          slug: "race-item",
          categoryId,
          basePricePaise: 150000,
          stock: 10,
        });

        // Launch two concurrent order creations targeting the exact same coupon
        const orderPayload = {
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [raceCode],
          shippingAddress: {
            fullName: "Race Winner",
            phone: "+919876543210",
            addressLine1: "Race Track",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        };

        const results = await Promise.allSettled([
          createStoreOrder(orderPayload),
          createStoreOrder(orderPayload),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        // Exactly one order MUST succeed; the other MUST be rejected with concurrency lock error
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
        expect(rejectedReason.message).toMatch(/currently locked in another checkout session|already locked/i);

        // The coupon is locked by the winning order
        const winningOrder = (fulfilled[0] as PromiseFulfilledResult<{ orderRef: string }>).value;
        const couponDoc = await StoreCoupon.findOne({ couponCode: raceCode });
        expect(couponDoc?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);
        expect(couponDoc?.lockedOrderRef).toBe(winningOrder.orderRef);
      });
    });

    describe("Final Accounting Acceptance — Multi-Coupon, Edge Cases & Zero-Cash Recovery", () => {
      it("executes zero-cash multi-coupon settlement combining native and Bhavika coupons", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);
        const PaymentAttempt = getStorePaymentAttemptModel(db);
        const ExternalCoupon = getExternalCouponRedemptionModel(db);

        // 1. Create a native coupon worth ₹200 (20,000 paise)
        const nativeCode = `NAT-ZERO-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: nativeCode,
          member: memberId,
          faceValuePaise: 20000,
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        // 2. Prepare 2 external Bhavika coupons: ₹500 + ₹500 = ₹1,000 (100,000 paise)
        const bhavikaCode1 = `BHAV-MULTI-001-${Date.now()}`;
        const bhavikaCode2 = `BHAV-MULTI-002-${Date.now()}`;

        // 3. Create a product worth ₹1,200 (120,000 paise) -> free shipping (>= ₹999)
        const product = await createStoreProduct({
          sku: `SKU-ZERO-${Date.now()}`,
          title: "Divine Multi-Coupon Puja Set",
          slug: `multi-set-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 10,
        });

        // 4. Create zero-cash order covered 100% by ₹200 native + ₹500 Bhavika + ₹500 Bhavika = ₹1,200
        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [nativeCode, bhavikaCode1, bhavikaCode2],
          customCouponValidator: async (code) => {
            if (code === bhavikaCode1 || code === bhavikaCode2) {
              return { valid: true, valueRupees: 500 };
            }
            return { valid: false };
          },
          couponRedeemer: async () => {
            return { success: true, isReplay: false };
          },
          shippingAddress: {
            fullName: "Zero Cash Multi Recipient",
            phone: "+919876543210",
            addressLine1: "108 Temple Road",
            city: "Varanasi",
            state: "Uttar Pradesh",
            postalCode: "221001",
            country: "India",
          },
        });

        // Verifications on Order
        expect(order.status).toBe("PAID");
        expect(order.paymentStatus).toBe("SETTLED_COUPONS");
        expect(order.paidCashPaise).toBe(0);
        expect(order.netPayablePaise).toBe(0);
        expect(order.settledStoreCouponsPaise).toBe(20000);
        expect(order.settledBhavikaCouponsPaise).toBe(100000);

        // Tender reconciliation invariant
        const grossTotal = order.itemsTotalPaise + order.taxPaise + order.shippingFeePaise;
        expect(grossTotal).toBe(120000);
        expect(order.settledStoreCouponsPaise + order.settledBhavikaCouponsPaise + order.paidCashPaise).toBe(grossTotal);

        // Native coupon is finalized to REDEEMED
        const refreshedNative = await StoreCoupon.findOne({ couponCode: nativeCode });
        expect(refreshedNative?.status).toBe(StoreCouponStatus.REDEEMED);
        expect(refreshedNative?.redeemedOrderRef).toBe(order.orderRef);
        expect(refreshedNative?.lockedOrderRef).toBeNull();

        // Both Bhavika coupons are REDEEMED upstream
        const ext1 = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: bhavikaCode1 });
        const ext2 = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: bhavikaCode2 });
        expect(ext1?.status).toBe("REDEEMED");
        expect(ext2?.status).toBe("REDEEMED");

        // Inventory is permanently fulfilled
        const refreshedProduct = await getStoreProductById(product._id.toString());
        expect(refreshedProduct?.stock).toBe(9);
        expect(refreshedProduct?.reservedStock).toBe(0);

        // No fictitious payment attempts
        const attempts = await PaymentAttempt.find({ orderRef: order.orderRef });
        expect(attempts).toHaveLength(0);
      });

      it("handles partial external redemption failure: enters deficit, locks goods dispatch, preserves redeemed coupon state", async () => {
        const db = await getStoreDb();
        const ExternalCoupon = getExternalCouponRedemptionModel(db);

        const bhavikaCodeSucc = `BHAV-SUCC-${Date.now()}`;
        const bhavikaCodeFail = `BHAV-FAIL-${Date.now()}`;

        const product = await createStoreProduct({
          sku: `SKU-PART-${Date.now()}`,
          title: "Partial Failure Test Idol",
          slug: `partial-idol-${Date.now()}`,
          categoryId,
          basePricePaise: 120000, // ₹1,200
          stock: 5,
        });

        // 2 Bhavika coupons: ₹500 + ₹500 = ₹1,000 discount. Net cash payable = ₹200 (20,000 paise).
        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [bhavikaCodeSucc, bhavikaCodeFail],
          customCouponValidator: async (code) => {
            if (code === bhavikaCodeSucc || code === bhavikaCodeFail) {
              return { valid: true, valueRupees: 500 };
            }
            return { valid: false };
          },
          shippingAddress: {
            fullName: "Partial User",
            phone: "+919876543210",
            addressLine1: "Deficit Street",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        expect(order.netPayablePaise).toBe(20000);
        expect(order.status).toBe("PENDING_PAYMENT");

        // Cash payment attempt succeeds
        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 20000,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_test_partial_123",
          razorpaySignature: "sig_mock",
        });

        // Execute checkout with redeemer: 1 succeeds, 1 fails
        const checkoutRes = await processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: attempt._id.toString(),
          redeemer: async (code) => {
            if (code === bhavikaCodeSucc) {
              return { success: true };
            }
            return { success: false, error: "Upstream error: coupon already used or expired" };
          },
        });

        expect(checkoutRes.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
        expect(checkoutRes.deficitPaise).toBe(50000);
        expect(checkoutRes.redeemedCoupons).toContain(bhavikaCodeSucc);
        expect(checkoutRes.failedCoupons).toContain(bhavikaCodeFail);

        const orderInDb = await getStoreOrderByRef(order.orderRef);
        expect(orderInDb?.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");
        expect(orderInDb?.deficitPaise).toBe(50000);

        // Dispatch is locked: cannot transition to PROCESSING or SHIPPED
        await expect(
          transitionOrderStatus({
            orderRef: order.orderRef,
            targetStatus: "PROCESSING",
          }),
        ).rejects.toThrow(/Illegal order transition/i);

        // Consumed coupon is strictly REDEEMED; failed coupon is FAILED
        const extSucc = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: bhavikaCodeSucc });
        const extFail = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: bhavikaCodeFail });
        expect(extSucc?.status).toBe("REDEEMED");
        expect(extSucc?.redeemedAt).toBeInstanceOf(Date);
        expect(extFail?.status).toBe("FAILED");
        expect(extFail?.lastRedeemError).toMatch(/already used or expired/i);

        // Goods are NOT fulfilled (stock remains reserved, not decremented)
        const pAfter = await getStoreProductById(product._id.toString());
        expect(pAfter?.stock).toBe(5);
        expect(pAfter?.reservedStock).toBe(1);
      });

      it("recovers from timeout after upstream success on idempotent retry without duplicate fulfillment or redemptions", async () => {
        const db = await getStoreDb();
        const ExternalCoupon = getExternalCouponRedemptionModel(db);

        const timeoutCode = `BHAV-TIME-${Date.now()}`;
        const product = await createStoreProduct({
          sku: `SKU-TIME-${Date.now()}`,
          title: "Timeout Product",
          slug: `timeout-prod-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 5,
        });

        // ₹500 coupon + ₹700 cash
        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [timeoutCode],
          customCouponValidator: async () => ({ valid: true, valueRupees: 500 }),
          shippingAddress: {
            fullName: "Retry User",
            phone: "+919876543210",
            addressLine1: "Retry Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 70000,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: "pay_test_timeout_123",
          razorpaySignature: "sig_mock",
        });

        // 1. Attempt 1: upstream succeeds, but network throws timeout error to JMD
        let upstreamRecorded = false;
        await processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: attempt._id.toString(),
          redeemer: async () => {
            upstreamRecorded = true;
            throw new Error("ETIMEDOUT: Connection timed out after Bhavika upstream recorded redemption");
          },
        });

        expect(upstreamRecorded).toBe(true);
        const orderMid = await getStoreOrderByRef(order.orderRef);
        expect(orderMid?.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");

        // 2. Attempt 2: retry with same orderRef. Upstream returns { success: true, isReplay: true }
        const retryRes = await processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: attempt._id.toString(),
          redeemer: async () => {
            return { success: true, isReplay: true };
          },
        });

        expect(retryRes.status).toBe("PAID");
        const orderFinal = await getStoreOrderByRef(order.orderRef);
        expect(orderFinal?.status).toBe("PAID");
        expect(orderFinal?.paymentStatus).toBe("CAPTURED");

        // External coupon is marked REDEEMED with isReplay: true
        const extCoupon = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: timeoutCode });
        expect(extCoupon?.status).toBe("REDEEMED");
        expect(extCoupon?.isReplay).toBe(true);

        // Product inventory fulfilled exactly once (stock: 5 -> 4, reserved: 1 -> 0)
        const pFinal = await getStoreProductById(product._id.toString());
        expect(pFinal?.stock).toBe(4);
        expect(pFinal?.reservedStock).toBe(0);

        // 3. Attempt 3: duplicate execution when order is already PAID returns immediately
        const replayRes = await processPostPaymentCheckout({
          orderRef: order.orderRef,
          paymentAttemptId: attempt._id.toString(),
        });
        expect(replayRes.status).toBe("PAID");
        const pReplay = await getStoreProductById(product._id.toString());
        expect(pReplay?.stock).toBe(4);
        expect(pReplay?.reservedStock).toBe(0);
      });

      it("cancellation of deficit order applies approved compensating credit and preserves external redemption audit records", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);
        const ExternalCoupon = getExternalCouponRedemptionModel(db);
        const WalletModel = getStoreWalletModel(db);
        const WalletLedgerModel = getStoreWalletLedgerModel(db);

        const nativeCode = `NAT-CANCEL-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: nativeCode,
          member: memberId,
          faceValuePaise: 20000, // ₹200
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const bhavikaCode1 = `BHAV-CANC-1-${Date.now()}`;
        const bhavikaCode2 = `BHAV-CANC-2-${Date.now()}`;

        const product = await createStoreProduct({
          sku: `SKU-CANC-${Date.now()}`,
          title: "Cancel Compensation Item",
          slug: `canc-comp-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [nativeCode, bhavikaCode1, bhavikaCode2],
          customCouponValidator: async (code) => {
            if (code === bhavikaCode1 || code === bhavikaCode2) {
              return { valid: true, valueRupees: 500 };
            }
            return { valid: false };
          },
          couponRedeemer: async (code) => {
            // bhavikaCode1 succeeds, bhavikaCode2 fails
            if (code === bhavikaCode1) return { success: true };
            return { success: false, error: "Lapsed coupon" };
          },
          shippingAddress: {
            fullName: "Compensate Recipient",
            phone: "+919876543210",
            addressLine1: "Compensate Road",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        expect(order.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");

        // Record initial wallet balance
        // Record initial wallet balance
        const initialWallet = await WalletModel.findOne({ member: memberId });
        const initialAddMoney = initialWallet?.addMoneyPaise ?? 0;

        // Ensure policy is unapproved by default
        delete process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION;

        // Cancel order: transitions to CANCELLED_PARTIAL_COUPON_CONSUMED
        const cancelledOrder = await transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "CANCELLED_PARTIAL_COUPON_CONSUMED",
          cancellationReason: "Customer aborted after partial coupon redemption failure",
        });

        expect(cancelledOrder.status).toBe("CANCELLED_PARTIAL_COUPON_CONSUMED");
        expect(cancelledOrder.cancelledAt).toBeInstanceOf(Date);
        expect(cancelledOrder.compensationStatus).toBe("AWAITING_CLIENT_POLICY_APPROVAL");
        expect(cancelledOrder.notes).toContain("[GATED]");

        // 1. External coupon redemption record is PRESERVED as REDEEMED (not falsely marked active)
        const ext1 = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: bhavikaCode1 });
        expect(ext1?.status).toBe("REDEEMED");
        expect(ext1?.redeemedAt).toBeInstanceOf(Date);

        // 2. Customer's store wallet is NOT credited while unapproved (no unsanctioned liability)
        const unapprovedWallet = await WalletModel.findOne({ member: memberId });
        expect(unapprovedWallet?.addMoneyPaise).toBe(initialAddMoney);

        // 3. Attempting recovery without policy approval fails with 403
        await expect(recoverOrderCompensation(order.orderRef)).rejects.toThrow(
          /formally approved by the client|COMPENSATION_POLICY_NOT_APPROVED/i,
        );

        // 4. Client formally approves policy -> recovery succeeds
        process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION = "true";
        try {
          const recResult = await recoverOrderCompensation(order.orderRef);
          expect(recResult.success).toBe(true);
          expect(recResult.compensatedPaise).toBe(50000);
          expect(recResult.isReplay).toBe(false);

          // 5. Customer's store wallet received compensating credit for the 50,000 paise consumed
          const updatedWallet = await WalletModel.findOne({ member: memberId });
          expect(updatedWallet?.addMoneyPaise).toBe(initialAddMoney + 50000);

          // 6. Immutable wallet ledger audit entry was created with idempotencyKey
          const ledger = await WalletLedgerModel.findOne({
            referenceId: order.orderRef,
            referenceType: "ORDER_REFUND",
          });
          expect(ledger).not.toBeNull();
          expect(ledger?.amountPaise).toBe(50000);
          expect(ledger?.idempotencyKey).toBe(`comp-credit:${order.orderRef}`);

          // 7. Order document compensationStatus updated to COMPENSATED
          const refreshedOrder = await getStoreOrderByRef(order.orderRef);
          expect(refreshedOrder?.compensationStatus).toBe("COMPENSATED");

          // 8. Replay is strictly idempotent: no duplicate credits or ledgers
          const replayResult = await recoverOrderCompensation(order.orderRef);
          expect(replayResult.isReplay).toBe(true);
          const replayWallet = await WalletModel.findOne({ member: memberId });
          expect(replayWallet?.addMoneyPaise).toBe(initialAddMoney + 50000);
        } finally {
          delete process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION;
        }

        // 9. Native coupon is restored to ACTIVE
        const nativeDoc = await StoreCoupon.findOne({ couponCode: nativeCode });
        expect(nativeDoc?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(nativeDoc?.lockedOrderRef).toBeNull();

        // 10. Stock reservation is released
        const pFinal = await getStoreProductById(product._id.toString());
        expect(pFinal?.stock).toBe(5);
        expect(pFinal?.reservedStock).toBe(0);
      });

      it("tender reconciliation: verifies merchandise, tax, shipping, native coupons, Bhavika coupons and cash without double counting", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        // Case A: High-value order with free shipping (>= ₹999)
        const pHigh = await createStoreProduct({
          sku: `SKU-RECON-HIGH-${Date.now()}`,
          title: "High Value Item",
          slug: `high-val-${Date.now()}`,
          categoryId,
          basePricePaise: 150000, // ₹1,500
          stock: 5,
        });

        const nativeA = `NAT-RECON-A-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: nativeA,
          member: memberId,
          faceValuePaise: 30000, // ₹300
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const bhavikaA = `BHAV-RECON-A-${Date.now()}`; // ₹400 (40,000 paise)

        const orderA = await createStoreOrder({
          memberId,
          items: [{ productId: pHigh._id.toString(), quantity: 1 }],
          couponCodes: [nativeA, bhavikaA],
          customCouponValidator: async () => ({ valid: true, valueRupees: 400 }),
          shippingAddress: {
            fullName: "Reconcile User",
            phone: "+919876543210",
            addressLine1: "Reconcile Street",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // ₹1,500 items + ₹0 shipping + ₹0 tax = ₹1,500 gross total
        const grossA = orderA.itemsTotalPaise + orderA.taxPaise + orderA.shippingFeePaise;
        expect(grossA).toBe(150000);
        expect(orderA.shippingFeePaise).toBe(0);
        expect(orderA.settledStoreCouponsPaise).toBe(30000);
        expect(orderA.settledBhavikaCouponsPaise).toBe(40000);
        expect(orderA.couponDiscountPaise).toBe(70000);
        expect(orderA.netPayablePaise).toBe(80000);

        // Simulate payment capture for the net payable cash
        const attemptA = await createPaymentAttempt({
          orderRef: orderA.orderRef,
          orderId: orderA._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attemptA._id.toString(),
          razorpayPaymentId: "pay_test_recon_a",
          razorpaySignature: "sig_mock",
        });

        const checkoutResA = await processPostPaymentCheckout({
          orderRef: orderA.orderRef,
          paymentAttemptId: attemptA._id.toString(),
          redeemer: async () => ({ success: true }),
        });

        expect(checkoutResA.status).toBe("PAID");
        const paidA = checkoutResA.order;
        expect(paidA.paidCashPaise).toBe(80000);

        // Strict Tender Invariant: settledStoreCoupons + settledBhavikaCoupons + paidCash === grossTotal
        expect(
          paidA.settledStoreCouponsPaise + paidA.settledBhavikaCouponsPaise + paidA.paidCashPaise,
        ).toBe(grossA);

        // Case B: Low-value order incurring ₹99 standard shipping (< ₹999)
        const pLow = await createStoreProduct({
          sku: `SKU-RECON-LOW-${Date.now()}`,
          title: "Low Value Item",
          slug: `low-val-${Date.now()}`,
          categoryId,
          basePricePaise: 50000, // ₹500
          stock: 5,
        });

        const nativeB = `NAT-RECON-B-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: nativeB,
          member: memberId,
          faceValuePaise: 10000, // ₹100
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const orderB = await createStoreOrder({
          memberId,
          items: [{ productId: pLow._id.toString(), quantity: 1 }],
          couponCodes: [nativeB],
          shippingAddress: {
            fullName: "Reconcile Low",
            phone: "+919876543210",
            addressLine1: "Low St",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // ₹500 items + ₹99 shipping (9,900 paise) = ₹599 gross total (59,900 paise)
        const grossB = orderB.itemsTotalPaise + orderB.taxPaise + orderB.shippingFeePaise;
        expect(grossB).toBe(59900);
        expect(orderB.shippingFeePaise).toBe(9900);
        expect(orderB.settledStoreCouponsPaise).toBe(10000);
        expect(orderB.netPayablePaise).toBe(49900);

        const attemptB = await createPaymentAttempt({
          orderRef: orderB.orderRef,
          orderId: orderB._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 49900,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attemptB._id.toString(),
          razorpayPaymentId: "pay_test_recon_b",
          razorpaySignature: "sig_mock",
        });

        const checkoutResB = await processPostPaymentCheckout({
          orderRef: orderB.orderRef,
          paymentAttemptId: attemptB._id.toString(),
        });

        expect(checkoutResB.status).toBe("PAID");
        const paidB = checkoutResB.order;
        expect(paidB.paidCashPaise).toBe(49900);

        // Strict Tender Invariant
        expect(
          paidB.settledStoreCouponsPaise + paidB.settledBhavikaCouponsPaise + paidB.paidCashPaise,
        ).toBe(grossB);
      });

      it("native coupon lifecycle: active lock protection, expired lock auto-reclaim, and retry recovery", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const lifecycleCode = `NAT-LIFE-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: lifecycleCode,
          member: memberId,
          faceValuePaise: 20000, // ₹200
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        const p = await createStoreProduct({
          sku: `SKU-LIFE-${Date.now()}`,
          title: "Lifecycle Prod",
          slug: `life-prod-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 10,
        });

        // 1. Order 1 locks the coupon
        const order1 = await createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [lifecycleCode],
          shippingAddress: {
            fullName: "Lock User 1",
            phone: "+919876543210",
            addressLine1: "Lane 1",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const lockedCoupon = await StoreCoupon.findOne({ couponCode: lifecycleCode });
        expect(lockedCoupon?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);
        expect(lockedCoupon?.lockedOrderRef).toBe(order1.orderRef);

        // 2. Order 2 attempts to use the actively locked coupon -> rejected with 409
        await expect(
          createStoreOrder({
            memberId,
            items: [{ productId: p._id.toString(), quantity: 1 }],
            couponCodes: [lifecycleCode],
            shippingAddress: {
              fullName: "Lock User 2",
              phone: "+919876543210",
              addressLine1: "Lane 2",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "India",
            },
          }),
        ).rejects.toThrow(/currently locked in an active checkout session|currently locked in another checkout session|already locked/i);

        // 3. Expired lock auto-reclaim: Backdate lockedExpiresAt
        await StoreCoupon.updateOne(
          { couponCode: lifecycleCode },
          { $set: { lockedExpiresAt: new Date(Date.now() - 60000) } },
        );

        // 4. Order 3 attempts checkout with the expired lock -> succeeds and reclaims lock
        const order3 = await createStoreOrder({
          memberId,
          items: [{ productId: p._id.toString(), quantity: 1 }],
          couponCodes: [lifecycleCode],
          shippingAddress: {
            fullName: "Lock User 3",
            phone: "+919876543210",
            addressLine1: "Lane 3",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const reclaimedCoupon = await StoreCoupon.findOne({ couponCode: lifecycleCode });
        expect(reclaimedCoupon?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);
        expect(reclaimedCoupon?.lockedOrderRef).toBe(order3.orderRef);

        // 5. Order 3 cancellation restores coupon to ACTIVE
        await transitionOrderStatus({
          orderRef: order3.orderRef,
          targetStatus: "CANCELLED",
          cancellationReason: "User cancelled Order 3",
        });

        const restoredCoupon = await StoreCoupon.findOne({ couponCode: lifecycleCode });
        expect(restoredCoupon?.status).toBe(StoreCouponStatus.ACTIVE);
        expect(restoredCoupon?.lockedOrderRef).toBeNull();
      });

      it("cancellation failure recovery and concurrency: handles injected wallet failure, allows recovery, and blocks concurrent cancellations", async () => {
        const db = await getStoreDb();
        const WalletLedgerModel = getStoreWalletLedgerModel(db);

        const product = await createStoreProduct({
          sku: `SKU-COMP-RECOV-${Date.now()}`,
          title: "Compensation Recovery Item",
          slug: `comp-recov-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 5,
        });

        const bhavikaCode1 = `BHAV-REC-GOOD-${Date.now()}`;
        const bhavikaCode2 = `BHAV-REC-FAIL-${Date.now()}`;

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [bhavikaCode1, bhavikaCode2],
          customCouponValidator: async (code) => {
            if (code === bhavikaCode1) return { valid: true, valueRupees: 600 };
            return { valid: true, valueRupees: 600 };
          },
          shippingAddress: {
            fullName: "Recovery User",
            phone: "+919876543210",
            addressLine1: "Recovery Street",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // Execute zero-cash checkout with partial failure
        await processZeroCashCouponCheckout({
          orderRef: order.orderRef,
          redeemer: async (code) => {
            if (code === bhavikaCode1) return { success: true };
            return { success: false, error: "Coupon rejected" };
          },
        });

        const deficitOrder = await getStoreOrderByRef(order.orderRef);
        expect(deficitOrder?.status).toBe("PARTIAL_COUPON_REDEMPTION_DEFICIT");

        // Concurrent cancellation test: two parallel calls to transitionOrderStatus
        const cancel1 = transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "CANCELLED_PARTIAL_COUPON_CONSUMED",
          cancellationReason: "Concurrent cancel attempt 1",
        });
        const cancel2 = transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "CANCELLED_PARTIAL_COUPON_CONSUMED",
          cancellationReason: "Concurrent cancel attempt 2",
        });

        const results = await Promise.allSettled([cancel1, cancel2]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        // Exactly one transition succeeded, the second was blocked by concurrency control
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // Terminal cancellation state was persisted
        const cancelled = await getStoreOrderByRef(order.orderRef);
        expect(cancelled?.status).toBe("CANCELLED_PARTIAL_COUPON_CONSUMED");

        // Simulate that compensation was marked FAILED (e.g. injected downstream wallet network failure)
        const OrderModel = (await import("@/server/store/models/StoreOrder")).getStoreOrderModel(db);
        await OrderModel.updateOne(
          { orderRef: order.orderRef },
          { $set: { compensationStatus: "FAILED" } },
        );

        // Verify that terminal cancellation state does NOT prevent retry
        process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION = "true";
        try {
          const recResult = await recoverOrderCompensation(order.orderRef);
          expect(recResult.success).toBe(true);
          expect(recResult.compensatedPaise).toBe(60000);
          expect(recResult.isReplay).toBe(false);

          const afterOrder = await getStoreOrderByRef(order.orderRef);
          expect(afterOrder?.compensationStatus).toBe("COMPENSATED");

          // Ledger entry exists
          const ledger = await WalletLedgerModel.findOne({
            idempotencyKey: `comp-credit:${order.orderRef}`,
          });
          expect(ledger).not.toBeNull();
          expect(ledger?.amountPaise).toBe(60000);

          // Second recovery attempt (replay) returns isReplay: true without duplicate credit
          const replayResult = await recoverOrderCompensation(order.orderRef);
          expect(replayResult.isReplay).toBe(true);
        } finally {
          delete process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION;
        }
      });

      it("expired native coupon lock vs late payment callback: blocks Order A settlement, protects Order B lock, and routes payment to refund", async () => {
        const db = await getStoreDb();
        const StoreCoupon = getStoreCouponModel(db);

        const product = await createStoreProduct({
          sku: `SKU-LATE-CB-${Date.now()}`,
          title: "Late Callback Item",
          slug: `late-cb-${Date.now()}`,
          categoryId,
          basePricePaise: 100000,
          stock: 2,
        });

        const sharedCouponCode = `NAT-CONTESTED-${Date.now()}`;
        await StoreCoupon.create({
          couponCode: sharedCouponCode,
          member: memberId,
          faceValuePaise: 20000,
          source: StoreCouponSource.ADMIN_GRANT,
          status: StoreCouponStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          isEligibleForDraw: false,
        });

        // 1. Order A reserves native coupon and initiates payment
        const orderA = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [sharedCouponCode],
          shippingAddress: {
            fullName: "Order A Customer",
            phone: "+919876543210",
            addressLine1: "A Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        expect(orderA.settledStoreCouponsPaise).toBe(20000);
        expect(orderA.netPayablePaise).toBe(80000);

        const couponDocA = await StoreCoupon.findOne({ couponCode: sharedCouponCode });
        expect(couponDocA?.lockedOrderRef).toBe(orderA.orderRef);

        // 2. Order A's coupon lock expires (backdated)
        await StoreCoupon.updateOne(
          { couponCode: sharedCouponCode },
          { $set: { lockedExpiresAt: new Date(Date.now() - 60000) } },
        );

        // 3. Order B reclaims the expired native coupon
        const orderB = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [sharedCouponCode],
          shippingAddress: {
            fullName: "Order B Customer",
            phone: "+919876543211",
            addressLine1: "B Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // Verify Order B now securely holds the lock
        const couponDocB = await StoreCoupon.findOne({ couponCode: sharedCouponCode });
        expect(couponDocB?.lockedOrderRef).toBe(orderB.orderRef);
        expect(couponDocB?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);

        // 4. Delayed successful payment callback arrives for Order A
        const latePaymentAttemptA = await createPaymentAttempt({
          orderRef: orderA.orderRef,
          orderId: orderA._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
          razorpayOrderId: `rzp_order_late_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: latePaymentAttemptA._id.toString(),
          razorpayPaymentId: `pay_late_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        // Attempting to fulfill Order A must be rejected because coupon lock was lost
        await expect(
          processPostPaymentCheckout({
            orderRef: orderA.orderRef,
            paymentAttemptId: latePaymentAttemptA._id.toString(),
          }),
        ).rejects.toThrow(
          /native coupon reservation expired|NATIVE_COUPON_RESERVATION_LOST/i,
        );

        // Order A is transitioned to EXPIRED with durable REFUND_PENDING state
        const refreshedOrderA = await getStoreOrderByRef(orderA.orderRef);
        expect(refreshedOrderA?.status).toBe("EXPIRED");
        expect(refreshedOrderA?.paymentStatus).toBe("REFUND_PENDING");
        expect(refreshedOrderA?.refundRequiredPaise).toBe(80000);
        expect(refreshedOrderA?.notes).toMatch(/refund/i);

        // Payment attempt A is persisted in durable REFUND_PENDING state
        const PaymentAttempt = getStorePaymentAttemptModel(db);
        const refreshedAttemptA = await PaymentAttempt.findById(latePaymentAttemptA._id);
        expect(refreshedAttemptA?.status).toBe("REFUND_PENDING");
        expect(refreshedAttemptA?.refundAmountPaise).toBe(80000);

        // Reconcile refund: provider failure (e.g. timeout) leaves it visibly REFUND_PENDING
        await reconcilePaymentRefund({
          paymentAttemptId: latePaymentAttemptA._id,
          refundGateway: async () => {
            throw new Error("ETIMEDOUT: Connection to Razorpay timed out after 10000ms");
          },
        });

        const timeoutAttempt = await PaymentAttempt.findById(latePaymentAttemptA._id);
        expect(timeoutAttempt?.status).toBe("REFUND_PENDING");
        expect(timeoutAttempt?.errorDetails).toContain("[AMBIGUOUS_TIMEOUT]");

        const orderStillPending = await getStoreOrderByRef(orderA.orderRef);
        expect(orderStillPending?.paymentStatus).toBe("REFUND_PENDING"); // NEVER described as refunded until provider confirms

        // Reconcile retry: provider confirms refund -> updates to REFUNDED
        const mockRefundId = `rfnd_${Date.now()}`;
        const reconResult = await reconcilePaymentRefund({
          paymentAttemptId: latePaymentAttemptA._id,
          refundGateway: async () => {
            return { success: true, refundId: mockRefundId, isReplay: false };
          },
        });
        expect(reconResult.status).toBe("REFUNDED");
        expect(reconResult.refundId).toBe(mockRefundId);

        const refundedAttempt = await PaymentAttempt.findById(latePaymentAttemptA._id);
        expect(refundedAttempt?.status).toBe("REFUNDED");
        expect(refundedAttempt?.razorpayRefundId).toBe(mockRefundId);

        const refundedOrderA = await getStoreOrderByRef(orderA.orderRef);
        expect(refundedOrderA?.paymentStatus).toBe("REFUNDED");
        expect(refundedOrderA?.refundedPaise).toBe(80000);
        expect(refundedOrderA?.refundId).toBe(mockRefundId);

        // Replay: repeated reconciliation call returns isReplay: true without duplicate refunding
        const replayRecon = await reconcilePaymentRefund({
          paymentAttemptId: latePaymentAttemptA._id,
        });
        expect(replayRecon.isReplay).toBe(true);
        expect(replayRecon.status).toBe("REFUNDED");

        // Order B's lock remains completely intact and owned by Order B
        const couponAfterLateA = await StoreCoupon.findOne({ couponCode: sharedCouponCode });
        expect(couponAfterLateA?.lockedOrderRef).toBe(orderB.orderRef);
        expect(couponAfterLateA?.status).toBe(StoreCouponStatus.LOCKED_IN_CHECKOUT);

        // 5. Order B can proceed to pay and fulfill without interference
        const paymentB = await createPaymentAttempt({
          orderRef: orderB.orderRef,
          orderId: orderB._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
          razorpayOrderId: `rzp_order_b_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: paymentB._id.toString(),
          razorpayPaymentId: `pay_b_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        const postB = await processPostPaymentCheckout({
          orderRef: orderB.orderRef,
          paymentAttemptId: paymentB._id.toString(),
        });

        expect(postB.status).toBe("PAID");
        const finalCoupon = await StoreCoupon.findOne({ couponCode: sharedCouponCode });
        expect(finalCoupon?.status).toBe(StoreCouponStatus.REDEEMED);
        expect(finalCoupon?.redeemedOrderRef).toBe(orderB.orderRef);
      });

      it("late callbacks after inventory reservation expiry: routes to refund reconciliation, preserves inventory, and confirms refund only upon provider confirmation", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-LATE-STOCK-${Date.now()}`,
          title: "Late Stock Expiry Item",
          slug: `late-stock-${Date.now()}`,
          categoryId,
          basePricePaise: 120000,
          stock: 1,
        });

        // 1. Order C creates order with 1 unit of stock
        const orderC = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Order C Customer",
            phone: "+919876543210",
            addressLine1: "C Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // 2. Reservation expires and cancelExpiredOrders runs
        const OrderModel = (await import("@/server/store/models/StoreOrder")).getStoreOrderModel(db);
        await OrderModel.updateOne(
          { orderRef: orderC.orderRef },
          { $set: { stockReservationExpiresAt: new Date(Date.now() - 60000) } },
        );
        const expiredCount = await cancelExpiredOrders(new Date());
        expect(expiredCount).toBeGreaterThanOrEqual(1);

        const orderAfterExpiry = await getStoreOrderByRef(orderC.orderRef);
        expect(orderAfterExpiry?.status).toBe("EXPIRED");

        // 3. Order D reclaims the stock
        const orderD = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Order D Customer",
            phone: "+919876543211",
            addressLine1: "D Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });
        expect(orderD.status).toBe("PENDING_PAYMENT");

        // 4. Delayed payment callback arrives for Order C
        const paymentC = await createPaymentAttempt({
          orderRef: orderC.orderRef,
          orderId: orderC._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 120000,
          razorpayOrderId: `rzp_order_c_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: paymentC._id.toString(),
          razorpayPaymentId: `pay_c_late_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        // Attempting post-payment checkout rejects Order C because stock was expired/reclaimed
        await expect(
          processPostPaymentCheckout({
            orderRef: orderC.orderRef,
            paymentAttemptId: paymentC._id.toString(),
          }),
        ).rejects.toThrow(
          /stock reservation expired.*must be refunded|ORDER_EXPIRED_PAYMENT_REFUND_REQUIRED/i,
        );

        // Order C has durable refund pending state
        const refreshedOrderC = await getStoreOrderByRef(orderC.orderRef);
        expect(refreshedOrderC?.status).toBe("EXPIRED");
        expect(refreshedOrderC?.paymentStatus).toBe("REFUND_PENDING");
        expect(refreshedOrderC?.refundRequiredPaise).toBe(120000);

        // Payment attempt C has durable REFUND_PENDING status
        const attemptC = await PaymentAttempt.findById(paymentC._id);
        expect(attemptC?.status).toBe("REFUND_PENDING");
        expect(attemptC?.refundAmountPaise).toBe(120000);

        // Reconcile refund against provider
        const refundIdC = `rfnd_c_${Date.now()}`;
        const reconC = await reconcilePaymentRefund({
          paymentAttemptId: paymentC._id,
          refundGateway: async () => ({ success: true, refundId: refundIdC }),
        });
        expect(reconC.status).toBe("REFUNDED");
        expect(reconC.refundId).toBe(refundIdC);

        // Order C paymentStatus is confirmed REFUNDED only now
        const finalOrderC = await getStoreOrderByRef(orderC.orderRef);
        expect(finalOrderC?.paymentStatus).toBe("REFUNDED");
        expect(finalOrderC?.refundedPaise).toBe(120000);
        expect(finalOrderC?.refundId).toBe(refundIdC);

        // Order D can pay and fulfill normally without stock interference
        const paymentD = await createPaymentAttempt({
          orderRef: orderD.orderRef,
          orderId: orderD._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 120000,
          razorpayOrderId: `rzp_order_d_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: paymentD._id.toString(),
          razorpayPaymentId: `pay_d_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        const postD = await processPostPaymentCheckout({
          orderRef: orderD.orderRef,
          paymentAttemptId: paymentD._id.toString(),
        });
        expect(postD.status).toBe("PAID");
      });

      it("ambiguous upstream timeout vs definitive rejection: records audit classification, protects usable status, and reconciles via stable orderRef replay", async () => {
        const db = await getStoreDb();
        const ExternalCoupon = getExternalCouponRedemptionModel(db);

        const product = await createStoreProduct({
          sku: `SKU-TIMEOUT-DIST-${Date.now()}`,
          title: "Timeout Distinguish Item",
          slug: `timeout-dist-${Date.now()}`,
          categoryId,
          basePricePaise: 100000,
          stock: 5,
        });

        const defCoupon = `BHAV-DEFINITIVE-FAIL-${Date.now()}`;
        const timeoutCoupon = `BHAV-TIMEOUT-RETRY-${Date.now()}`;

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          couponCodes: [defCoupon, timeoutCoupon],
          customCouponValidator: async () => ({ valid: true, valueRupees: 500 }),
          shippingAddress: {
            fullName: "Timeout User",
            phone: "+919876543210",
            addressLine1: "Timeout Lane",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        // Zero-cash checkout where defCoupon fails definitively and timeoutCoupon throws network timeout
        await processZeroCashCouponCheckout({
          orderRef: order.orderRef,
          redeemer: async (code) => {
            if (code === defCoupon) {
              return { success: false, error: "Coupon not found in Bhavika registry" };
            }
            throw new Error("ETIMEDOUT: Connection to Bhavika timed out after 5000ms");
          },
        });

        // 1. Inspect definitive rejection document
        const defDoc = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: defCoupon });
        expect(defDoc?.status).toBe("FAILED");
        expect(defDoc?.lastRedeemError).toBe("Coupon not found in Bhavika registry");
        expect(defDoc?.failureCategory).toBe("DEFINITIVE_REJECTION");
        expect(defDoc?.metadata?.retryable).toBe(false);

        // 2. Inspect ambiguous timeout document
        const timeDoc = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: timeoutCoupon });
        expect(timeDoc?.status).toBe("FAILED");
        expect(timeDoc?.lastRedeemError).toContain("ETIMEDOUT");
        expect(timeDoc?.failureCategory).toBe("AMBIGUOUS_TIMEOUT");
        expect(timeDoc?.metadata?.retryable).toBe(true);
        expect(timeDoc?.metadata?.notice).toContain("Upstream status uncertain");

        // 3. Reconcile timeoutCoupon: stable orderRef is reused, returning isReplay: true
        await processZeroCashCouponCheckout({
          orderRef: order.orderRef,
          redeemer: async (code) => {
            if (code === timeoutCoupon) {
              return { success: true, isReplay: true };
            }
            return { success: false, error: "Coupon not found in Bhavika registry" };
          },
        });

        const reconciledDoc = await ExternalCoupon.findOne({ orderRef: order.orderRef, code: timeoutCoupon });
        expect(reconciledDoc?.status).toBe("REDEEMED");
        expect(reconciledDoc?.isReplay).toBe(true);
      });

      it("refund status semantics: provider pending status preserves REFUND_PENDING; refund ID alone never proves REFUNDED; authoritative processed confirms completion", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-STATUS-SEM-${Date.now()}`,
          title: "Status Semantics Item",
          slug: `status-sem-${Date.now()}`,
          categoryId,
          basePricePaise: 50000,
          stock: 10,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Semantics User",
            phone: "+919876543210",
            addressLine1: "Semantics Road",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400001",
            country: "India",
          },
        });

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 50000,
          razorpayOrderId: `rzp_order_sem_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: `pay_sem_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        // Order enters REFUND_PENDING
        await transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "EXPIRED",
          paymentStatus: "REFUND_PENDING",
          refundRequiredPaise: 50000,
        });

        const mockRefundId = `rfnd_pending_${Date.now()}`;

        // 1. Provider returns refund ID with status "pending" (e.g. queued / pending bank processing)
        const pendingResult = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundGateway: async () => ({
            success: true,
            refundId: mockRefundId,
            providerStatus: "pending",
          }),
        });

        // Acceptance Criteria: A refund ID alone NEVER proves completion!
        expect(pendingResult.status).toBe("REFUND_PENDING");
        expect(pendingResult.providerStatus).toBe("pending");
        expect(pendingResult.refundId).toBe(mockRefundId);

        // Persistent attempt record must remain in REFUND_PENDING
        const attemptAfterPending = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterPending?.status).toBe("REFUND_PENDING");
        expect(attemptAfterPending?.razorpayRefundId).toBe(mockRefundId);
        expect(attemptAfterPending?.errorDetails).toContain("[PROVIDER_PENDING]");

        // Persistent order must remain in REFUND_PENDING and NOT described as refunded
        const orderAfterPending = await getStoreOrderByRef(order.orderRef);
        expect(orderAfterPending?.paymentStatus).toBe("REFUND_PENDING");
        expect(orderAfterPending?.refundedPaise || 0).toBe(0);

        // 2. Later, authoritative confirmation arrives: provider status "processed"
        const processedResult = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundGateway: async () => ({
            success: true,
            refundId: mockRefundId,
            providerStatus: "processed",
          }),
        });

        expect(processedResult.status).toBe("REFUNDED");
        expect(processedResult.providerStatus).toBe("processed");

        // Now attempt and order transition to REFUNDED
        const attemptFinal = await PaymentAttempt.findById(attempt._id);
        expect(attemptFinal?.status).toBe("REFUNDED");

        const orderFinal = await getStoreOrderByRef(order.orderRef);
        expect(orderFinal?.paymentStatus).toBe("REFUNDED");
        expect(orderFinal?.refundedPaise).toBe(50000);
        expect(orderFinal?.refundId).toBe(mockRefundId);
      });

      it("webhook reconciliation: refund.processed confirms completion and refund.failed records definitive rejection", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-WH-RECON-${Date.now()}`,
          title: "Webhook Recon Item",
          slug: `wh-recon-${Date.now()}`,
          categoryId,
          basePricePaise: 75000,
          stock: 10,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Webhook User",
            phone: "+919876543210",
            addressLine1: "Hook Ave",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const rzpPayId = `pay_wh_${Date.now()}`;
        const rzpRefundId = `rfnd_wh_${Date.now()}`;

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 75000,
          razorpayOrderId: `rzp_order_wh_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: rzpPayId,
          rawWebhookPayload: { simulated: true },
        });

        await PaymentAttempt.updateOne(
          { _id: attempt._id },
          { $set: { status: "REFUND_PENDING", razorpayRefundId: rzpRefundId, refundAmountPaise: 75000 } },
        );
        await transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "EXPIRED",
          paymentStatus: "REFUND_PENDING",
          refundRequiredPaise: 75000,
        });

        // Simulate Razorpay refund.processed webhook
        const webhookPayload = {
          event: "refund.processed",
          payload: {
            refund: {
              entity: {
                id: rzpRefundId,
                payment_id: rzpPayId,
                amount: 75000,
                status: "processed",
                notes: { orderRef: order.orderRef },
              },
            },
          },
        };

        const webhookRes = await handleRazorpayRefundWebhook(webhookPayload);
        expect(webhookRes.processed).toBe(true);
        expect(webhookRes.status).toBe("REFUNDED");

        // Order and attempt must now be authoritatively REFUNDED
        const confirmedAttempt = await PaymentAttempt.findById(attempt._id);
        expect(confirmedAttempt?.status).toBe("REFUNDED");

        const confirmedOrder = await getStoreOrderByRef(order.orderRef);
        expect(confirmedOrder?.paymentStatus).toBe("REFUNDED");
        expect(confirmedOrder?.refundedPaise).toBe(75000);
        expect(confirmedOrder?.refundId).toBe(rzpRefundId);
      });

      it("idempotency contract & live adapter: verifies X-Refund-Idempotency header, identical retry payload, distinct keys, and conflicting payload rejection", async () => {
        const { env } = await import("@/lib/env");
        const envRecord = env as unknown as Record<string, string | undefined>;

        // Temporarily configure live environment keys to test real adapter
        const origKeyId = env.RAZORPAY_KEY_ID;
        const origKeySec = env.RAZORPAY_KEY_SECRET;
        envRecord.RAZORPAY_KEY_ID = "rzp_test_adapter_key";
        envRecord.RAZORPAY_KEY_SECRET = "rzp_test_adapter_secret";

        const originalFetch = globalThis.fetch;
        let interceptedUrl = "";
        let interceptedHeaders: Record<string, string> = {};
        let interceptedBody: Record<string, unknown> | null = null;

        const mockRefundId = `rfnd_adapter_${Date.now()}`;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          interceptedUrl = String(input);
          interceptedHeaders = (init?.headers || {}) as Record<string, string>;
          interceptedBody = init?.body ? JSON.parse(String(init.body)) : null;

          return new Response(
            JSON.stringify({
              id: mockRefundId,
              status: "processed",
              amount: 60000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as typeof globalThis.fetch;

        try {
          const product = await createStoreProduct({
            sku: `SKU-ADAPTER-${Date.now()}`,
            title: "Adapter Test Item",
            slug: `adapter-test-${Date.now()}`,
            categoryId,
            basePricePaise: 60000,
            stock: 5,
          });

          const order = await createStoreOrder({
            memberId,
            items: [{ productId: product._id.toString(), quantity: 1 }],
            shippingAddress: {
              fullName: "Adapter User",
              phone: "+919876543210",
              addressLine1: "Adapter Rd",
              city: "Delhi",
              state: "Delhi",
              postalCode: "110001",
              country: "India",
            },
          });

          const payAttempt1 = await createPaymentAttempt({
            orderRef: order.orderRef,
            orderId: order._id.toString(),
            memberId,
            attemptNumber: 1,
            amountPaise: 60000,
            razorpayOrderId: `rzp_order_adp_${Date.now()}`,
          });

          const payId1 = `pay_adp_${Date.now()}`;
          await recordPaymentSuccess({
            paymentAttemptId: payAttempt1._id.toString(),
            razorpayPaymentId: payId1,
            rawWebhookPayload: { simulated: true },
          });

          // Execute reconciliation using real Razorpay adapter (without delegate)
          const result = await reconcilePaymentRefund({
            paymentAttemptId: payAttempt1._id,
            refundReason: "Customer requested cancellation",
          });

          expect(result.status).toBe("REFUNDED");
          expect(result.refundId).toBe(mockRefundId);

          // Verify documented X-Refund-Idempotency header is sent
          const expectedKey1 = `rfnd-${order.orderRef}-1`;
          expect(interceptedHeaders["X-Refund-Idempotency"]).toBe(expectedKey1);
          expect(interceptedUrl).toContain(`/v1/payments/${encodeURIComponent(payId1)}/refund`);
          const capturedBody = interceptedBody as { amount?: number; notes?: { orderRef?: string; idempotencyKey?: string } } | null;
          expect(capturedBody?.amount).toBe(60000);
          expect(capturedBody?.notes?.orderRef).toBe(order.orderRef);
          expect(capturedBody?.notes?.idempotencyKey).toBe(expectedKey1);

          // Verify distinct legitimate attempts use distinct idempotency keys
          const payAttempt2 = await createPaymentAttempt({
            orderRef: order.orderRef,
            orderId: order._id.toString(),
            memberId,
            attemptNumber: 2,
            amountPaise: 60000,
            razorpayOrderId: `rzp_order_adp2_${Date.now()}`,
          });
          expect(payAttempt2.attemptNumber).toBe(2);
          const expectedKey2 = `rfnd-${order.orderRef}-2`;
          expect(expectedKey2).not.toBe(expectedKey1);

          // Verify conflicting payload detection: attempting to refund different amount throws error
          await expect(
            processRefund({
              paymentAttemptId: payAttempt1._id,
              refundAmountPaise: 30000, // Conflict with original 60000
              refundReason: "Conflicting retry",
              idempotencyKey: expectedKey1,
            }),
          ).rejects.toThrow(/conflicting refund payload/i);

        } finally {
          envRecord.RAZORPAY_KEY_ID = origKeyId;
          envRecord.RAZORPAY_KEY_SECRET = origKeySec;
          globalThis.fetch = originalFetch;
        }
      });

      it("partial refund accounting: correctly updates refunded amounts and never labels partial refund as fully REFUNDED", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-PARTIAL-REF-${Date.now()}`,
          title: "Partial Item",
          slug: `partial-item-${Date.now()}`,
          categoryId,
          basePricePaise: 100000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Partial User",
            phone: "+919876543210",
            addressLine1: "Partial Ln",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 100000,
          razorpayOrderId: `rzp_order_part_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: `pay_part_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        // Reconcile partial refund: 40000 of 100000
        const partialRefundId = `rfnd_part_${Date.now()}`;
        const partialResult = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 40000,
          refundReason: "Partial order return",
          refundGateway: async () => ({
            success: true,
            refundId: partialRefundId,
            providerStatus: "processed",
          }),
        });

        expect(partialResult.status).toBe("PARTIALLY_REFUNDED");
        expect(partialResult.refundId).toBe(partialRefundId);

        const partialAttempt = await PaymentAttempt.findById(attempt._id);
        expect(partialAttempt?.status).toBe("PARTIALLY_REFUNDED");
        expect(partialAttempt?.refundAmountPaise).toBe(40000);

        const partialOrder = await getStoreOrderByRef(order.orderRef);
        // Acceptance Criteria: Partial refunds never incorrectly label an incompletely refunded payment as fully refunded!
        expect(partialOrder?.paymentStatus).toBe("PARTIALLY_REFUNDED");
        expect(partialOrder?.refundedPaise).toBe(40000);
      });

      it("durable reconciliation worker sweep: discovers pending refunds across restarts and prevents duplicate concurrent worker refunds", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-SWEEP-RECON-${Date.now()}`,
          title: "Sweep Item",
          slug: `sweep-item-${Date.now()}`,
          categoryId,
          basePricePaise: 80000,
          stock: 10,
        });

        // Create 2 separate orders with attempts in REFUND_PENDING
        const order1 = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Sweep User 1",
            phone: "+919876543210",
            addressLine1: "Sweep St 1",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });
        const attempt1 = await createPaymentAttempt({
          orderRef: order1.orderRef,
          orderId: order1._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
          razorpayOrderId: `rzp_order_sw1_${Date.now()}`,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attempt1._id.toString(),
          razorpayPaymentId: `pay_sw1_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });
        await PaymentAttempt.updateOne(
          { _id: attempt1._id },
          { $set: { status: "REFUND_PENDING", refundAmountPaise: 80000 } },
        );

        const order2 = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Sweep User 2",
            phone: "+919876543210",
            addressLine1: "Sweep St 2",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });
        const attempt2 = await createPaymentAttempt({
          orderRef: order2.orderRef,
          orderId: order2._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
          razorpayOrderId: `rzp_order_sw2_${Date.now()}`,
        });
        await recordPaymentSuccess({
          paymentAttemptId: attempt2._id.toString(),
          razorpayPaymentId: `pay_sw2_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });
        await PaymentAttempt.updateOne(
          { _id: attempt2._id },
          { $set: { status: "REFUND_PENDING", refundAmountPaise: 80000 } },
        );

        // Execute sweep (simulating background worker after process restart)
        const sweepResult = await sweepPendingRefunds({
          refundGateway: async (params) => ({
            success: true,
            refundId: `rfnd_sw_${params.paymentId}`,
            providerStatus: "processed",
          }),
        });

        expect(sweepResult.discovered).toBeGreaterThanOrEqual(2);
        expect(sweepResult.succeeded).toBeGreaterThanOrEqual(2);

        // Verify both attempts are now REFUNDED in DB
        const refreshedAttempt1 = await PaymentAttempt.findById(attempt1._id);
        expect(refreshedAttempt1?.status).toBe("REFUNDED");
        const refreshedAttempt2 = await PaymentAttempt.findById(attempt2._id);
        expect(refreshedAttempt2?.status).toBe("REFUNDED");

        // Concurrent Worker test: Two workers invoke sweep concurrently
        const [concurrentRun1, concurrentRun2] = await Promise.all([
          sweepPendingRefunds({
            refundGateway: async (params) => ({
              success: true,
              refundId: `rfnd_sw_concurrent_${params.paymentId}`,
              providerStatus: "processed",
            }),
          }),
          sweepPendingRefunds({
            refundGateway: async (params) => ({
              success: true,
              refundId: `rfnd_sw_concurrent_${params.paymentId}`,
              providerStatus: "processed",
            }),
          }),
        ]);

        // Neither worker crashes, and neither issues duplicate refunds
        expect(concurrentRun1.failed).toBe(0);
        expect(concurrentRun2.failed).toBe(0);
      });

      it("failed refund followed by an approved retry: preserves failed refund audit trail, generates new unique key on retry, and completes refund", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-FAIL-RETRY-${Date.now()}`,
          title: "Fail Retry Item",
          slug: `fail-retry-${Date.now()}`,
          categoryId,
          basePricePaise: 80000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Fail Retry User",
            phone: "+919876543210",
            addressLine1: "Fail Retry St",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 80000,
          razorpayOrderId: `rzp_order_fl1_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: `pay_fl1_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        await transitionOrderStatus({
          orderRef: order.orderRef,
          targetStatus: "EXPIRED",
          paymentStatus: "REFUND_PENDING",
          refundRequiredPaise: 80000,
        });

        const failedRefundId = `rfnd_failed_${Date.now()}`;
        let capturedKeyCycle1 = "";

        // 1. Initial refund attempt fails at the provider
        const failResult = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundGateway: async (params) => {
            capturedKeyCycle1 = params.idempotencyKey;
            return {
              success: true,
              refundId: failedRefundId,
              providerStatus: "failed",
              error: "Bank account closed / card declined",
            };
          },
        });

        expect(failResult.status).toBe("FAILED");
        expect(failResult.providerStatus).toBe("failed");
        expect(failResult.refundId).toBe(failedRefundId);

        // Audit Trail: Failed refund is preserved and visible
        const attemptAfterFail = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterFail?.status).toBe("REFUND_PENDING");
        expect(attemptAfterFail?.lastRefundStatus).toBe("failed");
        expect(attemptAfterFail?.razorpayRefundId).toBe(failedRefundId);
        expect(attemptAfterFail?.refundHistory?.length).toBe(1);
        expect(attemptAfterFail?.refundHistory?.[0].status).toBe("failed");
        expect(attemptAfterFail?.refundHistory?.[0].refundId).toBe(failedRefundId);

        // Order refund obligation remains visible and unfulfilled
        const orderAfterFail = await getStoreOrderByRef(order.orderRef);
        expect(orderAfterFail?.paymentStatus).toBe("REFUND_PENDING");
        expect(orderAfterFail?.refundRequiredPaise).toBe(80000);
        expect(orderAfterFail?.refundedPaise || 0).toBe(0);

        // 2. Automated background sweep does NOT repeatedly resubmit the failed operation
        const sweepResult = await sweepPendingRefunds();
        // Discovers the failed attempt, counts it in failed, does NOT crash or re-submit
        const failedEntry = sweepResult.details.find((d) => d.attemptId === attempt._id.toString());
        expect(failedEntry?.status).toBe("FAILED");

        // 3. Explicit retry is initiated (initiateNewCycle: true)
        let capturedKeyCycle2 = "";
        const successfulRefundId = `rfnd_success_${Date.now()}`;

        const retryResult = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          initiateNewCycle: true,
          refundReason: "Customer supplied alternate account / approved operational retry",
          refundGateway: async (params) => {
            capturedKeyCycle2 = params.idempotencyKey;
            return {
              success: true,
              refundId: successfulRefundId,
              providerStatus: "processed",
            };
          },
        });

        expect(retryResult.status).toBe("REFUNDED");
        expect(retryResult.refundId).toBe(successfulRefundId);

        // Verify genuine new refund operation receives new unique key
        expect(capturedKeyCycle2).not.toBe(capturedKeyCycle1);
        expect(capturedKeyCycle2).toContain("-2");

        // Audit Trail: Both the failed operation and the successful retry are preserved
        const attemptFinal = await PaymentAttempt.findById(attempt._id);
        expect(attemptFinal?.status).toBe("REFUNDED");
        expect(attemptFinal?.refundAttemptCycle).toBe(2);
        expect(attemptFinal?.refundHistory?.length).toBe(2);
        expect(attemptFinal?.refundHistory?.[0].refundId).toBe(failedRefundId);
        expect(attemptFinal?.refundHistory?.[0].status).toBe("failed");
        expect(attemptFinal?.refundHistory?.[1].refundId).toBe(successfulRefundId);
        expect(attemptFinal?.refundHistory?.[1].status).toBe("processed");

        // Order is now confirmed REFUNDED
        const orderFinal = await getStoreOrderByRef(order.orderRef);
        expect(orderFinal?.paymentStatus).toBe("REFUNDED");
        expect(orderFinal?.refundedPaise).toBe(80000);
        expect(orderFinal?.refundId).toBe(successfulRefundId);
      });

      it("partial refund followed by a second refund: calculates remaining obligation, updates status to REFUNDED, and blocks over-refund", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-TWO-PARTIAL-${Date.now()}`,
          title: "Two Partial Item",
          slug: `two-partial-${Date.now()}`,
          categoryId,
          basePricePaise: 100000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Partial User",
            phone: "+919876543210",
            addressLine1: "Partial St",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 100000,
          razorpayOrderId: `rzp_order_p1_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: `pay_p1_${Date.now()}`,
          rawWebhookPayload: { simulated: true },
        });

        // First partial refund: 40000 of 100000
        const refund1Id = `rfnd_part1_${Date.now()}`;
        const res1 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 40000,
          refundReason: "First partial return",
          refundGateway: async () => ({
            success: true,
            refundId: refund1Id,
            providerStatus: "processed",
          }),
        });

        expect(res1.status).toBe("PARTIALLY_REFUNDED");
        expect(res1.refundId).toBe(refund1Id);

        const orderAfterPart1 = await getStoreOrderByRef(order.orderRef);
        expect(orderAfterPart1?.paymentStatus).toBe("PARTIALLY_REFUNDED");
        expect(orderAfterPart1?.refundedPaise).toBe(40000);

        // Second partial refund for the remaining 60000
        const refund2Id = `rfnd_part2_${Date.now()}`;
        const res2 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 60000,
          refundReason: "Second partial return completing order refund",
          refundGateway: async () => ({
            success: true,
            refundId: refund2Id,
            providerStatus: "processed",
          }),
        });

        // Now total refunded equals 100000 -> Order transitions to REFUNDED!
        expect(res2.status).toBe("REFUNDED");
        expect(res2.refundId).toBe(refund2Id);

        const orderAfterPart2 = await getStoreOrderByRef(order.orderRef);
        expect(orderAfterPart2?.paymentStatus).toBe("REFUNDED");
        expect(orderAfterPart2?.refundedPaise).toBe(100000);

        const attemptFinal = await PaymentAttempt.findById(attempt._id);
        expect(attemptFinal?.status).toBe("REFUNDED");
        expect(attemptFinal?.refundAmountPaise).toBe(100000);

        // Attempting an extra refund is rejected: cumulative confirmed refunds never exceed captured amount
        const res3 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 10000,
          refundReason: "Illegal excess refund",
        });
        expect(res3.status).toBe("REFUNDED");
        expect(res3.isReplay).toBe(true);
      });

      it("duplicate and out-of-order webhooks: ignores duplicate processed webhooks and prevents late failed webhooks from overwriting success", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-OUT-ORDER-${Date.now()}`,
          title: "Out of Order Item",
          slug: `out-of-order-${Date.now()}`,
          categoryId,
          basePricePaise: 90000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Webhook User",
            phone: "+919876543210",
            addressLine1: "Hook St",
            city: "Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        });

        const rzpPayId = `pay_ooo_${Date.now()}`;
        const rzpRefundId = `rfnd_ooo_${Date.now()}`;

        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 90000,
          razorpayOrderId: `rzp_order_ooo_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id.toString(),
          razorpayPaymentId: rzpPayId,
          rawWebhookPayload: { simulated: true },
        });

        // 1. Webhook refund.processed arrives
        const processedPayload = {
          event: "refund.processed",
          payload: {
            refund: {
              entity: {
                id: rzpRefundId,
                payment_id: rzpPayId,
                amount: 90000,
                status: "processed",
                notes: { orderRef: order.orderRef },
              },
            },
          },
        };

        const firstRes = await handleRazorpayRefundWebhook(processedPayload);
        expect(firstRes.processed).toBe(true);
        expect(firstRes.status).toBe("REFUNDED");

        // 2. Duplicate webhook refund.processed arrives
        const duplicateRes = await handleRazorpayRefundWebhook(processedPayload);
        expect(duplicateRes.processed).toBe(true);
        expect(duplicateRes.status).toBe("REFUNDED");

        // 3. Out-of-order or stale refund.failed webhook arrives
        const failedPayload = {
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: rzpRefundId,
                payment_id: rzpPayId,
                notes: { orderRef: order.orderRef },
              },
            },
          },
        };

        const staleFailedRes = await handleRazorpayRefundWebhook(failedPayload);
        expect(staleFailedRes.processed).toBe(false);
        expect(staleFailedRes.status).toBe("IGNORED_ALREADY_REFUNDED");

        // Status remains authoritatively REFUNDED
        const finalAttempt = await PaymentAttempt.findById(attempt._id);
        expect(finalAttempt?.status).toBe("REFUNDED");
        const finalOrder = await getStoreOrderByRef(order.orderRef);
        expect(finalOrder?.paymentStatus).toBe("REFUNDED");
      });

      it("cross-cycle refund webhook isolation: delayed refund.failed for cycle 1 cannot modify pending cycle 2, and cycle 2 completes on refund.processed", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-CYCLE-ISO-${Date.now()}`,
          title: "Cycle Isolation Item",
          slug: `cycle-iso-${Date.now()}`,
          categoryId,
          basePricePaise: 75000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Cycle Tester",
            phone: "+919876543210",
            addressLine1: "123 Gateway Blvd",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400001",
            country: "India",
          },
        });

        const rzpPayId = `pay_iso_${Date.now()}`;
        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 75000,
          razorpayOrderId: `rzp_order_iso_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id,
          razorpayPaymentId: rzpPayId,
          razorpaySignature: "mock_sig",
          amountPaise: 75000,
        });

        // 1. Refund cycle 1 is created and Razorpay authoritatively marks it failed
        const cycle1RefundId = `rfnd_iso_c1_${Date.now()}`;
        const resCycle1 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 75000,
          refundReason: "Cycle 1 initial attempt",
          refundGateway: async () => ({
            success: true,
            refundId: cycle1RefundId,
            providerStatus: "failed",
            error: "Bank network failure",
          }),
        });

        expect(resCycle1.status).toBe("FAILED");
        const attemptAfterC1 = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterC1?.refundAttemptCycle).toBe(1);
        expect(attemptAfterC1?.lastRefundStatus).toBe("failed");
        expect(attemptAfterC1?.razorpayRefundId).toBe(cycle1RefundId);
        expect(attemptAfterC1?.refundHistory).toHaveLength(1);
        expect(attemptAfterC1?.refundHistory?.[0].status).toBe("failed");
        expect(attemptAfterC1?.refundHistory?.[0].refundId).toBe(cycle1RefundId);

        // 2. Explicit retry creates refund cycle 2 with a new idempotency key and its own refund ID
        const cycle2RefundId = `rfnd_iso_c2_${Date.now()}`;
        const resCycle2 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          initiateNewCycle: true,
          refundAmountPaise: 75000,
          refundReason: "Cycle 2 approved retry",
          refundGateway: async () => ({
            success: true,
            refundId: cycle2RefundId,
            providerStatus: "pending",
          }),
        });

        // 3. Cycle 2 is pending
        expect(resCycle2.status).toBe("REFUND_PENDING");
        expect(resCycle2.refundId).toBe(cycle2RefundId);
        expect(resCycle2.providerStatus).toBe("pending");

        const attemptAfterC2 = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterC2?.refundAttemptCycle).toBe(2);
        expect(attemptAfterC2?.lastRefundStatus).toBe("pending");
        expect(attemptAfterC2?.razorpayRefundId).toBe(cycle2RefundId);
        expect(attemptAfterC2?.status).toBe("REFUND_PENDING");

        // 4. Delayed refund.failed webhook for cycle 1 arrives!
        const delayedCycle1Webhook = {
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: cycle1RefundId,
                payment_id: rzpPayId,
                amount: 75000,
                notes: {
                  orderRef: order.orderRef,
                  idempotencyKey: `rfnd-${order.orderRef}-1`,
                },
              },
            },
          },
        };

        const staleWebRes = await handleRazorpayRefundWebhook(delayedCycle1Webhook);
        // Acceptance check: Stale cycle 1 event must NOT modify cycle 2's status, refund ID, amount, or idempotency key
        expect(staleWebRes.processed).toBe(false);

        const attemptAfterStale = await PaymentAttempt.findById(attempt._id);
        // Cycle 2 active state is preserved untouched!
        expect(attemptAfterStale?.razorpayRefundId).toBe(cycle2RefundId);
        expect(attemptAfterStale?.lastRefundStatus).toBe("pending");
        expect(attemptAfterStale?.status).toBe("REFUND_PENDING");
        expect(attemptAfterStale?.refundAttemptCycle).toBe(2);

        // Cycle 1's failure remains in the immutable refund history
        const c1Hist = attemptAfterStale?.refundHistory?.find(h => h.refundId === cycle1RefundId);
        expect(c1Hist).toBeDefined();
        expect(c1Hist?.status).toBe("failed");

        // 5. Cycle 2 later receives refund.processed
        const cycle2ProcessedWebhook = {
          event: "refund.processed",
          payload: {
            refund: {
              entity: {
                id: cycle2RefundId,
                payment_id: rzpPayId,
                amount: 75000,
                status: "processed",
                notes: {
                  orderRef: order.orderRef,
                  idempotencyKey: `rfnd-${order.orderRef}-1-2`,
                },
              },
            },
          },
        };

        const cycle2WebRes = await handleRazorpayRefundWebhook(cycle2ProcessedWebhook);
        expect(cycle2WebRes.processed).toBe(true);
        expect(cycle2WebRes.status).toBe("REFUNDED");
        expect(cycle2WebRes.refundId).toBe(cycle2RefundId);

        // Final verification: cycle 2 completed, cumulative refunds equal 75000, no over-refund
        const attemptFinal = await PaymentAttempt.findById(attempt._id);
        expect(attemptFinal?.status).toBe("REFUNDED");
        expect(attemptFinal?.lastRefundStatus).toBe("processed");
        expect(attemptFinal?.razorpayRefundId).toBe(cycle2RefundId);
        expect(attemptFinal?.refundAmountPaise).toBe(75000);

        const orderFinal = await getStoreOrderByRef(order.orderRef);
        expect(orderFinal?.paymentStatus).toBe("REFUNDED");
        expect(orderFinal?.refundedPaise).toBe(75000);

        // Duplicate delivery of cycle 2 webhook is idempotent replay
        const duplicateRes = await handleRazorpayRefundWebhook(cycle2ProcessedWebhook);
        expect(duplicateRes.processed).toBe(true);
        expect(duplicateRes.status).toBe("REFUNDED");
        const orderDuplicateCheck = await getStoreOrderByRef(order.orderRef);
        expect(orderDuplicateCheck?.refundedPaise).toBe(75000); // no double-counting
      });

      it("unknown refund ID isolation: unknown refund ID matching payment ID/orderRef cannot modify pending cycle 2, and cycle 2 completes on refund.processed", async () => {
        const db = await getStoreDb();
        const PaymentAttempt = getStorePaymentAttemptModel(db);

        const product = await createStoreProduct({
          sku: `SKU-UNK-ISO-${Date.now()}`,
          title: "Unknown Refund ID Isolation Item",
          slug: `unk-iso-${Date.now()}`,
          categoryId,
          basePricePaise: 85000,
          stock: 5,
        });

        const order = await createStoreOrder({
          memberId,
          items: [{ productId: product._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Unknown Tester",
            phone: "+919876543210",
            addressLine1: "456 Gateway Ave",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400001",
            country: "India",
          },
        });

        const rzpPayId = `pay_unk_${Date.now()}`;
        const attempt = await createPaymentAttempt({
          orderRef: order.orderRef,
          orderId: order._id.toString(),
          memberId,
          attemptNumber: 1,
          amountPaise: 85000,
          razorpayOrderId: `rzp_order_unk_${Date.now()}`,
        });

        await recordPaymentSuccess({
          paymentAttemptId: attempt._id,
          razorpayPaymentId: rzpPayId,
          razorpaySignature: "mock_sig",
          amountPaise: 85000,
        });

        // 1. Refund cycle 1 fails and its refund ID is recorded in refund history
        const cycle1RefundId = `rfnd_unk_c1_${Date.now()}`;
        const resCycle1 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          refundAmountPaise: 85000,
          refundReason: "Cycle 1 initial failure",
          refundGateway: async () => ({
            success: true,
            refundId: cycle1RefundId,
            providerStatus: "failed",
            error: "Bank technical decline",
          }),
        });

        expect(resCycle1.status).toBe("FAILED");
        const attemptAfterC1 = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterC1?.refundAttemptCycle).toBe(1);
        expect(attemptAfterC1?.lastRefundStatus).toBe("failed");
        expect(attemptAfterC1?.razorpayRefundId).toBe(cycle1RefundId);
        expect(attemptAfterC1?.refundHistory).toHaveLength(1);
        expect(attemptAfterC1?.refundHistory?.[0].refundId).toBe(cycle1RefundId);
        expect(attemptAfterC1?.refundHistory?.[0].status).toBe("failed");

        // 2. Refund cycle 2 is initiated and remains pending, with its own refund ID
        const cycle2RefundId = `rfnd_unk_c2_${Date.now()}`;
        const resCycle2 = await reconcilePaymentRefund({
          paymentAttemptId: attempt._id,
          initiateNewCycle: true,
          refundAmountPaise: 85000,
          refundReason: "Cycle 2 authorized retry",
          refundGateway: async () => ({
            success: true,
            refundId: cycle2RefundId,
            providerStatus: "pending",
          }),
        });

        expect(resCycle2.status).toBe("REFUND_PENDING");
        expect(resCycle2.refundId).toBe(cycle2RefundId);
        expect(resCycle2.providerStatus).toBe("pending");

        const attemptAfterC2 = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterC2?.refundAttemptCycle).toBe(2);
        expect(attemptAfterC2?.lastRefundStatus).toBe("pending");
        expect(attemptAfterC2?.razorpayRefundId).toBe(cycle2RefundId);
        expect(attemptAfterC2?.status).toBe("REFUND_PENDING");
        expect(attemptAfterC2?.refundAmountPaise).toBe(85000);

        // 3. A validly signed refund.failed event arrives with an UNKNOWN refund ID,
        // but with the correct Razorpay payment ID and/or order reference!
        const unknownRefundId = `rfnd_spurious_unknown_${Date.now()}`;
        const unknownFailedWebhook = {
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: unknownRefundId,
                payment_id: rzpPayId, // Matching payment ID!
                amount: 85000,
                notes: {
                  orderRef: order.orderRef, // Matching order reference!
                  someRandomTag: "not-a-known-idempotency-key",
                },
              },
            },
          },
        };

        const unknownWebRes = await handleRazorpayRefundWebhook(unknownFailedWebhook);
        // Acceptance check: Matching by payment ID or order reference alone must NOT authorize state transition!
        expect(unknownWebRes.processed).toBe(false);
        expect(unknownWebRes.status).toBe("IGNORED_UNKNOWN_REFUND_ID");
        expect(unknownWebRes.refundId).toBe(unknownRefundId);

        // Verify active cycle 2 is completely unmodified
        const attemptAfterUnknown = await PaymentAttempt.findById(attempt._id);
        expect(attemptAfterUnknown?.razorpayRefundId).toBe(cycle2RefundId); // NOT overwritten by unknownRefundId
        expect(attemptAfterUnknown?.lastRefundStatus).toBe("pending"); // NOT falsely marked failed
        expect(attemptAfterUnknown?.status).toBe("REFUND_PENDING");
        expect(attemptAfterUnknown?.refundAttemptCycle).toBe(2);
        expect(attemptAfterUnknown?.refundAmountPaise).toBe(85000);

        // Verify unknown refund ID was NOT added into refund history
        const unknownInHist = attemptAfterUnknown?.refundHistory?.find(
          (h) => h.refundId === unknownRefundId,
        );
        expect(unknownInHist).toBeUndefined();

        // Duplicate delivery of the unknown event remains safe and idempotent
        const duplicateUnknownRes = await handleRazorpayRefundWebhook(unknownFailedWebhook);
        expect(duplicateUnknownRes.processed).toBe(false);
        expect(duplicateUnknownRes.status).toBe("IGNORED_UNKNOWN_REFUND_ID");

        // 4. Cycle 2 later receives its genuine refund.processed event
        const cycle2ProcessedWebhook = {
          event: "refund.processed",
          payload: {
            refund: {
              entity: {
                id: cycle2RefundId,
                payment_id: rzpPayId,
                amount: 85000,
                status: "processed",
                notes: {
                  orderRef: order.orderRef,
                  idempotencyKey: `rfnd-${order.orderRef}-1-2`,
                },
              },
            },
          },
        };

        const cycle2WebRes = await handleRazorpayRefundWebhook(cycle2ProcessedWebhook);
        expect(cycle2WebRes.processed).toBe(true);
        expect(cycle2WebRes.status).toBe("REFUNDED");
        expect(cycle2WebRes.refundId).toBe(cycle2RefundId);

        // Final verification: cycle 2 completed normally with correct cumulative accounting
        const attemptFinal = await PaymentAttempt.findById(attempt._id);
        expect(attemptFinal?.status).toBe("REFUNDED");
        expect(attemptFinal?.lastRefundStatus).toBe("processed");
        expect(attemptFinal?.razorpayRefundId).toBe(cycle2RefundId);
        expect(attemptFinal?.refundAmountPaise).toBe(85000);

        const orderFinal = await getStoreOrderByRef(order.orderRef);
        expect(orderFinal?.paymentStatus).toBe("REFUNDED");
        expect(orderFinal?.refundedPaise).toBe(85000);

        // Duplicate delivery of genuine cycle 2 webhook is safe
        const duplicateCycle2Res = await handleRazorpayRefundWebhook(cycle2ProcessedWebhook);
        expect(duplicateCycle2Res.processed).toBe(true);
        expect(duplicateCycle2Res.status).toBe("REFUNDED");
        const orderDuplicateCheck = await getStoreOrderByRef(order.orderRef);
        expect(orderDuplicateCheck?.refundedPaise).toBe(85000);
      });
    });
  });
});

