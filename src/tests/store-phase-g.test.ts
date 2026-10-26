import { describe, it, expect, beforeAll } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { mutateStoreWallet } from "@/server/store/services/wallet-ledger.service";
import {
  createEmiSchedule,
  payEmiInstalment,
  applyWinnerStopsEmi,
  requestEmiCancellation,
  approveEmiCancellation,
} from "@/server/store/services/emi.service";
import {
  purchasePin,
  transferPin,
  activateMemberWithPin,
} from "@/server/store/services/pin.service";
import {
  calculateJewelleryPrice,
  updateBullionRates,
  getBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import { transferStoreCoupon } from "@/server/store/services/coupon-transfer.service";
import { issueStoreCoupon } from "@/server/store/services/store-coupon.service";
import { StoreCouponSource, StoreCouponStatus } from "@/server/store/models/StoreCoupon";
import { EmiStatus, InstalmentStatus } from "@/server/store/models/StoreEmiSchedule";
import { PinStatus, PinTier } from "@/server/store/models/StorePin";
import { Types } from "mongoose";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase G — Advanced Features: EMI, Winner-Stops-EMI, PINs & Jewellery Pricing", () => {
  let sponsorLead: RegisteredMember;
  let downlineMember: RegisteredMember;
  let outsideMember: RegisteredMember;
  let grandchildMember: RegisteredMember;

  beforeAll(async () => {
    // 1. Create Sponsor Lead (promoted to AREA)
    sponsorLead = await registerStoreMember({
      name: "Sponsor Leader",
      phone: "9876547001",
      password: "password123",
      email: "sponsorlead@test.dev",
    });

    const db = await getStoreDb();
    const Member = getStoreMemberModel(db);
    await Member.findByIdAndUpdate(sponsorLead._id, { tier: "AREA" });

    // 2. Create Downline Member sponsored by sponsorLead
    downlineMember = await registerStoreMember({
      name: "Downline Networker",
      phone: "9876547002",
      password: "password123",
      email: "downline7@test.dev",
      sponsorId: sponsorLead.memberId,
    });

    // 3. Create Outside Member (different network)
    outsideMember = await registerStoreMember({
      name: "Outside Member",
      phone: "9876547003",
      password: "password123",
      email: "outside7@test.dev",
    });

    // 4. Create Grandchild Member sponsored by downlineMember
    grandchildMember = await registerStoreMember({
      name: "Grandchild Downline",
      phone: "9876547004",
      password: "password123",
      email: "grandchild7@test.dev",
      sponsorId: downlineMember.memberId,
    });

    // Fund wallets
    for (const m of [sponsorLead, downlineMember, outsideMember, grandchildMember]) {
      await mutateStoreWallet({
        memberId: m._id,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 5000000, // ₹50,000.00
        referenceType: "ADMIN_CORRECTION",
        referenceId: `fund-g-${m._id}`,
        idempotencyKey: `fund-g-${m._id}`,
        description: "Initial test funding for Phase G",
      });
    }
  });

  describe("EMI Schedules & Instalments", () => {
    it("creates an EMI schedule and pays instalments with reward coupons", async () => {
      const emi = await createEmiSchedule({
        orderId: new Types.ObjectId(),
        memberId: downlineMember._id,
        orderRef: "JMD-ORD-EMI-001",
        totalPrincipalPaise: 300000, // ₹3,000
        totalInstalments: 3,
      });

      expect(emi.emiRef).toMatch(/^JMD-EMI-\d{4}-[A-Z0-9]+$/);
      expect(emi.status).toBe(EmiStatus.ACTIVE);
      expect(emi.instalments.length).toBe(3);
      expect(emi.monthlyAmountPaise).toBe(100000); // ₹1,000/mo

      // Pay instalment 1
      const updated = await payEmiInstalment({
        emiId: emi._id,
        instalmentNumber: 1,
        memberId: downlineMember._id,
      });

      expect(updated.paidInstalmentsCount).toBe(1);
      expect(updated.instalments[0].status).toBe(InstalmentStatus.PAID);
      expect(updated.instalments[0].couponIssuedId).toBeDefined();

      // Pay instalment 2 and 3 -> Transitions to COMPLETED
      await payEmiInstalment({
        emiId: emi._id,
        instalmentNumber: 2,
        memberId: downlineMember._id,
      });
      const completed = await payEmiInstalment({
        emiId: emi._id,
        instalmentNumber: 3,
        memberId: downlineMember._id,
      });

      expect(completed.status).toBe(EmiStatus.COMPLETED);
      expect(completed.paidInstalmentsCount).toBe(3);
    });

    it("applies the Winner-Stops-EMI rule: waives all remaining instalments upon prize victory", async () => {
      const emi = await createEmiSchedule({
        orderId: new Types.ObjectId(),
        memberId: downlineMember._id,
        orderRef: "JMD-ORD-EMI-WINNER",
        totalPrincipalPaise: 600000, // ₹6,000
        totalInstalments: 6,
      });

      // Pay instalment 1
      await payEmiInstalment({
        emiId: emi._id,
        instalmentNumber: 1,
        memberId: downlineMember._id,
      });

      // Member wins lucky draw!
      const winningRef = "JMD-DRAW-2026-DIWALI-GOLD";
      const updatedPlans = await applyWinnerStopsEmi({
        memberId: downlineMember._id,
        winningRef,
      });

      expect(updatedPlans.length).toBeGreaterThanOrEqual(1);
      const plan = updatedPlans.find((p) => p._id.toString() === emi._id.toString())!;
      expect(plan).toBeDefined();
      expect(plan.status).toBe(EmiStatus.COMPLETED);
      expect(plan.winnerStopsEmiApplied).toBe(true);
      expect(plan.winnerStopsEmiRef).toBe(winningRef);
      expect(plan.waivedInstalmentsCount).toBe(5); // Instalments 2 through 6 waived

      // Verify waived instalments have WAIVED_BY_PRIZE_WIN status
      expect(plan.instalments[1].status).toBe(InstalmentStatus.WAIVED_BY_PRIZE_WIN);
      expect(plan.instalments[5].status).toBe(InstalmentStatus.WAIVED_BY_PRIZE_WIN);
      expect(plan.instalments[1].waiverReason).toContain(winningRef);
    });

    it("handles EMI cancellation requests and admin approval workflow", async () => {
      const emi = await createEmiSchedule({
        orderId: new Types.ObjectId(),
        memberId: downlineMember._id,
        orderRef: "JMD-ORD-EMI-CANCEL",
        totalPrincipalPaise: 120000,
        totalInstalments: 3,
      });

      // Request cancellation
      const requested = await requestEmiCancellation({
        emiId: emi._id,
        memberId: downlineMember._id,
        reason: "Customer relocating overseas",
      });
      expect(requested.cancellationRequested).toBe(true);
      expect(requested.cancellationReason).toBe("Customer relocating overseas");

      // Admin approves cancellation
      const approved = await approveEmiCancellation({
        emiId: emi._id,
        adminId: new Types.ObjectId(),
        decision: "APPROVE",
      });
      expect(approved.status).toBe(EmiStatus.CANCELLED);
    });
  });

  describe("PIN System & Downline Access Boundaries", () => {
    let areaPinId: string;

    it("purchases an Area activation PIN using wallet balance", async () => {
      const pin = await purchasePin({
        memberId: sponsorLead._id,
        tier: PinTier.AREA,
      });

      expect(pin._id).toBeDefined();
      expect(pin.pinCode).toMatch(/^JMD-PIN-\d{4}-[A-Z0-9]+$/);
      expect(pin.tier).toBe("AREA");
      expect(pin.faceValuePaise).toBe(2500000); // ₹25,000
      expect(pin.status).toBe(PinStatus.ACTIVE);
      areaPinId = pin._id.toString();
    });

    it("transfers a PIN to another member atomically", async () => {
      const transferred = await transferPin({
        pinId: areaPinId,
        fromMemberId: sponsorLead._id,
        toPhone: downlineMember.phone,
        note: "Downline gift for top performance",
      });

      expect(transferred.ownerMember.toString()).toBe(downlineMember._id.toString());
      expect(transferred.transferHistory.length).toBe(1);
      expect(transferred.transferHistory[0].note).toBe("Downline gift for top performance");

      // Transfer back to sponsorLead for activation testing
      await transferPin({
        pinId: areaPinId,
        fromMemberId: downlineMember._id,
        toPhone: sponsorLead.phone,
      });
    });

    it("enforces immediate sponsor boundary: blocks PIN activation for members outside sponsor tree", async () => {
      await expect(
        activateMemberWithPin({
          pinId: areaPinId,
          actingMemberId: sponsorLead._id,
          targetMemberPhone: outsideMember.phone, // Outside sponsor tree!
        }),
      ).rejects.toThrow(/PIN activation is strictly restricted to your immediate direct sponsored member/);
    });

    it("enforces immediate sponsor boundary: blocks PIN activation for grandchild / deeper descendants", async () => {
      await expect(
        activateMemberWithPin({
          pinId: areaPinId,
          actingMemberId: sponsorLead._id,
          targetMemberPhone: grandchildMember.phone, // Grandchild (sponsorPath contains sponsorLead, but sponsorId is downlineMember)
        }),
      ).rejects.toThrow(/PIN activation is strictly restricted to your immediate direct sponsored member/);
    });

    it("successfully activates an immediate direct sponsored member and upgrades their tier", async () => {
      const result = await activateMemberWithPin({
        pinId: areaPinId,
        actingMemberId: sponsorLead._id,
        targetMemberPhone: downlineMember.phone, // In sponsor downline
      });

      expect(result.tier).toBe("AREA");
      expect(result.pin.status).toBe(PinStatus.REDEEMED);
      expect(result.pin.redeemedByMember?.toString()).toBe(downlineMember._id.toString());

      // Verify member tier was upgraded
      const db = await getStoreDb();
      const Member = getStoreMemberModel(db);
      const updated = await Member.findById(downlineMember._id);
      expect(updated?.tier).toBe("AREA");
    });
  });

  describe("Jewellery Dynamic Pricing Engine", () => {
    it("updates and retrieves daily bullion rates with audit logs", async () => {
      const rates = await updateBullionRates({
        adminId: new Types.ObjectId(),
        goldRatePerGramPaise: 760000, // ₹7,600/g
        silverRatePerGramPaise: 9600, // ₹96/g
      });

      expect(rates.goldRatePerGramPaise).toBe(760000);
      expect(rates.silverRatePerGramPaise).toBe(9600);

      const fetched = await getBullionRates();
      expect(fetched.goldRatePerGramPaise).toBe(760000);
    });

    it("calculates exact jewellery price breakdown with integer paise, 3%/5% GST and half-up rounding", async () => {
      const breakdown = await calculateJewelleryPrice({
        metalType: "GOLD",
        grossWeightGrams: 10.5,
        stoneWeightGrams: 0.5, // Net gold = 10.0g
        makingChargeType: "PERCENTAGE",
        makingChargeValue: 10, // 10% making charge
        stoneChargePaise: 50000, // ₹500 stone
      });

      expect(breakdown.metalType).toBe("GOLD");
      expect(breakdown.netWeightGrams).toBe(10.0);

      // Metal value = 10g * 760,000 paise = 7,600,000 paise (₹76,000)
      expect(breakdown.metalValuePaise).toBe(7600000);

      // Making charges = 10% of 76,000 = 760,000 paise (₹7,600)
      expect(breakdown.makingChargesPaise).toBe(760000);

      // GST: 3% on metal (₹2,280) + 5% on making (₹380) = ₹2,660 = 266,000 paise
      expect(breakdown.metalGstPaise).toBe(228000);
      expect(breakdown.makingGstPaise).toBe(38000);
      expect(breakdown.totalGstPaise).toBe(266000);

      // Total = 76,000 + 7,600 + 500 + 2,660 = ₹86,760 = 8,676,000 paise
      expect(breakdown.totalPricePaise).toBe(8676000);
      expect(breakdown.totalPriceRupees).toBe(86760);

      // 30-minute lock window
      expect(breakdown.priceLockedUntil.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Peer-to-Peer Atomic Coupon Transfers", () => {
    it("atomically transfers coupon: voids sender claim and issues active coupon to recipient", async () => {
      // 1. Issue coupon to sponsorLead
      const initialCoupon = await issueStoreCoupon({
        memberId: sponsorLead._id,
        faceValuePaise: 25000, // ₹250
        source: StoreCouponSource.ADMIN_GRANT,
        validityDays: 60,
      });

      expect(initialCoupon.status).toBe(StoreCouponStatus.ACTIVE);

      // 2. Transfer to downlineMember
      const transferRes = await transferStoreCoupon({
        couponId: initialCoupon._id,
        fromMemberId: sponsorLead._id,
        toPhone: downlineMember.phone,
        note: "Birthday gift coupon",
      });

      // Sender's coupon is now REDEEMED (cannot be used again)
      expect(transferRes.transferredCoupon.status).toBe(StoreCouponStatus.REDEEMED);

      // Recipient gets newly minted active coupon with same face value
      expect(transferRes.newCoupon.status).toBe(StoreCouponStatus.ACTIVE);
      expect(transferRes.newCoupon.faceValuePaise).toBe(25000);
      expect(transferRes.newCoupon.member.toString()).toBe(downlineMember._id.toString());
      expect(transferRes.newCoupon.couponCode).not.toBe(initialCoupon.couponCode);
    });

    it("prevents self-transfer of coupons", async () => {
      const coupon = await issueStoreCoupon({
        memberId: sponsorLead._id,
        faceValuePaise: 10000,
        source: StoreCouponSource.ADMIN_GRANT,
        validityDays: 30,
      });

      await expect(
        transferStoreCoupon({
          couponId: coupon._id,
          fromMemberId: sponsorLead._id,
          toPhone: sponsorLead.phone,
        }),
      ).rejects.toThrow(/Cannot transfer a coupon to yourself/);
    });
  });
});
