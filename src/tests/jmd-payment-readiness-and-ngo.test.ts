import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: <T>(fn: T): T => fn,
  }),
}));

import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import {
  createStoreOrder,
  getStoreOrderByRef,
} from "@/server/store/services/order.service";
import {
  createPaymentAttempt,
  recordPaymentSuccess,
  verifyRazorpaySignature,
} from "@/server/store/services/payment.service";
import { processPostPaymentCheckout } from "@/server/store/services/checkout.service";
import {
  getStoreProductModel,
  getStoreCategoryModel,
} from "@/server/store/models";
import { updateStoreSettings } from "@/server/store/services/settings.service";
import { getRechargeProvider } from "@/server/store/services/recharge-provider";
import { confirmPayoutSettlement } from "@/server/store/services/withdrawal.service";
import { handleProxyRoute } from "@/proxy";
import { BHAVIKA_REGISTER_URL } from "@/lib/constants";
import { Types } from "mongoose";
import crypto from "crypto";

describe("Jai Maa Durga — NGO Registration Banner & Payment Readiness Suite", () => {
  let memberId: Types.ObjectId;
  let groceryProductId: string;
  let goldRingProductId: string;

  beforeEach(async () => {
    const conn = await getStoreDb();
    const collections = conn.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    // Register test store member
    const member = await registerStoreMember({
      name: "Suman Sharma",
      phone: "9876543201",
      email: "suman@test.dev",
      password: "Password123!",
    });
    memberId = member._id;

    // Create categories
    const CatModel = getStoreCategoryModel(conn);
    const groceryCategory = await CatModel.create({
      name: "Grocery",
      slug: "grocery",
      type: "GROCERY",
      isActive: true,
    });

    const goldCategory = await CatModel.create({
      name: "Gold Jewellery",
      slug: "gold-jewellery",
      type: "JEWELLERY_GOLD",
      isActive: true,
    });

    // Create a normal grocery product
    const ProdModel = getStoreProductModel(conn);
    const groceryProd = await ProdModel.create({
      sku: "JMD-GROC-RICE-01",
      title: "Royal Basmati Rice 5kg",
      slug: "royal-basmati-rice-5kg",
      category: groceryCategory._id,
      basePricePaise: 549_00, // ₹549.00
      stock: 100,
      reservedStock: 0,
      isActive: true,
    });
    groceryProductId = groceryProd._id.toString();

    // Create a gold ring product
    const goldProd = await ProdModel.create({
      sku: "JMD-GLD-RING-01",
      title: "Traditional Gold Ring 22K",
      slug: "traditional-gold-ring-22k",
      category: goldCategory._id,
      basePricePaise: 45000_00,
      stock: 10,
      reservedStock: 0,
      isActive: true,
      attributes: {
        metalType: "GOLD",
        grossWeightGrams: 5.0,
        netWeightGrams: 5.0,
        purity: "22K",
      },
    });
    goldRingProductId = goldProd._id.toString();

    // Configure store settings with jewellery CA approval = FALSE
    await updateStoreSettings({
      jewellery: {
        caApprovalConfirmed: false, // Unapproved pending written CA confirmation
      },
      cod: {
        codEnabled: true,
        maxOrderAmountPaise: 500_000,
      },
    });
  });

  /* ========================================================================== */
  /*  1. Normal Eligible Product Checkout & Razorpay Flow                       */
  /* ========================================================================== */
  describe("1. Normal Product Razorpay Checkout & Payment Transitions", () => {
    it("allows normal grocery products to proceed through Razorpay checkout and complete payment", async () => {
      // Create order for normal grocery product
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: groceryProductId, quantity: 2 }], // 2 * ₹549 = ₹1,098 (qualifies for free shipping >= ₹999)
        shippingAddress: {
          fullName: "Suman Sharma",
          phone: "9876543201",
          addressLine1: "123 Market Street",
          city: "Varanasi",
          state: "Uttar Pradesh",
          postalCode: "221001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });

      expect(order.orderRef).toMatch(/^JMD-ORD-\d{4}-\d{6}$/);
      expect(order.status).toBe("PENDING_PAYMENT");
      expect(order.paymentStatus).toBe("UNPAID");
      expect(order.netPayablePaise).toBe(1098_00);

      // Create payment attempt
      const attempt = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: order.netPayablePaise,
        razorpayOrderId: "order_mock_test_12345",
      });

      expect(attempt.status).toBe("CREATED");
      expect(attempt.gateway).toBe("RAZORPAY");

      // Record payment success
      const { attempt: recordedAttempt, isReplay } = await recordPaymentSuccess({
        paymentAttemptId: attempt._id,
        razorpayPaymentId: "pay_mock_success_12345",
        razorpaySignature: "mock_sig_12345",
        amountPaise: order.netPayablePaise,
      });

      expect(isReplay).toBe(false);
      expect(recordedAttempt.status).toBe("SUCCESS");

      // Execute post-payment checkout fulfillment
      const checkoutResult = await processPostPaymentCheckout({
        orderRef: order.orderRef,
        paymentAttemptId: attempt._id,
      });

      expect(checkoutResult.status).toBe("PAID");
      expect(checkoutResult.deficitPaise).toBe(0);

      const refreshedOrder = await getStoreOrderByRef(order.orderRef);
      expect(refreshedOrder?.status).toBe("PAID");
      expect(refreshedOrder?.paymentStatus).toBe("CAPTURED");

      // Verify stock was decremented from 100 to 98
      const conn = await getStoreDb();
      const ProdModel = getStoreProductModel(conn);
      const updatedProduct = await ProdModel.findById(groceryProductId);
      expect(updatedProduct?.stock).toBe(98);
      expect(updatedProduct?.reservedStock).toBe(0);
    });

    it("verifies Razorpay HMAC-SHA256 signatures accurately and rejects tampering", () => {
      const secret = "sample_test_secret_key_12345";
      const orderId = "order_test_98765";
      const paymentId = "pay_test_54321";

      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const isValid = verifyRazorpaySignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
        secret,
      });

      expect(isValid).toBe(true);

      // Tampered signature must fail
      const tampered = verifyRazorpaySignature({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: "forged_signature_hex_value",
        secret,
      });

      expect(tampered).toBe(false);
    });
  });

  /* ========================================================================== */
  /*  2. Feature-Specific Gating Isolation                                      */
  /* ========================================================================== */
  describe("2. Unrelated Feature Gates Do Not Block Normal Product Checkout", () => {
    it("blocks jewellery checkout when CA approval is false, while normal products remain completely unblocked", async () => {
      const shippingAddress = {
        fullName: "Suman Sharma",
        phone: "9876543201",
        addressLine1: "123 Market Street",
        city: "Varanasi",
        state: "Uttar Pradesh",
        postalCode: "221001",
        country: "India",
      };

      // 1. Normal grocery order SUCCEEDS
      const normalOrder = await createStoreOrder({
        memberId,
        items: [{ productId: groceryProductId, quantity: 1 }],
        shippingAddress,
      });
      expect(normalOrder.orderRef).toBeDefined();

      // 2. Jewellery order FAILS with JEWELLERY_TAX_APPROVAL_PENDING
      await expect(
        createStoreOrder({
          memberId,
          items: [{ productId: goldRingProductId, quantity: 1 }],
          shippingAddress,
        }),
      ).rejects.toThrow(/Jewellery checkout is gated pending written Chartered Accountant confirmation/);
    });

    it("missing mobile recharge credentials blocks recharge only and does not affect normal checkout", () => {
      const origEnv = process.env.NODE_ENV;
      const envRecord = process.env as Record<string, string | undefined>;
      try {
        envRecord.NODE_ENV = "production";
        expect(() => getRechargeProvider()).toThrow(
          /No production recharge provider configured/,
        );
      } finally {
        envRecord.NODE_ENV = origEnv;
      }
    });

    it("missing external provider payout reference blocks payout confirmation only", async () => {
      await expect(
        confirmPayoutSettlement({
          withdrawalId: new Types.ObjectId(),
          adminId: new Types.ObjectId(),
          providerPayoutRef: "   ", // Missing or whitespace
        }),
      ).rejects.toThrow(/A valid external provider payout settlement reference/);
    });
  });

  /* ========================================================================== */
  /*  3. Bhavika Foundation NGO Registration Banner & Canonical URL            */
  /* ========================================================================== */
  describe("3. Bhavika NGO Registration Banner & Registration URL", () => {
    const origRegisterEnv = process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL;

    afterEach(() => {
      if (origRegisterEnv !== undefined) {
        process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL = origRegisterEnv;
      } else {
        delete process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL;
      }
    });

    it("uses the canonical production Bhavika registration URL by default", () => {
      delete process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL;
      expect(BHAVIKA_REGISTER_URL).toBe(
        "https://bhavika-education-welfare.vercel.app/register",
      );
    });

    it("respects NEXT_PUBLIC_BHAVIKA_REGISTER_URL when configured", () => {
      process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL =
        "https://custom-foundation.org/register";
      const resolved =
        process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL || BHAVIKA_REGISTER_URL;
      expect(resolved).toBe("https://custom-foundation.org/register");
    });
  });

  /* ========================================================================== */
  /*  4. Deployment Modes & Routing Isolation                                   */
  /* ========================================================================== */
  describe("4. Dual Deployment Modes & Homepage Routing", () => {
    const origSiteMode = process.env.JMD_SITE_MODE;

    afterEach(() => {
      if (origSiteMode !== undefined) {
        process.env.JMD_SITE_MODE = origSiteMode;
      } else {
        delete process.env.JMD_SITE_MODE;
      }
    });

    it("rewrites root '/' to '/store' when JMD_SITE_MODE is 'true' (JMD Deployment)", () => {
      process.env.JMD_SITE_MODE = "true";
      const res = handleProxyRoute({
        nextUrl: new URL("https://jai-maa-durga.vercel.app/"),
        auth: null,
      });

      expect(res.headers.get("x-middleware-rewrite")).toBe(
        "https://jai-maa-durga.vercel.app/store",
      );
    });

    it("does not rewrite root '/' when JMD_SITE_MODE is unset or false (Bhavika Foundation Deployment)", () => {
      process.env.JMD_SITE_MODE = "false";
      const res = handleProxyRoute({
        nextUrl: new URL("https://bhavika-education-welfare.vercel.app/"),
        auth: null,
      });

      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("preserves direct access to Bhavika registration at '/register'", () => {
      process.env.JMD_SITE_MODE = "false";
      const res = handleProxyRoute({
        nextUrl: new URL("https://bhavika-education-welfare.vercel.app/register"),
        auth: null,
      });

      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    });
  });
});
