import { describe, it, expect, beforeAll } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { getOrCreateStoreWallet, mutateStoreWallet } from "@/server/store/services/wallet-ledger.service";
import {
  submitRechargeOrder,
  reconcilePendingRecharges,
  reverseRechargeOrder,
  calculateRechargeCommission,
  listMemberRecharges,
} from "@/server/store/services/recharge.service";
import {
  MockRechargeProvider,
  setMockNextOutcome,
  updateMockRecordStatus,
} from "@/server/store/services/recharge-provider";
import {
  RechargeStatus,
  RechargeCommissionStatus,
  RechargeServiceType,
} from "@/server/store/models/StoreRechargeOrder";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase E — Recharge Engine, Provider Seam & Async Reconciliation", () => {
  let freeMember: RegisteredMember;
  let areaMember: RegisteredMember;
  let chiefMember: RegisteredMember;

  beforeAll(async () => {
    // 1. Create Free Member
    freeMember = await registerStoreMember({
      name: "Recharge Free Member",
      phone: "9876545001",
      password: "password123",
      email: "rchfree@test.dev",
    });

    // 2. Create Area Member
    areaMember = await registerStoreMember({
      name: "Recharge Area Member",
      phone: "9876545002",
      password: "password123",
      email: "rcharea@test.dev",
    });

    // 3. Create Chief Member
    chiefMember = await registerStoreMember({
      name: "Recharge Chief Member",
      phone: "9876545003",
      password: "password123",
      email: "rchchief@test.dev",
    });

    const db = await getStoreDb();
    const Member = getStoreMemberModel(db);
    await Member.findByIdAndUpdate(areaMember._id, { tier: "AREA" });
    await Member.findByIdAndUpdate(chiefMember._id, { tier: "CHIEF" });

    // Fund wallets with test balances
    for (const m of [freeMember, areaMember, chiefMember]) {
      await mutateStoreWallet({
        memberId: m._id,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 100000, // ₹1,000.00
        referenceType: "ADMIN_CORRECTION",
        referenceId: `init-fund-${m._id}`,
        idempotencyKey: `init-fund-${m._id}`,
        description: "Initial test recharge balance",
      });
    }
  });

  describe("Commission Formula Safeguards", () => {
    it("calculates Free tier commission as 40% capped at ₹2.00 (200 paise)", () => {
      // Small provider payout: 100 paise -> 40% = 40 paise
      expect(calculateRechargeCommission("FREE", 100)).toBe(40);
      // Payout 400 paise -> 40% = 160 paise (below cap)
      expect(calculateRechargeCommission("FREE", 400)).toBe(160);
      // Large payout 1000 paise -> 40% = 400 paise -> capped at 200 paise
      expect(calculateRechargeCommission("FREE", 1000)).toBe(200);
      // Very large payout 5000 paise -> capped at 200 paise
      expect(calculateRechargeCommission("FREE", 5000)).toBe(200);
    });

    it("calculates Area tier commission as 60% of provider payout uncapped", () => {
      expect(calculateRechargeCommission("AREA", 100)).toBe(60);
      expect(calculateRechargeCommission("AREA", 500)).toBe(300);
      expect(calculateRechargeCommission("AREA", 1000)).toBe(600);
    });

    it("calculates Chief tier commission as 80% of provider payout uncapped", () => {
      expect(calculateRechargeCommission("CHIEF", 100)).toBe(80);
      expect(calculateRechargeCommission("CHIEF", 500)).toBe(400);
      expect(calculateRechargeCommission("CHIEF", 1000)).toBe(800);
    });

    it("returns 0 commission if provider payout is zero or negative", () => {
      expect(calculateRechargeCommission("FREE", 0)).toBe(0);
      expect(calculateRechargeCommission("AREA", -50)).toBe(0);
      expect(calculateRechargeCommission("CHIEF", 0)).toBe(0);
    });
  });

  describe("Service Catalogue & Provider Seam", () => {
    const provider = new MockRechargeProvider();

    it("supports all 6 required utility services", async () => {
      const services: RechargeServiceType[] = [
        "MOBILE_PREPAID",
        "DTH",
        "FASTAG",
        "ELECTRICITY",
        "GAS",
        "WATER",
      ];

      for (const service of services) {
        const operators = await provider.fetchOperators(service);
        expect(operators.length).toBeGreaterThan(0);
        expect(operators[0].serviceType).toBe(service);
      }
    });

    it("fetches plans with valid tariff categories and rupee amounts", async () => {
      const plans = await provider.fetchPlans("JIO");
      expect(plans.length).toBeGreaterThan(0);
      const sample = plans[0];
      expect(sample.amountRupees).toBeGreaterThan(0);
      expect(sample.amountPaise).toBe(sample.amountRupees * 100);
      expect(sample.category).toBeDefined();
    });

    it("enforces security check preventing mock provider in production without explicit opt-in", () => {
      const origEnv = process.env.NODE_ENV;
      const origAllow = process.env.ALLOW_MOCK_RECHARGE;
      const envObj = process.env as Record<string, string | undefined>;
      try {
        envObj.NODE_ENV = "production";
        delete process.env.ALLOW_MOCK_RECHARGE;
        expect(() => new MockRechargeProvider()).toThrow(/not permitted in production/);
      } finally {
        envObj.NODE_ENV = origEnv;
        if (origAllow !== undefined) {
          process.env.ALLOW_MOCK_RECHARGE = origAllow;
        } else {
          delete process.env.ALLOW_MOCK_RECHARGE;
        }
      }
    });
  });

  describe("Recharge Order Submission & Immediate Outcomes", () => {
    it("successfully completes recharge when provider confirms immediately", async () => {
      setMockNextOutcome("SUCCESS");

      const wBefore = await getOrCreateStoreWallet(freeMember._id);
      const balanceBefore = wBefore.addMoneyPaise;
      const rechargeBalanceBefore = wBefore.rechargePaise;

      const result = await submitRechargeOrder({
        memberId: freeMember._id,
        serviceType: "MOBILE_PREPAID",
        operator: "JIO",
        consumerNumber: "9876543210",
        amountPaise: 29900, // ₹299
      });

      expect(result.status).toBe(RechargeStatus.SUCCESS);
      expect(result.order.status).toBe(RechargeStatus.SUCCESS);
      expect(result.order.commissionStatus).toBe(RechargeCommissionStatus.CREDITED);
      expect(result.memberCommissionPaise).toBeGreaterThan(0);

      // Verify principal debited from ADD_MONEY wallet
      const wAfter = await getOrCreateStoreWallet(freeMember._id);
      expect(wAfter.addMoneyPaise).toBe(balanceBefore - 29900);

      // Verify commission credited to RECHARGE wallet
      expect(wAfter.rechargePaise).toBe(rechargeBalanceBefore + result.memberCommissionPaise);
    });

    it("rejects recharge when member has insufficient wallet balance without creating order", async () => {
      await expect(
        submitRechargeOrder({
          memberId: freeMember._id,
          serviceType: "MOBILE_PREPAID",
          operator: "AIRTEL",
          consumerNumber: "9988776655",
          amountPaise: 99999999, // ₹999,999.99 (exceeds balance)
        }),
      ).rejects.toThrow(/Insufficient balance/i);
    });

    it("refunds principal immediately when provider rejects recharge upon submission", async () => {
      setMockNextOutcome("FAILED");

      const wBefore = await getOrCreateStoreWallet(freeMember._id);
      const balanceBefore = wBefore.addMoneyPaise;
      const rechargeBalanceBefore = wBefore.rechargePaise;

      const result = await submitRechargeOrder({
        memberId: freeMember._id,
        serviceType: "DTH",
        operator: "TATAPLAY",
        consumerNumber: "1002003004",
        amountPaise: 50000, // ₹500
      });

      expect(result.status).toBe(RechargeStatus.FAILED);
      expect(result.order.status).toBe(RechargeStatus.FAILED);
      expect(result.order.commissionStatus).toBe(RechargeCommissionStatus.NONE);
      expect(result.memberCommissionPaise).toBe(0);

      // Verify net balance in ADD_MONEY wallet is unchanged (debit + immediate refund)
      const wAfter = await getOrCreateStoreWallet(freeMember._id);
      expect(wAfter.addMoneyPaise).toBe(balanceBefore);
      expect(wAfter.rechargePaise).toBe(rechargeBalanceBefore);
    });
  });

  describe("Asynchronous Pending & Reconciliation Sweep", () => {
    it("holds commission at 0 while recharge is PENDING_CONFIRMATION", async () => {
      setMockNextOutcome("PENDING");

      const wBefore = await getOrCreateStoreWallet(areaMember._id);
      const balanceBefore = wBefore.addMoneyPaise;
      const rechargeBalanceBefore = wBefore.rechargePaise;

      const result = await submitRechargeOrder({
        memberId: areaMember._id,
        serviceType: "ELECTRICITY",
        operator: "BESCOM",
        consumerNumber: "BESCOM123456",
        amountPaise: 50000, // ₹500
      });

      expect(result.status).toBe(RechargeStatus.PENDING_CONFIRMATION);
      expect(result.order.status).toBe(RechargeStatus.PENDING_CONFIRMATION);
      expect(result.order.commissionStatus).toBe(RechargeCommissionStatus.NONE);
      expect(result.memberCommissionPaise).toBe(0);

      // Principal debited
      const wAfter = await getOrCreateStoreWallet(areaMember._id);
      expect(wAfter.addMoneyPaise).toBe(balanceBefore - 50000);
      // No commission credited yet
      expect(wAfter.rechargePaise).toBe(rechargeBalanceBefore);
    });

    it("credits commission upon reconciliation sweep when pending order succeeds", async () => {
      setMockNextOutcome("PENDING");

      const result = await submitRechargeOrder({
        memberId: chiefMember._id,
        serviceType: "FASTAG",
        operator: "ICICI_FASTAG",
        consumerNumber: "DL01AB1234",
        amountPaise: 50000, // ₹500
      });

      expect(result.status).toBe(RechargeStatus.PENDING_CONFIRMATION);
      const providerRef = result.order.providerRef!;
      expect(providerRef).toBeDefined();

      const wBeforeReconcile = await getOrCreateStoreWallet(chiefMember._id);
      const rechargeBalanceBefore = wBeforeReconcile.rechargePaise;

      // Mock provider now reports success
      updateMockRecordStatus(providerRef, "SUCCESS");

      // Run reconciliation sweep
      const sweep = await reconcilePendingRecharges();
      expect(sweep.reconciledCount).toBeGreaterThanOrEqual(1);
      expect(sweep.successCount).toBeGreaterThanOrEqual(1);

      // Verify commission is now credited to Chief member's recharge wallet (80% rate)
      const wAfterReconcile = await getOrCreateStoreWallet(chiefMember._id);
      expect(wAfterReconcile.rechargePaise).toBeGreaterThan(rechargeBalanceBefore);
    });

    it("refunds principal upon reconciliation sweep when pending order fails", async () => {
      setMockNextOutcome("PENDING");

      const wBefore = await getOrCreateStoreWallet(areaMember._id);
      const balanceBefore = wBefore.addMoneyPaise;

      const result = await submitRechargeOrder({
        memberId: areaMember._id,
        serviceType: "GAS",
        operator: "IGL",
        consumerNumber: "IGL998877",
        amountPaise: 30000, // ₹300
      });

      expect(result.status).toBe(RechargeStatus.PENDING_CONFIRMATION);
      const providerRef = result.order.providerRef!;

      // Mock provider reports failure during sweep
      updateMockRecordStatus(providerRef, "FAILED", "Operator billing server timed out");

      const sweep = await reconcilePendingRecharges();
      expect(sweep.failureCount).toBeGreaterThanOrEqual(1);

      // Verify principal was refunded back to member's ADD_MONEY wallet
      const wAfterReconcile = await getOrCreateStoreWallet(areaMember._id);
      expect(wAfterReconcile.addMoneyPaise).toBe(balanceBefore);
    });
  });

  describe("Compensating Ledger Reversals", () => {
    it("debits awarded commission and refunds principal on late reversal", async () => {
      setMockNextOutcome("SUCCESS");

      const result = await submitRechargeOrder({
        memberId: freeMember._id,
        serviceType: "WATER",
        operator: "DELHI_JAL_BOARD",
        consumerNumber: "DJB-445566",
        amountPaise: 40000, // ₹400
      });

      expect(result.status).toBe(RechargeStatus.SUCCESS);
      const initialCommission = result.memberCommissionPaise;
      expect(initialCommission).toBeGreaterThan(0);

      const wBeforeRev = await getOrCreateStoreWallet(freeMember._id);
      const balanceBeforeRev = wBeforeRev.addMoneyPaise;
      const rechargeBeforeRev = wBeforeRev.rechargePaise;

      // Late reversal triggered by operator/admin
      const reversedOrder = await reverseRechargeOrder({
        rechargeRef: result.order.rechargeRef,
        reason: "Consumer complaint: Payment not updated at water board",
      });

      expect(reversedOrder.status).toBe(RechargeStatus.REVERSED);
      expect(reversedOrder.commissionStatus).toBe(RechargeCommissionStatus.REVERSED);

      const wAfterRev = await getOrCreateStoreWallet(freeMember._id);

      // Principal ₹400 refunded back to ADD_MONEY wallet
      expect(wAfterRev.addMoneyPaise).toBe(balanceBeforeRev + 40000);

      // Commission debited back from RECHARGE wallet
      expect(wAfterRev.rechargePaise).toBe(rechargeBeforeRev - initialCommission);
    });

    it("is idempotent when reverseRechargeOrder is called repeatedly", async () => {
      setMockNextOutcome("SUCCESS");

      const result = await submitRechargeOrder({
        memberId: freeMember._id,
        serviceType: "MOBILE_PREPAID",
        operator: "VI",
        consumerNumber: "9123456780",
        amountPaise: 19900,
      });

      await reverseRechargeOrder({
        rechargeRef: result.order.rechargeRef,
        reason: "Idempotency test reversal",
      });

      const wAfterFirst = await getOrCreateStoreWallet(freeMember._id);

      // Call reversal second time
      const secondCall = await reverseRechargeOrder({
        rechargeRef: result.order.rechargeRef,
        reason: "Duplicate reversal attempt",
      });

      expect(secondCall.status).toBe(RechargeStatus.REVERSED);

      const wAfterSecond = await getOrCreateStoreWallet(freeMember._id);
      // Wallets must not be mutated a second time
      expect(wAfterSecond.addMoneyPaise).toBe(wAfterFirst.addMoneyPaise);
      expect(wAfterSecond.rechargePaise).toBe(wAfterFirst.rechargePaise);
    });
  });

  describe("Member Audit History", () => {
    it("returns complete history of member's recharge orders", async () => {
      const history = await listMemberRecharges(freeMember._id);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].rechargeRef).toMatch(/^JMD-RCH-\d{4}-[A-Z0-9]+$/);
    });
  });
});
