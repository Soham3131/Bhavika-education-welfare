import { describe, it, expect, beforeEach } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import {
  getStoreMemberModel,
  getStoreWalletModel,
  getStoreWalletLedgerModel,
} from "@/server/store/models";
import {
  registerStoreMember,
  generateMemberId,
  getStoreMemberByMemberId,
} from "@/server/store/services/member.service";
import {
  mutateStoreWallet,
  getOrCreateStoreWallet,
} from "@/server/store/services/wallet-ledger.service";
import {
  getStoreSettings,
  updateStoreSettings,
} from "@/server/store/services/settings.service";
import { DEFAULT_STORE_SETTINGS } from "@/lib/validation/store-settings";

describe("Phase A: Jai Maa Durga Data Layer Foundations", () => {
  beforeEach(async () => {
    const conn = await getStoreDb();
    const collections = conn.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    const Member = getStoreMemberModel(conn);
    const Wallet = getStoreWalletModel(conn);
    const Ledger = getStoreWalletLedgerModel(conn);

    await Promise.all([
      Member.syncIndexes(),
      Wallet.syncIndexes(),
      Ledger.syncIndexes(),
    ]);
  });

  describe("1. Database & Isolation Boundaries", () => {
    it("connects to a dedicated database separate from Bhavika default db", async () => {
      const storeConn = await getStoreDb();
      expect(storeConn.name).toBe("test_jmd");
      expect(storeConn.readyState).toBe(1); // Connected
    });
  });

  describe("2. Member Identity & Sponsor Hierarchy", () => {
    it("generates correctly formatted Member IDs", () => {
      const id1 = generateMemberId();
      const id2 = generateMemberId();
      const currentYear = new Date().getFullYear();

      expect(id1).toMatch(new RegExp(`^JMD-${currentYear}-[A-Z0-9]{6}$`));
      expect(id2).toMatch(new RegExp(`^JMD-${currentYear}-[A-Z0-9]{6}$`));
      expect(id1).not.toBe(id2);
    });

    it("registers a member and automatically initializes their 7-wallet cache", async () => {
      const member = await registerStoreMember({
        name: "Pooja Sharma",
        phone: "9876543210",
        email: "pooja@example.com",
        password: "securePassword123!",
      });

      expect(member._id).toBeDefined();
      expect(member.memberId).toMatch(/^JMD-/);
      expect(member.name).toBe("Pooja Sharma");
      expect(member.tier).toBe("FREE");
      expect(member.status).toBe("ACTIVE");
      expect(member.sponsorId).toBeNull();
      expect(member.sponsorPath).toEqual([]);

      // Verify wallet was created with zero balances
      const wallet = await getOrCreateStoreWallet(member._id);
      expect(wallet).toBeDefined();
      expect(wallet.addMoneyPaise).toBe(0);
      expect(wallet.productPoints).toBe(0);
      expect(wallet.rechargePaise).toBe(0);
      expect(wallet.couponWalletPaise).toBe(0);

      // Verify lookup by memberId
      const found = await getStoreMemberByMemberId(member.memberId);
      expect(found).toBeDefined();
      expect(found?._id.toString()).toBe(member._id.toString());
    });

    it("prevents duplicate phone numbers and emails", async () => {
      await registerStoreMember({
        name: "First User",
        phone: "9998887770",
        email: "common@example.com",
        password: "password123",
      });

      // Duplicate phone
      await expect(
        registerStoreMember({
          name: "Second User",
          phone: "9998887770",
          email: "another@example.com",
          password: "password123",
        }),
      ).rejects.toThrow("This phone number is already registered.");

      // Duplicate email
      await expect(
        registerStoreMember({
          name: "Third User",
          phone: "1112223330",
          email: "common@example.com",
          password: "password123",
        }),
      ).rejects.toThrow("This email address is already registered.");
    });

    it("builds a verified sponsorPath for downstream members", async () => {
      const root = await registerStoreMember({
        name: "Root Sponsor",
        phone: "9000000001",
        password: "password123",
      });

      const child = await registerStoreMember({
        name: "Child Member",
        phone: "9000000002",
        sponsorId: root.memberId,
        password: "password123",
      });

      const grandchild = await registerStoreMember({
        name: "Grandchild Member",
        phone: "9000000003",
        sponsorId: child.memberId,
        password: "password123",
      });

      expect(child.sponsorId).toBe(root.memberId);
      expect(child.sponsorPath).toEqual([root.memberId]);

      expect(grandchild.sponsorId).toBe(child.memberId);
      expect(grandchild.sponsorPath).toEqual([root.memberId, child.memberId]);
    });

    it("rejects non-existent or blocked sponsors", async () => {
      await expect(
        registerStoreMember({
          name: "Orphan",
          phone: "9000000004",
          sponsorId: "JMD-2026-NONEXISTENT",
          password: "password123",
        }),
      ).rejects.toThrow("Invalid sponsor ID. No such member found.");

      const activeSponsor = await registerStoreMember({
        name: "Sponsor To Block",
        phone: "9000000005",
        password: "password123",
      });

      // Suspend sponsor
      const conn = await getStoreDb();
      const Member = getStoreMemberModel(conn);
      await Member.updateOne({ _id: activeSponsor._id }, { $set: { status: "BLOCKED" } });

      await expect(
        registerStoreMember({
          name: "Applicant",
          phone: "9000000006",
          sponsorId: activeSponsor.memberId,
          password: "password123",
        }),
      ).rejects.toThrow("This sponsor cannot accept new members.");
    });
  });

  describe("3. Seven Wallets & Typed Ledger Operations", () => {
    it("credits and debits monetary wallets in integer paise", async () => {
      const member = await registerStoreMember({
        name: "Wallet User",
        phone: "9111111111",
        password: "password123",
      });

      // Credit ₹500 (50,000 paise)
      const creditRes = await mutateStoreWallet({
        memberId: member._id,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 50000,
        referenceType: "PAYMENT_GATEWAY_TOPUP",
        referenceId: "PAY-001",
        idempotencyKey: "topup:pay-001",
        description: "Razorpay topup ₹500",
      });

      expect(creditRes.isReplay).toBe(false);
      expect(creditRes.ledger.amountPaise).toBe(50000);
      expect(creditRes.ledger.balanceAfterPaise).toBe(50000);
      expect(creditRes.wallet.addMoneyPaise).toBe(50000);

      // Debit ₹150 (15,000 paise)
      const debitRes = await mutateStoreWallet({
        memberId: member._id,
        walletType: "ADD_MONEY",
        type: "DEBIT",
        unit: "INR_PAISE",
        amountPaise: 15000,
        referenceType: "ORDER_CHECKOUT",
        referenceId: "ORD-001",
        idempotencyKey: "order:ord-001",
        description: "Order payment",
      });

      expect(debitRes.isReplay).toBe(false);
      expect(debitRes.ledger.amountPaise).toBe(15000);
      expect(debitRes.ledger.balanceAfterPaise).toBe(35000);
      expect(debitRes.wallet.addMoneyPaise).toBe(35000);
    });

    it("strictly prevents overdrawing / negative balance", async () => {
      const member = await registerStoreMember({
        name: "Overdraft User",
        phone: "9222222222",
        password: "password123",
      });

      await mutateStoreWallet({
        memberId: member._id,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 10000, // ₹100
        referenceType: "PAYMENT_GATEWAY_TOPUP",
        referenceId: "PAY-002",
        idempotencyKey: "topup:pay-002",
        description: "Initial fund",
      });

      await expect(
        mutateStoreWallet({
          memberId: member._id,
          walletType: "ADD_MONEY",
          type: "DEBIT",
          unit: "INR_PAISE",
          amountPaise: 15000, // ₹150 > ₹100
          referenceType: "ORDER_CHECKOUT",
          referenceId: "ORD-002",
          idempotencyKey: "order:ord-002",
          description: "Overdraft attempt",
        }),
      ).rejects.toThrow("Insufficient balance in ADD_MONEY");
    });

    it("enforces unit segregation: points for loyalty, paise for monetary wallets", async () => {
      const member = await registerStoreMember({
        name: "Unit User",
        phone: "9333333333",
        password: "password123",
      });

      // Reject using points in monetary wallet
      await expect(
        mutateStoreWallet({
          memberId: member._id,
          walletType: "ADD_MONEY",
          type: "CREDIT",
          unit: "LOYALTY_POINT",
          pointsDelta: 100,
          referenceType: "PAYMENT_GATEWAY_TOPUP",
          referenceId: "REF-001",
          idempotencyKey: "err:unit-1",
          description: "Invalid unit test",
        }),
      ).rejects.toThrow("ADD_MONEY wallet requires unit INR_PAISE");

      // Reject using paise in points wallet
      await expect(
        mutateStoreWallet({
          memberId: member._id,
          walletType: "PRODUCT_POINT",
          type: "CREDIT",
          unit: "INR_PAISE",
          amountPaise: 10000,
          referenceType: "PRODUCT_LOYALTY_REWARD",
          referenceId: "REF-002",
          idempotencyKey: "err:unit-2",
          description: "Invalid unit test",
        }),
      ).rejects.toThrow("PRODUCT_POINT wallet requires unit LOYALTY_POINT");

      // Valid points credit
      const pointRes = await mutateStoreWallet({
        memberId: member._id,
        walletType: "PRODUCT_POINT",
        type: "CREDIT",
        unit: "LOYALTY_POINT",
        pointsDelta: 250,
        referenceType: "PRODUCT_LOYALTY_REWARD",
        referenceId: "ORD-POINTS-001",
        idempotencyKey: "reward:ord-points-001",
        description: "Purchase loyalty reward",
      });

      expect(pointRes.wallet.productPoints).toBe(250);
      expect(pointRes.ledger.pointsDelta).toBe(250);
      expect(pointRes.ledger.amountPaise).toBeNull();
    });

    it("guarantees idempotency on duplicate transaction keys", async () => {
      const member = await registerStoreMember({
        name: "Idempotent User",
        phone: "9444444444",
        password: "password123",
      });

      const firstCall = await mutateStoreWallet({
        memberId: member._id,
        walletType: "RECHARGE",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 5000,
        referenceType: "RECHARGE_REVERSAL",
        referenceId: "REC-123",
        idempotencyKey: "recharge:cashback:rec-123",
        description: "Recharge cashback",
      });

      expect(firstCall.isReplay).toBe(false);
      expect(firstCall.wallet.rechargePaise).toBe(5000);

      // Replay exact same request
      const secondCall = await mutateStoreWallet({
        memberId: member._id,
        walletType: "RECHARGE",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 5000,
        referenceType: "RECHARGE_REVERSAL",
        referenceId: "REC-123",
        idempotencyKey: "recharge:cashback:rec-123",
        description: "Recharge cashback",
      });

      expect(secondCall.isReplay).toBe(true);
      expect(secondCall.wallet.rechargePaise).toBe(5000); // Balance NOT doubled!
      expect(secondCall.ledger._id.toString()).toBe(firstCall.ledger._id.toString());
    });

    it("survives concurrent debit race conditions safely without going negative", async () => {
      const member = await registerStoreMember({
        name: "Race User",
        phone: "9555555555",
        password: "password123",
      });

      // Seed ₹250 (25,000 paise)
      await mutateStoreWallet({
        memberId: member._id,
        walletType: "ADD_MONEY",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 25000,
        referenceType: "PAYMENT_GATEWAY_TOPUP",
        referenceId: "SEED",
        idempotencyKey: "seed:race",
        description: "Seed balance ₹250",
      });

      // Fire 5 simultaneous debits of ₹100 (10,000 paise)
      // Balance is ₹250. Exactly 2 should succeed, 3 should fail with INSUFFICIENT_BALANCE
      const promises = Array.from({ length: 5 }).map((_, i) =>
        mutateStoreWallet({
          memberId: member._id,
          walletType: "ADD_MONEY",
          type: "DEBIT",
          unit: "INR_PAISE",
          amountPaise: 10000,
          referenceType: "ORDER_CHECKOUT",
          referenceId: `RACE-${i}`,
          idempotencyKey: `race:debit:${i}`,
          description: `Race debit ${i}`,
        })
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, error: err.message })),
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(2);
      expect(failures.length).toBe(3);

      const finalWallet = await getOrCreateStoreWallet(member._id);
      expect(finalWallet.addMoneyPaise).toBe(5000); // Exactly ₹50 remaining!
    });
  });

  describe("4. Store Settings Validation", () => {
    it("reads default store settings with full schema defaults", async () => {
      const settings = await getStoreSettings();
      expect(settings).toBeDefined();
      expect(settings).toEqual(DEFAULT_STORE_SETTINGS);
      expect(settings.rechargeCommissionSplits.freeTierPercent).toBe(40);
      expect(settings.rechargeCommissionSplits.freeTierCapPaise).toBe(200);
      expect(settings.membership.areaTierThresholdPaise).toBe(200000);
      expect(settings.jewellery.metalGstRateBasisPoints).toBe(300);
      expect(settings.luckyDraw.luckyDrawsEnabled).toBe(false); // Gated pending legal
    });

    it("updates partial settings without stripping unmentioned fields", async () => {
      const updated = await updateStoreSettings({
        membership: {
          areaTierThresholdPaise: 300000, // Updated to ₹3,000
          chiefTierThresholdPaise: 1500000,
          qualificationStrategy: "SINGLE_ORDER_THRESHOLD",
          directReferralProductMarginPercent: 12,
        },
      });

      expect(updated.membership.areaTierThresholdPaise).toBe(300000);
      // Unmentioned fields remain intact!
      expect(updated.rechargeCommissionSplits.freeTierPercent).toBe(40);
      expect(updated.jewellery.metalGstRateBasisPoints).toBe(300);
    });
  });
});
