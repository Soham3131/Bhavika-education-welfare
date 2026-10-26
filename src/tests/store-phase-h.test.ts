import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { mutateStoreWallet } from "@/server/store/services/wallet-ledger.service";
import {
  purchasePin,
  activateMemberWithPin,
} from "@/server/store/services/pin.service";
import { PinTier, PinStatus } from "@/server/store/models/StorePin";
import {
  MockRechargeProvider,
  getRechargeProvider,
  setRechargeProvider,
} from "@/server/store/services/recharge-provider";
import {
  StoreCouponSource,
  StoreCouponStatus,
} from "@/server/store/models/StoreCoupon";
import { issueStoreCoupon } from "@/server/store/services/store-coupon.service";
import {
  calculateJewelleryPrice,
} from "@/server/store/services/jewellery-pricing.service";
import {
  createStoreCategory,
  createStoreProduct,
} from "@/server/store/services/product.service";
import { createStoreOrder } from "@/server/store/services/order.service";
import { getStoreSettingsModel } from "@/server/store/models/StoreSettings";
import {
  signBhavikaRequest,
  redeemBhavikaCoupon,
} from "@/server/store/services/bhavika-client.service";
import {
  requireSignedStoreRequest,
  STORE_API_RATE,
  chargeUnknownCode,
} from "@/server/services/integration.service";
import {
  issueCoupon,
  redeemCoupon,
  validateCoupon,
  getCouponByCode,
} from "@/server/services/coupon.service";
import { creditPoints } from "@/server/services/wallet.service";
import { Coupon, SystemSettings } from "@/server/models";
import { PointSource, CouponStatus } from "@/lib/enums";
import { env } from "@/lib/env";
import { rateLimit } from "@/server/rate-limit";
import { DomainError } from "@/server/errors";
import { makeUser } from "./helpers";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase H — Integration Verification & Safety Controls", () => {
  const TEST_SECRET = "jmd_test_secret_do_not_use_in_production";
  let sponsorLead: RegisteredMember;
  let directDownline: RegisteredMember;
  let grandchildDownline: RegisteredMember;
  let outsideMember: RegisteredMember;

  beforeAll(async () => {
    // 1. Create immediate direct sponsor tree
    sponsorLead = await registerStoreMember({
      name: "Sponsor Lead H",
      phone: "9876548001",
      password: "password123",
      email: "sponsorlead_h@test.dev",
    });

    const db = await getStoreDb();
    const Member = getStoreMemberModel(db);
    await Member.findByIdAndUpdate(sponsorLead._id, { tier: "AREA" });

    // 2. Direct downline sponsored by sponsorLead
    directDownline = await registerStoreMember({
      name: "Direct Downline H",
      phone: "9876548002",
      password: "password123",
      email: "direct_h@test.dev",
      sponsorId: sponsorLead.memberId,
    });

    // 3. Grandchild downline sponsored by directDownline
    grandchildDownline = await registerStoreMember({
      name: "Grandchild Downline H",
      phone: "9876548003",
      password: "password123",
      email: "grandchild_h@test.dev",
      sponsorId: directDownline.memberId,
    });

    // 4. Outside member (different tree)
    outsideMember = await registerStoreMember({
      name: "Outside Member H",
      phone: "9876548004",
      password: "password123",
      email: "outside_h@test.dev",
    });

    // Fund sponsorLead wallet for PIN tests
    await mutateStoreWallet({
      memberId: sponsorLead._id,
      walletType: "ADD_MONEY",
      type: "CREDIT",
      unit: "INR_PAISE",
      amountPaise: 10000000, // ₹100,000
      referenceType: "ADMIN_CORRECTION",
      referenceId: "fund-h-sponsor",
      idempotencyKey: "fund-h-sponsor",
      description: "Seed funding for Phase H tests",
    });
  });

  /* ========================================================================== */
  /*  H1. Mock Recharge Provider Production Lockdown                            */
  /* ========================================================================== */
  describe("H1. Mock Recharge Provider Production Lockdown", () => {
    it("unconditionally rejects MockRechargeProvider in production regardless of ALLOW_MOCK_RECHARGE", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllow = process.env.ALLOW_MOCK_RECHARGE;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        process.env.ALLOW_MOCK_RECHARGE = "true"; // Attempt bypass flag

        expect(() => new MockRechargeProvider()).toThrow(
          /MockRechargeProvider is strictly forbidden and not permitted in production/i,
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
        if (originalAllow) process.env.ALLOW_MOCK_RECHARGE = originalAllow;
        else delete process.env.ALLOW_MOCK_RECHARGE;
      }
    });

    it("throws when getRechargeProvider() is called in production without a configured provider", () => {
      const originalEnv = process.env.NODE_ENV;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        // Reset active provider to null
        setRechargeProvider(null as unknown as MockRechargeProvider);

        expect(() => getRechargeProvider()).toThrow(
          /No production recharge provider configured/i,
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
        // Restore non-production mock provider
        setRechargeProvider(new MockRechargeProvider());
      }
    });
  });

  /* ========================================================================== */
  /*  H2. Native Coupon Source Enum & Issuance Coverage                         */
  /* ========================================================================== */
  describe("H2. Native Coupon Source Enum & Issuance Coverage", () => {
    it("includes all client-mandated and advanced native coupon sources", () => {
      expect(StoreCouponSource.FREE_REGISTRATION).toBe("FREE_REGISTRATION");
      expect(StoreCouponSource.ORDER_PURCHASE).toBe("ORDER_PURCHASE");
      expect(StoreCouponSource.POINTS_CONVERSION).toBe("POINTS_CONVERSION");
      expect(StoreCouponSource.RECHARGE).toBe("RECHARGE");
      expect(StoreCouponSource.PIN_PURCHASE).toBe("PIN_PURCHASE");
      expect(StoreCouponSource.EMI_INSTALMENT).toBe("EMI_INSTALMENT");
      expect(StoreCouponSource.ADMIN_GRANT).toBe("ADMIN_GRANT");
    });

    it("successfully issues native coupons from each client source without financial enrolment rewards", async () => {
      const sources = [
        StoreCouponSource.FREE_REGISTRATION,
        StoreCouponSource.RECHARGE,
        StoreCouponSource.PIN_PURCHASE,
      ];

      for (const source of sources) {
        const coupon = await issueStoreCoupon({
          memberId: directDownline._id,
          faceValuePaise: 5000, // ₹50.00
          source,
          sourceRef: `source-test-${source}`,
          validityDays: 60,
        });

        expect(coupon.couponCode).toMatch(/^JMD-CPN-\d{4}-[A-Z0-9]+$/);
        expect(coupon.source).toBe(source);
        expect(coupon.status).toBe(StoreCouponStatus.ACTIVE);
        expect(coupon.faceValuePaise).toBe(5000);
      }
    });
  });

  /* ========================================================================== */
  /*  H3. PIN Immediate Sponsor Boundary Restrictions                           */
  /* ========================================================================== */
  describe("H3. PIN Immediate Sponsor Boundary Restrictions", () => {
    let pinId: string;

    beforeEach(async () => {
      const pin = await purchasePin({
        memberId: sponsorLead._id,
        tier: PinTier.AREA,
      });
      pinId = pin._id.toString();
    });

    it("allows immediate direct sponsor to activate their direct sponsored member", async () => {
      const result = await activateMemberWithPin({
        pinId,
        actingMemberId: sponsorLead._id,
        targetMemberPhone: directDownline.phone, // Direct downline: sponsorId === sponsorLead.memberId
      });

      expect(result.tier).toBe("AREA");
      expect(result.pin.status).toBe(PinStatus.REDEEMED);
      expect(result.pin.redeemedByMember?.toString()).toBe(directDownline._id.toString());
    });

    it("strictly rejects activation of grandchildren or deeper descendants", async () => {
      // sponsorLead is in grandchildDownline.sponsorPath, but sponsorId is directDownline
      await expect(
        activateMemberWithPin({
          pinId,
          actingMemberId: sponsorLead._id,
          targetMemberPhone: grandchildDownline.phone,
        }),
      ).rejects.toThrow(
        /PIN activation is strictly restricted to your immediate direct sponsored member/i,
      );
    });

    it("strictly rejects activation of members outside the tree", async () => {
      await expect(
        activateMemberWithPin({
          pinId,
          actingMemberId: sponsorLead._id,
          targetMemberPhone: outsideMember.phone,
        }),
      ).rejects.toThrow(
        /PIN activation is strictly restricted to your immediate direct sponsored member/i,
      );
    });
  });

  /* ========================================================================== */
  /*  H4. Jewellery Settings Validation & CA Approval Boundary                  */
  /* ========================================================================== */
  describe("H4. Jewellery Settings Validation & CA Approval Boundary", () => {
    it("reads tax rates and lock window from StoreSettings and preserves unapproved CA status", async () => {
      const db = await getStoreDb();
      const SettingsModel = getStoreSettingsModel(db);

      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        {
          $set: {
            "settings.jewellery.metalGstRateBasisPoints": 300,
            "settings.jewellery.makingGstRateBasisPoints": 500,
            "settings.jewellery.quoteLockDurationMinutes": 30,
            "settings.jewellery.caApprovalConfirmed": false, // Pending written CA confirmation
          },
        },
        { upsert: true },
      );

      const quote = await calculateJewelleryPrice({
        metalType: "GOLD",
        grossWeightGrams: 10,
        stoneWeightGrams: 0,
        makingChargeType: "PERCENTAGE",
        makingChargeValue: 10,
      });

      expect(quote.metalGstPaise).toBe(Math.round(quote.metalValuePaise * 0.03));
      expect(quote.makingGstPaise).toBe(Math.round(quote.makingChargesPaise * 0.05));
      expect(quote.priceLockedUntil.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
      expect(quote.caApprovalConfirmed).toBe(false);
      expect(quote.pricingStatus).toBe("ESTIMATE_PENDING_CA_APPROVAL");
    });

    it("rejects final quote locking when CA approval is false", async () => {
      const db = await getStoreDb();
      const SettingsModel = getStoreSettingsModel(db);

      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        { $set: { "settings.jewellery.caApprovalConfirmed": false } },
        { upsert: true },
      );

      await expect(
        calculateJewelleryPrice(
          {
            metalType: "GOLD",
            grossWeightGrams: 10,
          },
          { requireCaApproval: true },
        ),
      ).rejects.toThrow(/pending written Chartered Accountant confirmation/i);
    });

    it("gates jewellery product checkout until CA approval is confirmed", async () => {
      const db = await getStoreDb();
      const SettingsModel = getStoreSettingsModel(db);

      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        { $set: { "settings.jewellery.caApprovalConfirmed": false } },
        { upsert: true },
      );

      const cat = await createStoreCategory({
        name: "Gold Jewellery Test",
        slug: `gold-jewellery-test-${Date.now()}`,
        type: "JEWELLERY_GOLD",
      });

      const prod = await createStoreProduct({
        sku: `GOLD-RING-${Date.now()}`,
        title: "22K Gold Ring",
        slug: `22k-gold-ring-${Date.now()}`,
        categoryId: cat._id.toString(),
        basePricePaise: 5000000,
        stock: 5,
      });

      // Checkout must be blocked while caApprovalConfirmed is false
      await expect(
        createStoreOrder({
          memberId: sponsorLead._id,
          items: [{ productId: prod._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Test Member",
            phone: "+919999000001",
            addressLine1: "123 Test St",
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400001",
            country: "India",
          },
        }),
      ).rejects.toThrow(/Jewellery checkout is gated pending written Chartered Accountant confirmation/i);

      // When CA confirmation is recorded, checkout succeeds
      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        { $set: { "settings.jewellery.caApprovalConfirmed": true } },
      );

      const order = await createStoreOrder({
        memberId: sponsorLead._id,
        items: [{ productId: prod._id.toString(), quantity: 1 }],
        shippingAddress: {
          fullName: "Test Member",
          phone: "+919999000001",
          addressLine1: "123 Test St",
          city: "Mumbai",
          state: "Maharashtra",
          postalCode: "400001",
          country: "India",
        },
      });

      expect(order.orderRef).toMatch(/^JMD-ORD-\d{4}-\d{6}$/);
      expect(order.status).toBe("PENDING_PAYMENT");
    });
  });

  /* ========================================================================== */
  /*  H5. docs/JAI_MAA_DURGA_INTEGRATION.md §5.2 Signing Test Vectors           */
  /* ========================================================================== */
  describe("H5. Documented Signing Test Vectors (§5.2)", () => {
    const fixedTimestampSeconds = 1767225600; // 2026-01-01T00:00:00Z

    it("matches the documented signature for validate request body exactly", () => {
      const body = '{"code":"BHAV-7K2X-9QM4-P8RT"}';
      const signed = signBhavikaRequest(body, TEST_SECRET, fixedTimestampSeconds);

      expect(signed.timestamp).toBe("1767225600");
      expect(signed.signature).toBe("aLn9DjVNP8kFhaRIA5U00nHbkngzDYZ3OuerHxjTjIM");
    });

    it("matches the documented signature for redeem request body exactly", () => {
      const body = '{"code":"BHAV-7K2X-9QM4-P8RT","externalRef":"JMD-2026-000481"}';
      const signed = signBhavikaRequest(body, TEST_SECRET, fixedTimestampSeconds);

      expect(signed.timestamp).toBe("1767225600");
      expect(signed.signature).toBe("b0Ho91UecJC6w3BfTMzFGadapA0VNGJcbKTAGRCTFTw");
    });
  });

  /* ========================================================================== */
  /*  H6. Bhavika Signed Request Security Guard (requireSignedStoreRequest)    */
  /* ========================================================================== */
  describe("H6. Bhavika Signed Request Security Guard", () => {
    beforeAll(async () => {
      (env as Record<string, unknown>).JMD_INTEGRATION_SECRET = TEST_SECRET;
    });

    it("accepts a correctly signed and timely store request", async () => {
      const body = JSON.stringify({ code: "BHAV-7K2X-9QM4-P8RT" });
      const nowSeconds = Math.floor(Date.now() / 1000);
      const { timestamp, signature } = signBhavikaRequest(body, TEST_SECRET, nowSeconds);

      const req = new Request("http://localhost/api/integration/coupons/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jmd-timestamp": timestamp,
          "x-jmd-signature": signature,
        },
        body,
      });

      const verified = await requireSignedStoreRequest(req);
      expect(verified.raw).toBe(body);
      expect((verified.body as { code: string }).code).toBe("BHAV-7K2X-9QM4-P8RT");
    });

    it("rejects forged or altered signatures with BAD_SIGNATURE", async () => {
      const body = JSON.stringify({ code: "BHAV-7K2X-9QM4-P8RT" });
      const nowSeconds = Math.floor(Date.now() / 1000);
      const { timestamp } = signBhavikaRequest(body, TEST_SECRET, nowSeconds);

      const req = new Request("http://localhost/api/integration/coupons/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jmd-timestamp": timestamp,
          "x-jmd-signature": "forged_signature_xyz_123",
        },
        body,
      });

      await expect(requireSignedStoreRequest(req)).rejects.toMatchObject({
        code: "BAD_SIGNATURE",
        status: 401,
      });
    });

    it("rejects stale requests (> 300s clock skew) with STALE_REQUEST", async () => {
      const body = JSON.stringify({ code: "BHAV-7K2X-9QM4-P8RT" });
      const staleTimestamp = Math.floor(Date.now() / 1000) - 350;
      const { timestamp, signature } = signBhavikaRequest(body, TEST_SECRET, staleTimestamp);

      const req = new Request("http://localhost/api/integration/coupons/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jmd-timestamp": timestamp,
          "x-jmd-signature": signature,
        },
        body,
      });

      await expect(requireSignedStoreRequest(req)).rejects.toMatchObject({
        code: "STALE_REQUEST",
        status: 401,
      });
    });

    it("rejects requests missing signature headers with MISSING_SIGNATURE", async () => {
      const body = JSON.stringify({ code: "BHAV-7K2X-9QM4-P8RT" });
      const req = new Request("http://localhost/api/integration/coupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      await expect(requireSignedStoreRequest(req)).rejects.toMatchObject({
        code: "MISSING_SIGNATURE",
        status: 401,
      });
    });

    it("returns NOT_CONFIGURED (503) when JMD_INTEGRATION_SECRET is unset", async () => {
      const saved = env.JMD_INTEGRATION_SECRET;
      delete (env as Record<string, unknown>).JMD_INTEGRATION_SECRET;

      try {
        const body = JSON.stringify({ code: "BHAV-7K2X-9QM4-P8RT" });
        const nowSeconds = Math.floor(Date.now() / 1000);
        const { timestamp, signature } = signBhavikaRequest(body, TEST_SECRET, nowSeconds);

        const req = new Request("http://localhost/api/integration/coupons/validate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-jmd-timestamp": timestamp,
            "x-jmd-signature": signature,
          },
          body,
        });

        await expect(requireSignedStoreRequest(req)).rejects.toMatchObject({
          code: "NOT_CONFIGURED",
          status: 503,
        });
      } finally {
        (env as Record<string, unknown>).JMD_INTEGRATION_SECRET = saved;
      }
    });
  });

  /* ========================================================================== */
  /*  H7. Rate Limit Semantics & Anti-Enumeration (4x Penalty)                  */
  /* ========================================================================== */
  describe("H7. Rate Limit Semantics & Anti-Enumeration (4x Penalty)", () => {
    it("charges 4x rate limit cost for unknown codes and respects configured bucket limit", async () => {
      const bucket = STORE_API_RATE.validate; // { limit: 60, windowSeconds: 60, unknownCodeCost: 4 }
      expect(bucket.limit).toBe(60);
      expect(STORE_API_RATE.unknownCodeCost).toBe(4);

      const testCallerKey = `test-anti-enum-${Date.now()}`;

      // In a 60-unit bucket, each unknown code costs: 1 (entry) + 3 (chargeUnknownCode) = 4 units.
      // 15 unknown lookups consume exactly 15 * 4 = 60 units.
      for (let i = 0; i < 15; i++) {
        // Initial request cost
        const entry = await rateLimit(testCallerKey, bucket.limit, bucket.windowSeconds);
        expect(entry.success).toBe(true);

        // Anti-enumeration charge
        await chargeUnknownCode(testCallerKey, bucket);
      }

      // The 16th lookup exceeds 60 units and must be rejected with rate limit failure
      const blocked = await rateLimit(testCallerKey, bucket.limit, bucket.windowSeconds);
      expect(blocked.success).toBe(false);
      expect(blocked.reset).toBeGreaterThan(Date.now());
    });
  });

  /* ========================================================================== */
  /*  H8. Authoritative Redemption & Idempotency Handshake                      */
  /* ========================================================================== */
  describe("H8. Authoritative Redemption & Idempotency Handshake", () => {
    let testCouponCode: string;
    const testOrderRef = "JMD-2026-H-ORD-01";

    beforeEach(async () => {
      // Enable Bhavika redemption
      await SystemSettings.findOneAndUpdate(
        { singleton: "global" },
        { $set: { "integration.redemptionEnabled": true } },
        { upsert: true, new: true },
      );

      const user = await makeUser();
      await creditPoints({
        userId: user._id,
        source: PointSource.QUIZ,
        points: 5000,
        referenceType: "Test",
        description: "H8 seed points",
        idempotencyKey: `h8-seed-${Date.now()}:${user._id}`,
      });

      const coupon = await issueCoupon(user._id.toString(), 5000);
      testCouponCode = coupon.code;
    });

    it("validates an active coupon advisory status", async () => {
      const validation = await validateCoupon(testCouponCode);
      expect(validation.valid).toBe(true);
      expect(validation.coupon?.valueRupees).toBe(500);
      expect(validation.coupon?.status).toBe("ACTIVE");
    });

    it("authoritatively redeems an active coupon against an order reference exactly once", async () => {
      const redeemed = await redeemCoupon(testCouponCode, testOrderRef);
      expect(redeemed.code).toBe(testCouponCode);
      expect(redeemed.valueRupees).toBe(500);
      expect(redeemed.externalRef).toBe(testOrderRef);

      const stored = await Coupon.findOne({ code: testCouponCode });
      expect(stored?.status).toBe("REDEEMED");
      expect(stored?.externalRef).toBe(testOrderRef);
    });

    it("handles same-order retry idempotently: returns replay=true, while different-order is rejected", async () => {
      // Helper simulating route-level idempotency handling
      async function executeRedeem(code: string, externalRef: string) {
        try {
          const coupon = await redeemCoupon(code, externalRef);
          return { redeemed: true, replay: false, coupon };
        } catch (err) {
          if (err instanceof DomainError && err.code === "ALREADY_REDEEMED") {
            const existing = await getCouponByCode(code);
            if (
              existing &&
              existing.status === CouponStatus.REDEEMED &&
              existing.externalRef === externalRef
            ) {
              return { redeemed: true, replay: true, coupon: existing };
            }
          }
          throw err;
        }
      }

      // 1. Initial authoritative redemption
      const first = await executeRedeem(testCouponCode, testOrderRef);
      expect(first.redeemed).toBe(true);
      expect(first.replay).toBe(false);

      // 2. Same-order idempotent replay
      const retry = await executeRedeem(testCouponCode, testOrderRef);
      expect(retry.redeemed).toBe(true);
      expect(retry.replay).toBe(true);
      expect(retry.coupon.externalRef).toBe(testOrderRef);

      // 3. Different-order redemption of the same coupon is strictly rejected
      const differentOrderRef = "JMD-2026-H-DIFFERENT-ORDER-99";
      await expect(
        executeRedeem(testCouponCode, differentOrderRef),
      ).rejects.toMatchObject({
        code: "ALREADY_REDEEMED",
      });
    });
  });

  /* ========================================================================== */
  /*  H9. Store Client Timeout Resilience & Safe Recovery                      */
  /* ========================================================================== */
  describe("H9. Store Client Timeout Resilience & Safe Recovery", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("recovers safely when redeem call times out and is subsequently retried with same orderRef", async () => {
      process.env.BHAVIKA_API_BASE = "http://localhost:3000";
      process.env.BHAVIKA_INTEGRATION_SECRET = TEST_SECRET;

      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: simulated gateway / network timeout
          throw new Error("ETIMEDOUT: Connection timed out");
        }
        // Attempt 2: retry succeeds with replay flag from server
        return new Response(
          JSON.stringify({
            redeemed: true,
            replay: true,
            code: "BHAV-7K2X-9QM4-P8RT",
            valueRupees: 500,
            currency: "INR",
            externalRef: "JMD-TIMEOUT-RETRY-01",
            redeemedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      });

      // Attempt 1 fails
      const attempt1 = await redeemBhavikaCoupon("BHAV-7K2X-9QM4-P8RT", "JMD-TIMEOUT-RETRY-01");
      expect(attempt1.success).toBe(false);
      expect(attempt1.error).toContain("ETIMEDOUT");

      // Attempt 2 retries with exact same order reference and recovers cleanly
      const attempt2 = await redeemBhavikaCoupon("BHAV-7K2X-9QM4-P8RT", "JMD-TIMEOUT-RETRY-01");
      expect(attempt2.success).toBe(true);
      expect(attempt2.isReplay).toBe(true);
      expect(attempt2.externalRef).toBe("JMD-TIMEOUT-RETRY-01");
    });
  });
});
