import { describe, it, expect, beforeAll } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { getStoreWalletModel } from "@/server/store/models/StoreWallet";
import {
  issueStoreCoupon,
  validateStoreCoupon,
  redeemStoreCoupon,
  restoreStoreCoupon,
  listMemberStoreCoupons,
} from "@/server/store/services/store-coupon.service";
import {
  StoreCouponSource,
  StoreCouponStatus,
} from "@/server/store/models/StoreCoupon";
import {
  accrueOrderPoints,
  convertPointsToStoreCoupon,
  getMemberPointsStatus,
  updatePointsConfig,
} from "@/server/store/services/points.service";
import {
  processStoreReferralReward,
  getMemberSponsorTree,
  updateReferralConfig,
} from "@/server/store/services/referral.service";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase D — Coupons, Points, Referrals & Sponsor Tree", () => {
  let freeSponsor: RegisteredMember;
  let paidSponsor: RegisteredMember;
  let memberAlice: RegisteredMember;
  let memberBob: RegisteredMember;

  beforeAll(async () => {
    // 1. Create Free Sponsor
    freeSponsor = await registerStoreMember({
      name: "Free Sponsor",
      phone: "9876544001",
      password: "password123",
      email: "freesponsor@test.dev",
    });

    // 2. Create Paid Sponsor (promoted to AREA)
    paidSponsor = await registerStoreMember({
      name: "Paid Area Sponsor",
      phone: "9876544002",
      password: "password123",
      email: "paidsponsor@test.dev",
    });

    const db = await getStoreDb();
    const Member = getStoreMemberModel(db);
    await Member.findByIdAndUpdate(paidSponsor._id, { tier: "AREA" });

    // 3. Create Member Alice (sponsored by freeSponsor)
    memberAlice = await registerStoreMember({
      name: "Alice Downline",
      phone: "9876544003",
      password: "password123",
      email: "alice@test.dev",
      sponsorId: freeSponsor.memberId,
    });

    // 4. Create Member Bob (sponsored by paidSponsor)
    memberBob = await registerStoreMember({
      name: "Bob Downline",
      phone: "9876544004",
      password: "password123",
      email: "bob@test.dev",
      sponsorId: paidSponsor.memberId,
    });
  });

  describe("D1. Native Store Coupon Generation Across All 5 Sources", () => {
    it("generates a coupon from ORDER_PURCHASE and increments couponWalletPaise", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberAlice._id.toString(),
        faceValuePaise: 5000, // ₹50
        source: StoreCouponSource.ORDER_PURCHASE,
        sourceRef: "JMD-ORD-D001",
      });

      expect(coupon.couponCode).toMatch(/^JMD-CPN-/);
      expect(coupon.source).toBe(StoreCouponSource.ORDER_PURCHASE);
      expect(coupon.faceValuePaise).toBe(5000);
      expect(coupon.status).toBe(StoreCouponStatus.ACTIVE);
      expect(coupon.isEligibleForDraw).toBe(true);

      const db = await getStoreDb();
      const Wallet = getStoreWalletModel(db);
      const wallet = await Wallet.findOne({ member: memberAlice._id });
      expect(wallet?.couponWalletPaise).toBe(5000);
    });

    it("generates a coupon from POINTS_CONVERSION stamped with source", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberAlice._id.toString(),
        faceValuePaise: 50000, // ₹500
        source: StoreCouponSource.POINTS_CONVERSION,
        sourceRef: "points-trans-01",
      });

      expect(coupon.source).toBe(StoreCouponSource.POINTS_CONVERSION);
      expect(coupon.faceValuePaise).toBe(50000);
    });

    it("generates a coupon from EMI_INSTALMENT stamped with source", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberAlice._id.toString(),
        faceValuePaise: 100000, // ₹1,000
        source: StoreCouponSource.EMI_INSTALMENT,
        sourceRef: "emi-inst-01",
      });

      expect(coupon.source).toBe(StoreCouponSource.EMI_INSTALMENT);
      expect(coupon.isEligibleForDraw).toBe(true);
    });

    it("generates a coupon from ADMIN_GRANT stamped with source and metadata", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberAlice._id.toString(),
        faceValuePaise: 25000, // ₹250
        source: StoreCouponSource.ADMIN_GRANT,
        sourceRef: "admin-action-01",
        metadata: { reason: "Goodwill customer compensation" },
      });

      expect(coupon.source).toBe(StoreCouponSource.ADMIN_GRANT);
      expect(coupon.metadata?.reason).toBe("Goodwill customer compensation");
    });

    it("generates a coupon from REFERRAL_REWARD stamped with source", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberAlice._id.toString(),
        faceValuePaise: 5000, // ₹50
        source: StoreCouponSource.REFERRAL_REWARD,
        sourceRef: "ref-link-01",
      });

      expect(coupon.source).toBe(StoreCouponSource.REFERRAL_REWARD);
    });

    it("lists all member coupons with correct status", async () => {
      const coupons = await listMemberStoreCoupons({
        memberId: memberAlice._id.toString(),
      });

      expect(coupons.length).toBeGreaterThanOrEqual(5);
      expect(coupons.some((c) => c.source === StoreCouponSource.ORDER_PURCHASE)).toBe(true);
      expect(coupons.some((c) => c.source === StoreCouponSource.POINTS_CONVERSION)).toBe(true);
    });
  });

  describe("D2. Concurrency-Safe Redemption & Double-Spend Gate", () => {
    it("validates an active coupon successfully", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberBob._id.toString(),
        faceValuePaise: 50000,
        source: StoreCouponSource.ADMIN_GRANT,
      });

      const res = await validateStoreCoupon({
        couponCode: coupon.couponCode,
        memberId: memberBob._id.toString(),
      });

      expect(res.valid).toBe(true);
      expect(res.coupon?.couponCode).toBe(coupon.couponCode);
    });

    it("prevents double-spend under concurrency: N simultaneous redemptions yield exactly 1 success", async () => {
      const singleCoupon = await issueStoreCoupon({
        memberId: memberBob._id.toString(),
        faceValuePaise: 50000,
        source: StoreCouponSource.ADMIN_GRANT,
      });

      // Launch 8 simultaneous redemption attempts with different order references
      const attempts = Array.from({ length: 8 }).map((_, idx) =>
        redeemStoreCoupon({
          couponCode: singleCoupon.couponCode,
          memberId: memberBob._id.toString(),
          orderRef: `JMD-RACE-ORD-${idx}`,
        })
          .then(() => ({ success: true, error: "" }))
          .catch((err: Error) => ({ success: false, error: err.message })),
      );

      const results = await Promise.all(attempts);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(7);
      expect(failures.every((f) => f.error.includes("already been redeemed"))).toBe(true);
    });

    it("supports idempotent re-redemption for the identical order reference", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberBob._id.toString(),
        faceValuePaise: 10000,
        source: StoreCouponSource.ORDER_PURCHASE,
      });

      const firstRes = await redeemStoreCoupon({
        couponCode: coupon.couponCode,
        memberId: memberBob._id.toString(),
        orderRef: "JMD-IDEM-001",
      });
      expect(firstRes.redeemed).toBe(true);

      // Replay with exact same orderRef
      const replayRes = await redeemStoreCoupon({
        couponCode: coupon.couponCode,
        memberId: memberBob._id.toString(),
        orderRef: "JMD-IDEM-001",
      });
      expect(replayRes.redeemed).toBe(true);
      expect(replayRes.faceValuePaise).toBe(10000);
    });

    it("restores coupon back to ACTIVE on order cancellation and restores wallet cache", async () => {
      const coupon = await issueStoreCoupon({
        memberId: memberBob._id.toString(),
        faceValuePaise: 20000,
        source: StoreCouponSource.ADMIN_GRANT,
      });

      await redeemStoreCoupon({
        couponCode: coupon.couponCode,
        memberId: memberBob._id.toString(),
        orderRef: "JMD-CANCEL-001",
      });

      const restored = await restoreStoreCoupon({
        couponCode: coupon.couponCode,
        memberId: memberBob._id.toString(),
        orderRef: "JMD-CANCEL-001",
        reason: "Customer cancelled prior to dispatch",
      });

      expect(restored.status).toBe(StoreCouponStatus.ACTIVE);
      expect(restored.redeemedOrderRef).toBeNull();
    });
  });

  describe("D3. Points Accrual & Conversion Engine", () => {
    it("accrues product points on qualifying orders based on configurable rate", async () => {
      // Spend ₹1,000 (100,000 paise). At 0.1 rate = 100 points
      const result = await accrueOrderPoints({
        memberId: memberAlice._id.toString(),
        orderRef: "JMD-POINTS-ORD-01",
        eligibleSpendPaise: 100000,
      });

      expect(result.pointsAwarded).toBe(100);

      const status = await getMemberPointsStatus(memberAlice._id.toString());
      expect(status.productPoints).toBeGreaterThanOrEqual(100);
    });

    it("rejects points conversion below the minimum redemption threshold", async () => {
      await expect(
        convertPointsToStoreCoupon({
          memberId: memberAlice._id.toString(),
          pointsToConvert: 1000, // default min is 5,000
        }),
      ).rejects.toThrow(/minimum/i);
    });

    it("atomically debits product points and issues a POINTS_CONVERSION coupon", async () => {
      // Lower min threshold for testing
      updatePointsConfig({ minPointsToRedeem: 500, stepPoints: 500, pointsToRupeeRatio: 10 });

      // Directly credit points for Alice to reach 500 points
      const db = await getStoreDb();
      const Wallet = getStoreWalletModel(db);
      await Wallet.updateOne(
        { member: memberAlice._id },
        { $set: { productPoints: 1000 } },
      );

      const result = await convertPointsToStoreCoupon({
        memberId: memberAlice._id.toString(),
        pointsToConvert: 500,
      });

      expect(result.pointsDebited).toBe(500);
      expect(result.faceValuePaise).toBe(5000); // 500 pts / 10 = ₹50 = 5,000 paise
      expect(result.coupon.source).toBe(StoreCouponSource.POINTS_CONVERSION);

      // Verify points debited
      const updatedWallet = await Wallet.findOne({ member: memberAlice._id });
      expect(updatedWallet?.productPoints).toBe(500);
    });
  });

  describe("D4. Sponsor Tree, Referrals & Wallet Segregation", () => {
    it("credits freeSponsor into freeReferralPaise wallet for introducing memberAlice", async () => {
      updateReferralConfig({
        enabled: true,
        freeReferralRewardPaise: 5000, // ₹50
        paidReferralRewardPaise: 10000, // ₹100
      });

      const result = await processStoreReferralReward({
        sponsorMemberId: freeSponsor._id.toString(),
        referredMemberId: memberAlice._id.toString(),
        eventRef: "REGISTRATION",
      });

      expect(result.rewarded).toBe(true);
      expect(result.walletType).toBe("FREE_REFERRAL");
      expect(result.amountPaise).toBe(5000);
      expect(result.isReplay).toBe(false);

      const db = await getStoreDb();
      const Wallet = getStoreWalletModel(db);
      const wallet = await Wallet.findOne({ member: freeSponsor._id });
      expect(wallet?.freeReferralPaise).toBe(5000);
      expect(wallet?.paidReferralPaise).toBe(0); // Safeguard: paid wallet remains 0
    });

    it("credits paidSponsor into paidReferralPaise wallet for introducing memberBob", async () => {
      const result = await processStoreReferralReward({
        sponsorMemberId: paidSponsor._id.toString(),
        referredMemberId: memberBob._id.toString(),
        eventRef: "REGISTRATION",
      });

      expect(result.rewarded).toBe(true);
      expect(result.walletType).toBe("PAID_REFERRAL");
      expect(result.amountPaise).toBe(10000);

      const db = await getStoreDb();
      const Wallet = getStoreWalletModel(db);
      const wallet = await Wallet.findOne({ member: paidSponsor._id });
      expect(wallet?.paidReferralPaise).toBe(10000);
    });

    it("guarantees exactly-once referral reward: duplicate event returns replay without double crediting", async () => {
      const db = await getStoreDb();
      const Wallet = getStoreWalletModel(db);
      const beforeWallet = await Wallet.findOne({ member: freeSponsor._id });

      const duplicateRes = await processStoreReferralReward({
        sponsorMemberId: freeSponsor._id.toString(),
        referredMemberId: memberAlice._id.toString(),
      });

      expect(duplicateRes.rewarded).toBe(true);
      expect(duplicateRes.isReplay).toBe(true);

      const afterWallet = await Wallet.findOne({ member: freeSponsor._id });
      expect(afterWallet?.freeReferralPaise).toBe(beforeWallet?.freeReferralPaise);
    });

    it("returns accurate sponsor tree and downline hierarchy for a member", async () => {
      const tree = await getMemberSponsorTree(freeSponsor._id.toString());

      expect(tree.member.memberId).toBe(freeSponsor.memberId);
      expect(tree.summary.totalDirect).toBeGreaterThanOrEqual(1);
      expect(tree.directReferrals.some((d) => d.memberId === memberAlice.memberId)).toBe(true);
    });
  });
});
