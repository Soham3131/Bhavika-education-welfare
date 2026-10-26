import { describe, it, expect, beforeAll } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import {
  ensureDefaultMembershipPlans,
  listStoreMembershipPlans,
  updateStoreMembershipPlan,
  evaluateMemberTierQualification,
  adminChangeMemberTier,
  getMemberMembershipDetails,
} from "@/server/store/services/membership.service";
import {
  calculateOrderDirectCommission,
  settleOrderCommission,
  reverseOrderCommission,
  listCommissionLedger,
  setCommissionPayoutsEnabled,
  isCommissionPayoutsEnabled,
} from "@/server/store/services/commission.service";
import { AdminAuditLog } from "@/server/models";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { getStoreCommissionLedgerModel } from "@/server/store/models/StoreCommissionLedger";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase C — Membership Tiers & Single-Level Commission Core", () => {
  let sponsorMemberDoc: RegisteredMember;
  let buyerMemberDoc: RegisteredMember;
  let orphanBuyerDoc: RegisteredMember;

  beforeAll(async () => {
    // 1. Ensure default plans exist
    await ensureDefaultMembershipPlans();

    // 2. Register Sponsor Member
    sponsorMemberDoc = await registerStoreMember({
      name: "Sponsor Kumar",
      phone: "9876543001",
      password: "password123",
      email: "sponsor@test.dev",
    });

    // Manually promote sponsor to AREA tier so they are eligible for referral commissions
    const db = await getStoreDb();
    const Member = getStoreMemberModel(db);
    await Member.findByIdAndUpdate(sponsorMemberDoc._id, { tier: "AREA" });

    // 3. Register Downline Buyer sponsored by sponsorMemberDoc
    buyerMemberDoc = await registerStoreMember({
      name: "Buyer Sharma",
      phone: "9876543002",
      password: "password123",
      email: "buyer@test.dev",
      sponsorId: sponsorMemberDoc.memberId,
    });

    // 4. Register Orphan Buyer with no sponsor
    orphanBuyerDoc = await registerStoreMember({
      name: "Orphan Singh",
      phone: "9876543003",
      password: "password123",
      email: "orphan@test.dev",
    });
  });

  describe("C1. Membership Plans & Tier Qualification", () => {
    it("ensures default membership plans Free, Area, and Chief exist with unapproved charges disabled", async () => {
      const plans = await listStoreMembershipPlans();
      expect(plans.length).toBeGreaterThanOrEqual(3);

      const freePlan = plans.find((p) => p.tier === "FREE");
      const areaPlan = plans.find((p) => p.tier === "AREA");
      const chiefPlan = plans.find((p) => p.tier === "CHIEF");

      expect(freePlan).toBeDefined();
      expect(freePlan?.isFeeRequired).toBe(false);
      expect(freePlan?.annualFeePaise).toBe(0);

      expect(areaPlan).toBeDefined();
      expect(areaPlan?.isFeeRequired).toBe(false); // Safeguard 1: fees disabled
      expect(areaPlan?.status).toBe("DEV-CONFIRMED");

      expect(chiefPlan).toBeDefined();
      expect(chiefPlan?.status).toBe("PROPOSED");
    });

    it("allows admin to update tier configuration safely", async () => {
      const updated = await updateStoreMembershipPlan({
        tier: "AREA",
        directReferralCommissionPercentage: 6,
      });

      expect(updated.directReferralCommissionPercentage).toBe(6);

      // Revert back to 5%
      await updateStoreMembershipPlan({
        tier: "AREA",
        directReferralCommissionPercentage: 5,
      });
    });

    it("evaluates tier qualification: keeps member FREE if below threshold", async () => {
      const result = await evaluateMemberTierQualification({
        memberId: orphanBuyerDoc._id.toString(),
        orderRef: "JMD-ORD-2026-C001",
        orderAmountPaise: 50000, // Rs 500 (threshold for Area is Rs 2,000)
      });

      expect(result.upgraded).toBe(false);
      expect(result.oldTier).toBe("FREE");
      expect(result.newTier).toBe("FREE");
    });

    it("evaluates tier qualification: upgrades member to AREA when cumulative spend reaches threshold", async () => {
      // Threshold is 200,000 paise (Rs 2,000). Prior spend was 50,000. Adding 150,000 reaches 200,000.
      const result = await evaluateMemberTierQualification({
        memberId: orphanBuyerDoc._id.toString(),
        orderRef: "JMD-ORD-2026-C002",
        orderAmountPaise: 150000,
      });

      expect(result.upgraded).toBe(true);
      expect(result.oldTier).toBe("FREE");
      expect(result.newTier).toBe("AREA");

      // Verify history row was appended
      const details = await getMemberMembershipDetails(orphanBuyerDoc._id.toString());
      expect(details.member.tier).toBe("AREA");
      expect(details.history.length).toBeGreaterThanOrEqual(1);
      expect(details.history[0].transitionType).toBe("UPGRADE");
      expect(details.history[0].orderRef).toBe("JMD-ORD-2026-C002");
    });

    it("audits manual admin tier changes to both StoreMembershipHistory and AdminAuditLog", async () => {
      const fakeAdminId = "65a000000000000000000099";
      const auditBeforeCount = await AdminAuditLog.countDocuments();

      const history = await adminChangeMemberTier({
        memberId: orphanBuyerDoc._id.toString(),
        targetTier: "CHIEF",
        adminId: fakeAdminId,
        reason: "District promotional override by executive",
      });

      expect(history.fromTier).toBe("AREA");
      expect(history.toTier).toBe("CHIEF");
      expect(history.transitionType).toBe("ADMIN_OVERRIDE");

      // Verify AdminAuditLog entry
      const auditAfterCount = await AdminAuditLog.countDocuments();
      expect(auditAfterCount).toBe(auditBeforeCount + 1);

      const auditRow = await AdminAuditLog.findOne({
        action: "STORE_MEMBER_TIER_OVERRIDE",
      }).sort({ createdAt: -1 });

      expect(auditRow).toBeDefined();
      expect(auditRow?.reason).toBe("District promotional override by executive");
      expect(auditRow?.targetType).toBe("STORE_MEMBER");
    });
  });

  describe("C2. Direct-Sponsor Single-Level Commission Calculations", () => {
    it("safeguard: live commission payouts default to disabled", () => {
      expect(isCommissionPayoutsEnabled()).toBe(false);
    });

    it("generates ZERO commission when buyer has no sponsor", async () => {
      const result = await calculateOrderDirectCommission({
        orderRef: "JMD-ORD-2026-C101",
        purchasingMemberId: orphanBuyerDoc._id.toString(),
        itemsTotalPaise: 100000, // Rs 1,000
      });

      expect(result.generated).toBe(false);
      expect(result.ledgerEntry).toBeNull();
      expect(result.reason).toMatch(/no sponsor/i);
    });

    it("calculates direct sponsor commission strictly for immediate sponsor at level 1", async () => {
      // BuyerSharma (sponsored by SponsorKumar who is AREA tier @ 5%)
      const itemsTotalPaise = 200000; // Rs 2,000
      const couponDiscountPaise = 20000; // Rs 200 discount
      // Eligible base = 180,000 paise (Rs 1,800)
      // 5% of 180,000 = 9,000 paise (Rs 90)

      const result = await calculateOrderDirectCommission({
        orderRef: "JMD-ORD-2026-C102",
        purchasingMemberId: buyerMemberDoc._id.toString(),
        itemsTotalPaise,
        couponDiscountPaise,
      });

      expect(result.generated).toBe(true);
      expect(result.isReplay).toBe(false);
      expect(result.ledgerEntry).toBeDefined();

      const entry = result.ledgerEntry!;
      expect(entry.level).toBe(1); // Safeguard: strictly 1
      expect(entry.eligibleBasePaise).toBe(180000);
      expect(entry.commissionRatePercentage).toBe(5);
      expect(entry.commissionAmountPaise).toBe(9000);
      expect(entry.status).toBe("PENDING");
      expect(entry.type).toBe("SALE_DIRECT");
    });

    it("enforces idempotency: duplicate calculation calls return existing row without duplication", async () => {
      const result = await calculateOrderDirectCommission({
        orderRef: "JMD-ORD-2026-C102",
        purchasingMemberId: buyerMemberDoc._id.toString(),
        itemsTotalPaise: 200000,
        couponDiscountPaise: 20000,
      });

      expect(result.generated).toBe(true);
      expect(result.isReplay).toBe(true);
      expect(result.ledgerEntry?.commissionAmountPaise).toBe(9000);

      // Verify database has exactly 1 row for this order
      const entries = await listCommissionLedger({ orderRef: "JMD-ORD-2026-C102" });
      expect(entries.length).toBe(1);
    });

    it("settles commission to PAYABLE when live payouts are disabled (audit mode)", async () => {
      setCommissionPayoutsEnabled(false);

      const settleRes = await settleOrderCommission("JMD-ORD-2026-C102");
      expect(settleRes.settled).toBe(true);
      expect(settleRes.ledgerEntry?.status).toBe("PAYABLE");

      // Idempotent settlement call
      const repeatSettle = await settleOrderCommission("JMD-ORD-2026-C102");
      expect(repeatSettle.settled).toBe(true);
      expect(repeatSettle.ledgerEntry?.status).toBe("PAYABLE");
    });

    it("cancels PENDING commission cleanly on order cancellation", async () => {
      // Create a fresh order commission
      const result = await calculateOrderDirectCommission({
        orderRef: "JMD-ORD-2026-C103",
        purchasingMemberId: buyerMemberDoc._id.toString(),
        itemsTotalPaise: 100000,
      });
      expect(result.generated).toBe(true);

      const reverseRes = await reverseOrderCommission({
        orderRef: "JMD-ORD-2026-C103",
        reason: "Customer cancelled before dispatch",
      });

      expect(reverseRes.reversed).toBe(true);
      expect(reverseRes.reversalEntry?.status).toBe("CANCELLED");
      expect(reverseRes.reversalEntry?.reversalReason).toBe("Customer cancelled before dispatch");
    });

    it("reverses settled commission with compensating SALE_REVERSAL row without editing history", async () => {
      // JMD-ORD-2026-C102 was already settled (PAYABLE)
      const reverseRes = await reverseOrderCommission({
        orderRef: "JMD-ORD-2026-C102",
        reason: "Order returned by customer",
      });

      expect(reverseRes.reversed).toBe(true);
      expect(reverseRes.reversalEntry).toBeDefined();

      const reversal = reverseRes.reversalEntry!;
      expect(reversal.type).toBe("SALE_REVERSAL");
      expect(reversal.status).toBe("REVERSED");
      expect(reversal.commissionAmountPaise).toBe(9000);
      expect(reversal.originalCommissionId).toBeDefined();

      // Verify that original entry is preserved in DB and a new compensating row exists
      const db = await getStoreDb();
      const CommissionLedger = getStoreCommissionLedgerModel(db);

      const allEntries = await CommissionLedger.find({ orderRef: "JMD-ORD-2026-C102" }).sort({ createdAt: 1 });
      expect(allEntries.length).toBe(2);
      expect(allEntries[0].type).toBe("SALE_DIRECT");
      expect(allEntries[0].status).toBe("REVERSED");
      expect(allEntries[1].type).toBe("SALE_REVERSAL");
      expect(allEntries[1].originalCommissionId?.toString()).toBe(allEntries[0]._id.toString());
    });

    it("strictly prevents multi-level commission traversal (anti-MLM safeguard)", async () => {
      // Verify schema validator rejects any level other than 1
      const db = await getStoreDb();
      const CommissionLedger = getStoreCommissionLedgerModel(db);

      await expect(
        CommissionLedger.create({
          memberId: sponsorMemberDoc._id,
          sourceMemberId: buyerMemberDoc._id,
          orderRef: "ILLEGAL_MLM_ORD",
          idempotencyKey: "comm:illegal:01",
          type: "SALE_DIRECT",
          status: "PENDING",
          level: 2, // Multi-level upline attempt
          eligibleBasePaise: 100000,
          commissionRatePercentage: 5,
          commissionAmountPaise: 5000,
        }),
      ).rejects.toThrow(/Commission level must strictly be 1/i);
    });
  });
});
