import { describe, it, expect, beforeEach } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import {
  registerStoreMember,
  ensureFreeRegistrationCoupon,
} from "@/server/store/services/member.service";
import {
  getStoreCouponModel,
  StoreCouponSource,
} from "@/server/store/models/StoreCoupon";
import {
  requestWithdrawal,
  approveWithdrawal,
  processWithdrawal,
  rejectWithdrawal,
  confirmPayoutSettlement,
  listMemberWithdrawals,
} from "@/server/store/services/withdrawal.service";
import {
  WithdrawalStatus,
} from "@/server/store/models/StoreWithdrawalRequest";
import {
  mutateStoreWallet,
} from "@/server/store/services/wallet-ledger.service";
import { getStoreWalletModel } from "@/server/store/models/StoreWallet";
import { getStoreSettingsModel } from "@/server/store/models/StoreSettings";
import {
  generateOrderTaxInvoicePdf,
  getOrAllocateInvoiceNumber,
} from "@/server/store/services/tax-invoice-pdf.service";
import { getStoreOrderModel, IStoreOrderDoc } from "@/server/store/models/StoreOrder";
import {
  purchasePromotionalPlan,
} from "@/server/store/services/promotional-plan.service";
import { handleRechargeWebhookCallback } from "@/server/store/services/recharge.service";
import {
  getStoreRechargeOrderModel,
  RechargeStatus,
  RechargeCommissionStatus,
} from "@/server/store/models/StoreRechargeOrder";
import { calculateJewelleryPrice } from "@/server/store/services/jewellery-pricing.service";
import { Types } from "mongoose";

describe("Phase 2 Autonomous Sprint — Free Mini Coupon, Bank Withdrawals, Production Invoices & Webhooks", () => {
  beforeEach(async () => {
    const conn = await getStoreDb();
    const collections = conn.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    // Set default store settings
    const SettingsModel = getStoreSettingsModel(conn);
    await SettingsModel.create({
      singletonKey: "DEFAULT_SETTINGS",
      settings: {
        luckyDraw: {
          luckyDrawsEnabled: false,
          legalClearanceConfirmed: false,
        },
        invoice: {
          isProductionReady: false,
          legalEntityName: "JAI MAA DURGA TRADERS PVT LTD",
          tradeName: "Jai Maa Durga",
          gstin: "07AAAFB1234A1Z5", // Staging dummy initially
          registeredAddress: "Main Commercial Center, Sector 14, New Delhi",
          state: "Delhi",
          stateCode: "07",
          invoiceNumberPrefix: "JMD",
          financialYear: "26-27",
        },
      },
    });
  });

  describe("1. Free Registration Mini Coupon", () => {
    it("automatically issues a MINI coupon with source FREE_REGISTRATION upon member registration", async () => {
      const member = await registerStoreMember({
        name: "Aman Sharma",
        phone: "9876543210",
        password: "Password@123",
      });

      expect(member).toBeDefined();
      expect(member.tier).toBe("FREE");

      const conn = await getStoreDb();
      const CouponModel = getStoreCouponModel(conn);
      const coupons = await CouponModel.find({ member: member._id });

      expect(coupons).toHaveLength(1);
      const regCoupon = coupons[0];
      expect(regCoupon.couponType).toBe("MINI");
      expect(regCoupon.source).toBe(StoreCouponSource.FREE_REGISTRATION);
      expect(regCoupon.sourceRef).toBe(`reg:${member.memberId}`);
      expect(regCoupon.faceValuePaise).toBe(50_00); // ₹50
      expect(regCoupon.status).toBe("ACTIVE");
      expect(regCoupon.couponCode).toMatch(/^JMD-CPN-\d{4}-[A-Z0-9]+$/);

      // Verify STRICT LEGAL GATE: Draw participation is disabled without legal clearance
      expect(regCoupon.isEligibleForDraw).toBe(false);
      expect(regCoupon.metadata?.legalGateEnforced).toBe(true);

      // Verify financial invariant: Free registration MINI coupon is a discount voucher
      // and does NOT inflate member's couponWalletPaise or create withdrawable cash
      const WalletModel = getStoreWalletModel(conn);
      const wallet = await WalletModel.findOne({ member: member._id });
      expect(wallet?.couponWalletPaise).toBe(0);
      expect(wallet?.freeReferralPaise).toBe(0);
      expect(wallet?.paidReferralPaise).toBe(0);
    });

    it("guarantees registration coupon face value does not become withdrawable cash or an unauthorized wallet balance", async () => {
      const member = await registerStoreMember({
        name: "Security Audit User",
        phone: "9876543290",
        password: "Password@123",
      });

      const conn = await getStoreDb();
      const WalletModel = getStoreWalletModel(conn);
      const wallet = await WalletModel.findOne({ member: member._id });

      // Financial invariant: coupon discount voucher face value (₹50) must not inflate any wallet balance
      expect(wallet?.couponWalletPaise).toBe(0);
      expect(wallet?.freeReferralPaise).toBe(0);
      expect(wallet?.paidReferralPaise).toBe(0);
      expect(wallet?.addMoneyPaise).toBe(0);
      expect(wallet?.rechargePaise).toBe(0);

      // Attempting bank withdrawal from any wallet must be rejected due to zero balance
      await expect(
        requestWithdrawal({
          memberId: member._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 200_00,
          bankDetails: {
            accountHolderName: "Security Audit User",
            accountNumber: "123456789012",
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "audit-unauthorized-wdr",
        }),
      ).rejects.toThrow(/Insufficient.*balance/i);
    });

    it("guarantees idempotency and prevents duplicate registration coupons for the same member", async () => {
      const member = await registerStoreMember({
        name: "Pooja Verma",
        phone: "9876543211",
        password: "Password@123",
      });

      // Calling ensureFreeRegistrationCoupon again on same member should return replay without minting duplicate
      const secondAttempt = await ensureFreeRegistrationCoupon(member._id);
      expect(secondAttempt.issued).toBe(false);
      expect(secondAttempt.isReplay).toBe(true);

      const conn = await getStoreDb();
      const CouponModel = getStoreCouponModel(conn);
      const coupons = await CouponModel.find({
        member: member._id,
        source: StoreCouponSource.FREE_REGISTRATION,
      });

      expect(coupons).toHaveLength(1);
    });

    it("generates distinct, unique coupon codes for different registered members", async () => {
      const memberA = await registerStoreMember({
        name: "Member A",
        phone: "9876543212",
        password: "Password@123",
      });
      const memberB = await registerStoreMember({
        name: "Member B",
        phone: "9876543213",
        password: "Password@123",
      });

      const conn = await getStoreDb();
      const CouponModel = getStoreCouponModel(conn);

      const couponA = await CouponModel.findOne({ member: memberA._id });
      const couponB = await CouponModel.findOne({ member: memberB._id });

      expect(couponA?.couponCode).not.toBe(couponB?.couponCode);
      expect(couponA?.member.toString()).not.toBe(couponB?.member.toString());
    });
  });

  describe("2. Member Bank Withdrawal Lifecycle & Safety Ledger", () => {
    let testMember: Awaited<ReturnType<typeof registerStoreMember>>;

    beforeEach(async () => {
      testMember = await registerStoreMember({
        name: "Sunil Kumar",
        phone: "9876543220",
        password: "Password@123",
      });

      // Credit ₹5,000 to FREE_REFERRAL wallet (withdrawable)
      await mutateStoreWallet({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        type: "CREDIT",
        unit: "INR_PAISE",
        amountPaise: 5000_00,
        referenceType: "REFERRAL_COMMISSION",
        referenceId: "REF-TEST-001",
        idempotencyKey: "test-credit-sunil",
        description: "Test referral commission earnings",
      });
    });

    it("rejects withdrawals from non-withdrawable wallets (e.g. ADD_MONEY, PRODUCT_POINT)", async () => {
      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "ADD_MONEY" as unknown as "FREE_REFERRAL",
          amountPaise: 1000_00,
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123456789012",
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-invalid-wallet",
        }),
      ).rejects.toThrow(/not eligible for bank withdrawal/);
    });

    it("enforces minimum (₹200) and maximum (₹50,000) limits", async () => {
      // Below min ₹200
      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 100_00, // ₹100
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123456789012",
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-below-min",
        }),
      ).rejects.toThrow(/Withdrawal amount must be between/);

      // Above max ₹50,000
      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 60000_00, // ₹60,000
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123456789012",
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-above-max",
        }),
      ).rejects.toThrow(/Withdrawal amount must be between/);
    });

    it("validates IFSC code format and bank account numbers", async () => {
      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 1000_00,
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123", // Too short
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-bad-acc",
        }),
      ).rejects.toThrow(/Invalid bank account number/);

      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 1000_00,
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123456789012",
            ifscCode: "INVALID_IFSC",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-bad-ifsc",
        }),
      ).rejects.toThrow(/Invalid IFSC code/);
    });

    it("places requested funds on hold immediately upon submission and prevents concurrent over-withdrawals", async () => {
      const conn = await getStoreDb();
      const WalletModel = getStoreWalletModel(conn);

      // Initial balance: ₹5,000 (500,000 paise)
      const res = await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 3000_00, // ₹3,000
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "123456789012",
          ifscCode: "SBIN0001234",
          bankName: "State Bank of India",
        },
        idempotencyKey: "req-wdr-1",
      });

      expect(res.request.status).toBe("REQUESTED");
      expect(res.request.withdrawalRef).toMatch(/^JMD-WDR-\d{4}-[A-Z0-9]+$/);

      // Available balance should now be reduced to ₹2,000 (200,000 paise)
      const walletAfter = await WalletModel.findOne({ member: testMember._id });
      expect(walletAfter?.freeReferralPaise).toBe(2000_00);

      // A second request while first is pending must be rejected to prevent spam
      await expect(
        requestWithdrawal({
          memberId: testMember._id,
          walletType: "FREE_REFERRAL",
          amountPaise: 1000_00,
          bankDetails: {
            accountHolderName: "Sunil Kumar",
            accountNumber: "123456789012",
            ifscCode: "SBIN0001234",
            bankName: "State Bank of India",
          },
          idempotencyKey: "req-wdr-2",
        }),
      ).rejects.toThrow(/already have an active withdrawal request|already have a pending withdrawal request/);
    });

    it("executes admin approval, processing queue, and rejection with automated refund to member wallet", async () => {
      const conn = await getStoreDb();
      const WalletModel = getStoreWalletModel(conn);
      const adminId = new Types.ObjectId();

      const { request } = await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 2500_00, // ₹2,500
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "987654321012",
          ifscCode: "HDFC0001234",
          bankName: "HDFC Bank",
        },
        idempotencyKey: "req-wdr-lifecycle",
      });

      expect(request.status).toBe(WithdrawalStatus.REQUESTED);

      // 1. Admin Approves
      const approved = await approveWithdrawal({
        withdrawalId: request._id,
        adminId,
        notes: "KYC and bank details verified",
      });
      expect(approved.status).toBe(WithdrawalStatus.APPROVED);
      expect(approved.approvedBy?.toString()).toBe(adminId.toString());

      // 2. Move to PROCESSING
      const processing = await processWithdrawal({
        withdrawalId: request._id,
        adminId,
      });
      expect(processing.status).toBe(WithdrawalStatus.PROCESSING);

      // 3. Confirming payout requires a valid banking UTR / provider reference
      await expect(
        confirmPayoutSettlement({
          withdrawalId: request._id,
          adminId,
          providerPayoutRef: "", // Empty reference rejected
        }),
      ).rejects.toThrow(/A valid external provider payout settlement reference/);

      // Payout confirmed with real external reference
      const paid = await confirmPayoutSettlement({
        withdrawalId: request._id,
        adminId,
        providerPayoutRef: "UTR202611020098765",
        payoutProvider: "RAZORPAYX_BANK_TRANSFER",
      });
      expect(paid.status).toBe(WithdrawalStatus.PAID);
      expect(paid.providerPayoutRef).toBe("UTR202611020098765");

      // Test rejection and refund flow with a second withdrawal
      const { request: request2 } = await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 1500_00,
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "987654321012",
          ifscCode: "HDFC0001234",
          bankName: "HDFC Bank",
        },
        idempotencyKey: "req-wdr-reject-flow",
      });

      const walletBeforeReject = await WalletModel.findOne({ member: testMember._id });
      expect(walletBeforeReject?.freeReferralPaise).toBe(1000_00); // 5000 - 2500 - 1500 = 1000

      const rejected = await rejectWithdrawal({
        withdrawalId: request2._id,
        adminId,
        rejectionReason: "Beneficiary bank account name mismatch with member profile",
      });
      expect(rejected.status).toBe(WithdrawalStatus.REJECTED);

      // Automatically refunded to wallet via ledger
      const walletAfterReject = await WalletModel.findOne({ member: testMember._id });
      expect(walletAfterReject?.freeReferralPaise).toBe(2500_00); // 1000 + 1500 = 2500
    });

    it("allows recovering failed settlements by rejecting from PROCESSING status and refunding wallet hold", async () => {
      const conn = await getStoreDb();
      const WalletModel = getStoreWalletModel(conn);
      const adminId = new Types.ObjectId();

      const { request } = await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 2000_00,
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "987654321012",
          ifscCode: "HDFC0001234",
          bankName: "HDFC Bank",
        },
        idempotencyKey: "req-wdr-proc-fail",
      });

      // Move to APPROVED then PROCESSING
      await approveWithdrawal({ withdrawalId: request._id, adminId });
      const inProc = await processWithdrawal({ withdrawalId: request._id, adminId });
      expect(inProc.status).toBe(WithdrawalStatus.PROCESSING);

      const walletWhileProcessing = await WalletModel.findOne({ member: testMember._id });
      expect(walletWhileProcessing?.freeReferralPaise).toBe(3000_00); // 5000 - 2000

      // Bank payout fails at NEFT gateway -> Admin rejects with failure reason
      const recovered = await rejectWithdrawal({
        withdrawalId: request._id,
        adminId,
        rejectionReason: "External NEFT gateway returned NACK: Beneficiary account invalid or frozen",
      });
      expect(recovered.status).toBe(WithdrawalStatus.REJECTED);
      expect(recovered.rejectionReason).toContain("NACK");

      // Balance must be refunded exactly once
      const walletAfterRecovery = await WalletModel.findOne({ member: testMember._id });
      expect(walletAfterRecovery?.freeReferralPaise).toBe(5000_00);

      // Calling reject again must be idempotent and not double-refund
      const reReject = await rejectWithdrawal({
        withdrawalId: request._id,
        adminId,
        rejectionReason: "Repeated rejection attempt",
      });
      expect(reReject.status).toBe(WithdrawalStatus.REJECTED);
      const walletAfterDuplicateReject = await WalletModel.findOne({ member: testMember._id });
      expect(walletAfterDuplicateReject?.freeReferralPaise).toBe(5000_00);
    });

    it("masks bank account numbers in member API responses and prevents unmasked leakage", async () => {
      await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 1000_00,
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "1234567890123456",
          ifscCode: "SBIN0001234",
          bankName: "State Bank of India",
        },
        idempotencyKey: "req-wdr-masking-test",
      });

      const memberList = await listMemberWithdrawals(testMember._id);
      expect(memberList).toHaveLength(1);
      expect(memberList[0].bankDetails.accountNumber).toBe("****3456");
      expect(memberList[0].bankDetails.accountNumber).not.toContain("123456789012");
    });

    it("guarantees idempotent payout settlement confirmation and blocks tampering", async () => {
      const adminId = new Types.ObjectId();
      const { request } = await requestWithdrawal({
        memberId: testMember._id,
        walletType: "FREE_REFERRAL",
        amountPaise: 1000_00,
        bankDetails: {
          accountHolderName: "Sunil Kumar",
          accountNumber: "123456789012",
          ifscCode: "SBIN0001234",
          bankName: "State Bank of India",
        },
        idempotencyKey: "req-wdr-settle-idemp",
      });

      await approveWithdrawal({ withdrawalId: request._id, adminId });
      await processWithdrawal({ withdrawalId: request._id, adminId });

      const paid1 = await confirmPayoutSettlement({
        withdrawalId: request._id,
        adminId,
        providerPayoutRef: "UTR-AXIS-999888777",
      });
      expect(paid1.status).toBe(WithdrawalStatus.PAID);
      expect(paid1.providerPayoutRef).toBe("UTR-AXIS-999888777");

      // Repeated confirmation with identical reference is idempotent
      const paid2 = await confirmPayoutSettlement({
        withdrawalId: request._id,
        adminId,
        providerPayoutRef: "UTR-AXIS-999888777",
      });
      expect(paid2.status).toBe(WithdrawalStatus.PAID);

      // Attempting to alter reference after settlement throws error
      await expect(
        confirmPayoutSettlement({
          withdrawalId: request._id,
          adminId,
          providerPayoutRef: "UTR-NEW-TAMPERED-REF",
        }),
      ).rejects.toThrow(/already marked PAID/);
    });
  });

  describe("3. Production GST Invoice Readiness & Concurrency-Safe Sequential Allocation", () => {
    let dummyOrder: IStoreOrderDoc;

    beforeEach(async () => {
      const conn = await getStoreDb();
      const OrderModel = getStoreOrderModel(conn);

      dummyOrder = await OrderModel.create({
        orderRef: "JMD-ORD-TEST-001",
        memberId: new Types.ObjectId(),
        items: [
          {
            productId: new Types.ObjectId(),
            sku: "JMD-JEW-GOLD-RING-01",
            title: "22K Solid Gold Hallmarked Ring [HSN 7113]",
            quantity: 1,
            unitPricePaise: 40500_00,
            totalPricePaise: 40500_00,
            taxPaise: 1215_00,
          },
        ],
        shippingAddress: {
          fullName: "Rajesh Malhotra",
          phone: "9811223344",
          addressLine1: "B-42 Connaught Place",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "IN",
        },
        itemsTotalPaise: 40500_00,
        taxPaise: 1215_00,
        shippingFeePaise: 0,
        couponDiscountPaise: 0,
        settledStoreCouponsPaise: 0,
        settledBhavikaCouponsPaise: 0,
        netPayablePaise: 41715_00,
        paidCashPaise: 41715_00,
        deficitPaise: 0,
        status: "PROCESSING",
        paymentStatus: "CAPTURED",
        paymentMethod: "ONLINE_RAZORPAY",
        stockReservationExpiresAt: new Date(Date.now() + 3600000),
      });
    });

    it("allocates concurrency-safe sequential invoice numbers (JMD/26-27/00001)", async () => {
      const invNum1 = await getOrAllocateInvoiceNumber(dummyOrder);
      expect(invNum1).toBe("JMD/26-27/00001");

      // Repeated call on the same order returns the exact same number (idempotency)
      const invNum2 = await getOrAllocateInvoiceNumber(dummyOrder);
      expect(invNum2).toBe("JMD/26-27/00001");

      // Next order gets sequence 00002
      const conn = await getStoreDb();
      const OrderModel = getStoreOrderModel(conn);
      const nextOrder = await OrderModel.create({
        orderRef: "JMD-ORD-TEST-002",
        memberId: new Types.ObjectId(),
        items: dummyOrder.items,
        shippingAddress: dummyOrder.shippingAddress,
        itemsTotalPaise: 1000_00,
        taxPaise: 50_00,
        shippingFeePaise: 0,
        couponDiscountPaise: 0,
        settledStoreCouponsPaise: 0,
        settledBhavikaCouponsPaise: 0,
        netPayablePaise: 1050_00,
        paidCashPaise: 1050_00,
        deficitPaise: 0,
        status: "PAID",
        paymentStatus: "CAPTURED",
        stockReservationExpiresAt: new Date(),
      });

      const invNum3 = await getOrAllocateInvoiceNumber(nextOrder);
      expect(invNum3).toBe("JMD/26-27/00002");
    });

    it("generates staging draft invoices safely when isProductionReady=false", async () => {
      const pdfBytes = await generateOrderTaxInvoicePdf(dummyOrder);
      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.byteLength).toBeGreaterThan(1000);
      expect(dummyOrder.invoiceNumber).toBeDefined();
    });

    it("blocks official production invoice issuance with 422 if GSTIN or registered identity is missing or staging placeholder", async () => {
      const conn = await getStoreDb();
      const SettingsModel = getStoreSettingsModel(conn);

      // Enable production mode with staging placeholder GSTIN (07AAAFB1234A1Z5)
      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        {
          $set: {
            "settings.invoice.isProductionReady": true,
            "settings.invoice.gstin": "07AAAFB1234A1Z5", // Staging dummy placeholder
          },
        },
      );

      await expect(generateOrderTaxInvoicePdf(dummyOrder)).rejects.toThrow(
        /Official tax invoice issuance is restricted/,
      );
    });

    it("allows official tax invoice issuance when valid registered seller details are configured", async () => {
      const conn = await getStoreDb();
      const SettingsModel = getStoreSettingsModel(conn);

      // Configure valid registered details
      await SettingsModel.updateOne(
        { singletonKey: "DEFAULT_SETTINGS" },
        {
          $set: {
            "settings.invoice.isProductionReady": true,
            "settings.invoice.legalEntityName": "JAI MAA DURGA COMMERCIAL JEWELLERS LLP",
            "settings.invoice.tradeName": "Jai Maa Durga",
            "settings.invoice.gstin": "07AAAAA0000A1Z5", // Valid format, non-placeholder
            "settings.invoice.registeredAddress": "101 Chandni Chowk, Central Delhi, Delhi - 110006",
            "settings.invoice.state": "Delhi",
            "settings.invoice.stateCode": "07",
          },
        },
      );

      const pdfBytes = await generateOrderTaxInvoicePdf(dummyOrder);
      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.byteLength).toBeGreaterThan(1000);
    });
  });

  describe("4. Promotional Plans & Telecom Webhook Safety", () => {
    it("locks promotional plan purchases while isPurchaseActive=false", async () => {
      const member = await registerStoreMember({
        name: "Test Member",
        phone: "9876543299",
        password: "Password@123",
      });

      await expect(
        purchasePromotionalPlan({
          memberId: member._id,
          planCode: "PLAN_850",
          paymentRef: "PAY-TEST-001",
          idempotencyKey: "test-plan-purchase-locked",
        }),
      ).rejects.toThrow(/Promotional plan purchases are currently locked/);
    });

    it("protects recharge webhook from duplicate callbacks and credits commission idempotently", async () => {
      const conn = await getStoreDb();
      const RechargeModel = getStoreRechargeOrderModel(conn);
      const member = await registerStoreMember({
        name: "Recharge User",
        phone: "9876543255",
        password: "Password@123",
      });

      await RechargeModel.create({
        rechargeRef: "JMD-RCH-2026-TEST01",
        member: member._id,
        serviceType: "MOBILE_PREPAID",
        operator: "JIO",
        consumerNumber: "9876543255",
        amountPaise: 299_00,
        providerRef: "PROV-TXN-12345",
        providerPayoutPaise: 500, // ₹5 commission base
        memberCommissionPaise: 0,
        status: RechargeStatus.SUBMITTED_TO_PROVIDER,
        commissionStatus: RechargeCommissionStatus.NONE,
      });

      // 1. Initial success callback
      const cb1 = await handleRechargeWebhookCallback({
        providerRef: "PROV-TXN-12345",
        status: "SUCCESS",
        providerPayoutPaise: 500,
      });
      expect(cb1.processed).toBe(true);
      expect(cb1.isDuplicate).toBe(false);

      // Verify wallet was credited
      const WalletModel = getStoreWalletModel(conn);
      const wallet = await WalletModel.findOne({ member: member._id });
      expect(wallet?.rechargePaise).toBeGreaterThan(0);

      // 2. Duplicate callback should be safely ignored without double-crediting
      const balanceBeforeDuplicate = wallet?.rechargePaise;
      const cb2 = await handleRechargeWebhookCallback({
        providerRef: "PROV-TXN-12345",
        status: "SUCCESS",
        providerPayoutPaise: 500,
      });
      expect(cb2.processed).toBe(false);
      expect(cb2.isDuplicate).toBe(true);

      const walletAfterDuplicate = await WalletModel.findOne({ member: member._id });
      expect(walletAfterDuplicate?.rechargePaise).toBe(balanceBeforeDuplicate);
    });

    it("handles failed recharge webhook callbacks by setting status FAILED and refunding principal idempotently", async () => {
      const conn = await getStoreDb();
      const RechargeModel = getStoreRechargeOrderModel(conn);
      const member = await registerStoreMember({
        name: "Failed Recharge User",
        phone: "9876543277",
        password: "Password@123",
      });

      // Member ordered recharge for ₹499.00
      await RechargeModel.create({
        rechargeRef: "JMD-RCH-2026-FAIL01",
        member: member._id,
        serviceType: "MOBILE_PREPAID",
        operator: "AIRTEL",
        consumerNumber: "9876543277",
        amountPaise: 499_00,
        providerRef: "PROV-TXN-FAIL-999",
        providerPayoutPaise: 0,
        memberCommissionPaise: 0,
        status: RechargeStatus.PENDING_CONFIRMATION,
        commissionStatus: RechargeCommissionStatus.NONE,
      });

      const WalletModel = getStoreWalletModel(conn);
      const walletBefore = await WalletModel.findOne({ member: member._id });
      const addMoneyBefore = walletBefore?.addMoneyPaise ?? 0;

      // Provider webhook signals failure
      const cb = await handleRechargeWebhookCallback({
        providerRef: "PROV-TXN-FAIL-999",
        status: "FAILED",
        failureReason: "Operator network down: Transaction timed out at switch",
      });

      expect(cb.processed).toBe(true);
      expect(cb.order?.status).toBe(RechargeStatus.FAILED);
      expect(cb.order?.failureReason).toContain("Operator network down");

      // Verify principal was refunded back to addMoney wallet
      const walletAfter = await WalletModel.findOne({ member: member._id });
      expect(walletAfter?.addMoneyPaise).toBe(addMoneyBefore + 499_00);

      // Replay of same failure callback must be ignored idempotently
      const replay = await handleRechargeWebhookCallback({
        providerRef: "PROV-TXN-FAIL-999",
        status: "FAILED",
      });
      expect(replay.processed).toBe(false);
      expect(replay.isDuplicate).toBe(true);
      const walletAfterReplay = await WalletModel.findOne({ member: member._id });
      expect(walletAfterReplay?.addMoneyPaise).toBe(addMoneyBefore + 499_00);
    });
  });

  describe("5. Jewellery Making Charge Weight Basis & Pricing Integrity", () => {
    it("strictly calculates metal value on net metal weight and making charge on gross weight", async () => {
      // Commercial test piece:
      // Gross Weight: 10.0g, Stone Weight: 0.5g -> Net Metal Weight: 9.5g
      // Default rates: Gold ₹7,500/g (750,000 paise), Gold making charge ₹450/g (45,000 paise)
      // Stone charge: ₹1,000 (100,000 paise)
      const quote = await calculateJewelleryPrice({
        metalType: "GOLD",
        grossWeightGrams: 10.0,
        stoneWeightGrams: 0.5,
        stoneChargePaise: 1000_00,
      });

      // 1. Metal Value = netWeight (9.5g) * 750000 = 7,125,000 paise (₹71,250.00)
      expect(quote.grossWeightGrams).toBe(10.0);
      expect(quote.netWeightGrams).toBe(9.5);
      expect(quote.metalValuePaise).toBe(71250_00);

      // 2. Making Charge = grossWeight (10.0g) * 45000 = 450,000 paise (₹4,500.00)
      // STATUTORY & CA-APPROVED RULE: making charges reflect total craft labour on the gross article
      expect(quote.makingChargesPaise).toBe(4500_00);

      // 3. Stone Charge = 100,000 paise (₹1,000.00)
      expect(quote.stoneChargePaise).toBe(1000_00);

      // 4. Subtotal Before GST = 7125000 + 450000 + 100000 = 7,675,000 paise (₹76,750.00)
      expect(quote.subtotalBeforeGstPaise).toBe(76750_00);

      // 5. CA-Approved GST rates:
      // Metal GST: 3% of 7125000 = 213,750 paise
      // Making GST: 5% of 450000 = 22,500 paise
      // Stone GST: 3% of 100000 = 3,000 paise
      // Raw Total GST = 239,250 paise
      expect(quote.metalGstPaise).toBe(213750);
      expect(quote.makingGstPaise).toBe(22500);
      expect(quote.stoneGstPaise).toBe(3000);

      // 6. Half-up rounding to nearest rupee:
      // Unrounded total = 7675000 + 239250 = 7,914,250 paise
      // Rounded total = 7,914,300 paise (₹79,143.00)
      expect(quote.totalPricePaise).toBe(79143_00);
      expect(quote.totalPriceRupees).toBe(79143);
      expect(quote.totalGstPaise).toBe(239300); // 7914300 - 7675000
    });

    it("verifies silver making charges use gross weight and silver per-gram rate", async () => {
      // Silver item: 50.0g gross, 2.0g stone -> 48.0g net silver
      // Silver rate: ₹95/g (9,500 paise), Silver making: ₹15/g (1,500 paise)
      const quote = await calculateJewelleryPrice({
        metalType: "SILVER",
        grossWeightGrams: 50.0,
        stoneWeightGrams: 2.0,
        stoneChargePaise: 0,
      });

      // Metal value = 48.0 * 9500 = 456,000 paise (₹4,560.00)
      expect(quote.metalValuePaise).toBe(4560_00);

      // Making charges = 50.0 * 1500 = 75,000 paise (₹750.00) [gross weight basis]
      expect(quote.makingChargesPaise).toBe(750_00);

      // Subtotal = 456000 + 75000 = 531,000 paise (₹5,310.00)
      expect(quote.subtotalBeforeGstPaise).toBe(5310_00);

      // Metal GST (3%): 13,680 paise; Making GST (5%): 3,750 paise -> Raw GST: 17,430 paise
      // Unrounded total = 548,430 paise -> Rounded: 548,400 paise (₹5,484.00)
      expect(quote.totalPricePaise).toBe(5484_00);
    });
  });
});
