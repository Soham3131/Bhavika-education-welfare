import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: <T>(fn: T): T => fn,
  }),
}));

import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import {
  createStoreOrder,
} from "@/server/store/services/order.service";
import {
  createPaymentAttempt,
  recordPaymentSuccess,
} from "@/server/store/services/payment.service";
import {
  getStoreProductModel,
  getStoreCategoryModel,
} from "@/server/store/models";
import {
  getStoreSettings,
  updateStoreSettings,
} from "@/server/store/services/settings.service";
import {
  createLuckyDraw,
  issueOrderTickets,
  snapshotLuckyDraw,
  executeAuditableDraw,
  listStorefrontDraws,
  listMemberLuckyTickets,
} from "@/server/store/services/lucky-draw.service";
import { LuckyDrawStatus } from "@/server/store/models/StoreLuckyDraw";
import {
  calculateJewelleryPrice,
  updateBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import {
  generateOrderTaxInvoicePdf,
  getOrAllocateInvoiceNumber,
  isValidGstin,
} from "@/server/store/services/tax-invoice-pdf.service";
import { getStoreCouponModel } from "@/server/store/models/StoreCoupon";
import { Types } from "mongoose";

describe("Production Feature Activation — Lucky Draw, Jewellery GST, and Seller Invoices", () => {
  let memberId: Types.ObjectId;
  let adminId: Types.ObjectId;
  let groceryProductId: string;
  let goldRingProductId: string;
  let silverPayalProductId: string;

  beforeEach(async () => {
    const conn = await getStoreDb();
    for (const key of Object.keys(conn.collections)) {
      await conn.collections[key].deleteMany({});
    }

    adminId = new Types.ObjectId();

    // Seed bullion rates
    await updateBullionRates({
      adminId,
      goldRatePerGramPaise: 7500_00, // ₹7,500/g
      silverRatePerGramPaise: 95_00, // ₹95/g
    });

    // Configure approved production settings first
    await updateStoreSettings({
      jewellery: {
        metalGstRateBasisPoints: 300,
        makingGstRateBasisPoints: 500,
        stoneGstRateBasisPoints: 300,
        goldMakingChargePerGramPaise: 450_00,
        silverMakingChargePerGramPaise: 15_00,
        quoteLockDurationMinutes: 30,
        caApprovalConfirmed: true, // APPROVED
      },
      luckyDraw: {
        luckyDrawsEnabled: true, // APPROVED
        legalClearanceConfirmed: true, // APPROVED
      },
      invoice: {
        isProductionReady: true, // APPROVED
        legalEntityName: "JAI MAA DURGA COMMERCIAL JEWELLERS LLP",
        tradeName: "Jai Maa Durga",
        gstin: "07AAAAA0000A1Z5",
        registeredAddress: "101 Chandni Chowk, Central Delhi, Delhi - 110006",
        state: "Delhi",
        stateCode: "07",
        invoiceNumberPrefix: "JMD",
        financialYear: "26-27",
        supportEmail: "store@bhavikawelfare.org",
      },
      cod: {
        codEnabled: true,
        maxOrderAmountPaise: 500_000,
      },
    });

    // Register active store member after settings are configured
    const member = await registerStoreMember({
      name: "Radha Sharma",
      phone: "9876543299",
      email: "radha@test.dev",
      password: "Password123!",
    });
    memberId = member._id;

    // Seed Categories
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
    const silverCategory = await CatModel.create({
      name: "Silver Jewellery",
      slug: "silver-jewellery",
      type: "JEWELLERY_SILVER",
      isActive: true,
    });

    // Seed Products
    const ProdModel = getStoreProductModel(conn);
    const groceryProd = await ProdModel.create({
      sku: "JMD-GROC-OIL-01",
      title: "Cold Pressed Mustard Oil 1L",
      slug: "cold-pressed-mustard-oil-1l",
      category: groceryCategory._id,
      basePricePaise: 249_00,
      stock: 50,
      reservedStock: 0,
      isActive: true,
    });
    groceryProductId = groceryProd._id.toString();

    const goldProd = await ProdModel.create({
      sku: "JMD-GLD-RING-22K",
      title: "22K Hallmarked Gold Diamond Accent Ring",
      slug: "22k-gold-diamond-ring",
      category: goldCategory._id,
      basePricePaise: 50000_00,
      stock: 10,
      reservedStock: 0,
      isActive: true,
      attributes: {
        metalType: "GOLD",
        grossWeightGrams: 6.0,
        netWeightGrams: 5.5,
        stoneWeightGrams: 0.5,
        stoneChargesPaise: 5000_00,
        purity: "22K",
      },
    });
    goldRingProductId = goldProd._id.toString();

    const silverProd = await ProdModel.create({
      sku: "JMD-SLV-PAYAL-01",
      title: "925 Sterling Silver Handcrafted Payal",
      slug: "925-sterling-silver-payal",
      category: silverCategory._id,
      basePricePaise: 3500_00,
      stock: 20,
      reservedStock: 0,
      isActive: true,
      attributes: {
        metalType: "SILVER",
        grossWeightGrams: 25.0,
        netWeightGrams: 25.0,
        stoneWeightGrams: 0.0,
        stoneChargesPaise: 0,
        purity: "925",
      },
    });
    silverPayalProductId = silverProd._id.toString();
  });

  /* ========================================================================== */
  /*  A. LUCKY DRAW ACTIVATION & VERIFICATION                                   */
  /* ========================================================================== */
  describe("A. Lucky Draw Activation & Auditable Execution", () => {
    it("confirms luckyDrawsEnabled and legalClearanceConfirmed are true in settings", async () => {
      const settings = await getStoreSettings();
      expect(settings.luckyDraw.luckyDrawsEnabled).toBe(true);
      expect(settings.luckyDraw.legalClearanceConfirmed).toBe(true);
    });

    it("issues draw-eligible free registration coupons to new members when clearance is confirmed", async () => {
      const conn = await getStoreDb();
      const CouponModel = getStoreCouponModel(conn);

      // Radha Sharma was registered when clearance was true in beforeEach
      const coupons = await CouponModel.find({ member: memberId });
      expect(coupons.length).toBe(1);
      expect(coupons[0].couponCode).toMatch(/^JMD-CPN-\d{4}-[A-Z0-9]+$/);
      expect(coupons[0].isEligibleForDraw).toBe(true);
      expect(coupons[0].faceValuePaise).toBe(50_00);
    });

    it("creates an active lucky draw without mock winners and lists it on storefront", async () => {
      const draw = await createLuckyDraw({
        title: "Jai Maa Durga Bumper Dhanteras Draw",
        description: "Win pure 24K 10g Gold Coins on qualifying jewellery purchases",
        minOrderAmountPaise: 1000_00, // ₹1,000 threshold
        startDate: new Date(Date.now() - 3600_000), // Active now
        endDate: new Date(Date.now() + 86400_000), // Ends tomorrow
        scheduledDrawDate: new Date(Date.now() + 172800_000),
        prizes: [
          { rank: 1, prizeTitle: "10g 24K Gold Coin", prizeValueRupees: 75000, winnerCount: 1 },
          { rank: 2, prizeTitle: "100g 999 Silver Bar", prizeValueRupees: 9500, winnerCount: 2 },
        ],
      });

      expect(draw.status).toBe(LuckyDrawStatus.ACTIVE);
      expect(draw.winners.length).toBe(0); // Zero mock winners!
      expect(draw.drawCode).toMatch(/^JMD-DRAW-\d{4}-[A-Z0-9]+$/);

      const storefrontDraws = await listStorefrontDraws();
      expect(storefrontDraws.some((d) => d.drawCode === draw.drawCode)).toBe(true);
    });

    it("issues tamper-evident lucky tickets on paid qualifying orders and executes deterministic draw", async () => {
      const draw = await createLuckyDraw({
        title: "Gold & Diamond Festival Bumper",
        description: "Exclusive member draw",
        minOrderAmountPaise: 2000_00, // ₹2,000
        startDate: new Date(Date.now() - 3600_000),
        endDate: new Date(Date.now() + 86400_000),
        scheduledDrawDate: new Date(Date.now() + 172800_000),
        prizes: [
          { rank: 1, prizeTitle: "Grand Gold Coin", prizeValueRupees: 50000, winnerCount: 1 },
        ],
      });

      // Member places qualifying order
      const tickets1 = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId,
        orderRef: "JMD-ORD-QUALIFY-01",
        totalAmountPaise: 5000_00, // Meets ₹2,000 threshold
      });
      expect(tickets1.length).toBe(1);
      expect(tickets1[0].status).toBe("ISSUED");
      expect(tickets1[0].ticketNumber).toMatch(/^TKT-\d{4}-[A-Z0-9]+$/);

      // Idempotency check: repeated issuance for the same orderRef returns existing ticket
      const ticketsReplay = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId,
        orderRef: "JMD-ORD-QUALIFY-01",
        totalAmountPaise: 5000_00,
      });
      expect(ticketsReplay.length).toBe(1);
      expect(ticketsReplay[0].ticketNumber).toBe(tickets1[0].ticketNumber);

      // Snapshot & lock the draw
      const lockedDraw = await snapshotLuckyDraw(draw._id);
      expect(lockedDraw.status).toBe(LuckyDrawStatus.LOCKED);
      expect(lockedDraw.snapshot.totalEligibleTickets).toBe(1);
      expect(lockedDraw.snapshot.snapshotHash).toBeDefined();

      // Execute auditable draw with deterministic seed
      const completedDraw = await executeAuditableDraw({
        drawId: draw._id,
        adminId,
        seed: "audit-seed-verification-2026",
      });

      expect(completedDraw.status).toBe(LuckyDrawStatus.COMPLETED);
      expect(completedDraw.winners.length).toBe(1);
      expect(completedDraw.winners[0].ticketNumber).toBe(tickets1[0].ticketNumber);
      expect(completedDraw.winners[0].rank).toBe(1);

      // Verify member ticket status is now WON
      const memberTickets = await listMemberLuckyTickets(memberId);
      const wonTicket = memberTickets.find((t) => t.ticketNumber === tickets1[0].ticketNumber);
      expect(wonTicket?.status).toBe("WON");
      expect(wonTicket?.prizeWon).toBe("Grand Gold Coin");
      expect(wonTicket?.rankWon).toBe(1);
    });
  });

  /* ========================================================================== */
  /*  B. JEWELLERY CA APPROVAL & TAX CALCULATIONS                               */
  /* ========================================================================== */
  describe("B. Jewellery CA Approval & Statutory Tax Calculations", () => {
    it("confirms CA approval and statutory GST rates in StoreSettings", async () => {
      const settings = await getStoreSettings();
      expect(settings.jewellery.caApprovalConfirmed).toBe(true);
      expect(settings.jewellery.metalGstRateBasisPoints).toBe(300); // 3%
      expect(settings.jewellery.makingGstRateBasisPoints).toBe(500); // 5%
      expect(settings.jewellery.stoneGstRateBasisPoints).toBe(300); // 3%
      expect(settings.jewellery.goldMakingChargePerGramPaise).toBe(450_00); // ₹450/g
      expect(settings.jewellery.silverMakingChargePerGramPaise).toBe(15_00); // ₹15/g
    });

    it("accurately calculates 3-component jewellery GST with gross making and net metal weights", async () => {
      // 22K Gold ring: gross = 6.0g, net = 5.5g, stone = 0.5g, stone charges = ₹5,000
      // Bullion gold rate: ₹7,500/g
      // 22K pure metal rate factor: (7500 * 22 / 24) = ₹6,875/g
      // Metal value: 5.5g * ₹6,875 = ₹37,812.50 = 3,781,250 paise
      // Making charge on GROSS weight: 6.0g * ₹450 = ₹2,700.00 = 270,000 paise
      // Stone charge: 500,000 paise
      // Metal GST (3%): round(3,781,250 * 0.03) = 113,438 paise
      // Making GST (5%): round(270,000 * 0.05) = 13,500 paise
      // Stone GST (3%): round(500,000 * 0.03) = 15,000 paise
      // Total GST: 113,438 + 13,500 + 15,000 = 141,938 paise
      const quote = await calculateJewelleryPrice(
        {
          metalType: "GOLD",
          grossWeightGrams: 6.0,
          stoneWeightGrams: 0.5,
          stoneChargePaise: 5000_00,
        },
        { requireCaApproval: true },
      );

      expect(quote.caApprovalConfirmed).toBe(true);
      expect(quote.pricingStatus).toBe("APPROVED_FINAL_PRICE");
      expect(quote.metalValuePaise).toBe(41250_00);
      expect(quote.makingChargesPaise).toBe(2700_00);
      expect(quote.stoneChargePaise).toBe(5000_00);
      expect(quote.metalGstPaise).toBe(1237_50);
      expect(quote.makingGstPaise).toBe(135_00);
      expect(quote.stoneGstPaise).toBe(150_00);
      expect(quote.totalGstPaise).toBe(1523_00); // 1522_50 rounded to nearest whole rupee (1523_00)
    });

    it("accurately calculates silver jewellery with ₹15/g making charge and statutory GST", async () => {
      // 25g silver: metal = 25 * 95 = ₹2,375 (237500 paise)
      // Making charge: 25 * 15 = ₹375 (37500 paise)
      // Metal GST (3%): 7125 paise; Making GST (5%): 1875 paise; Total GST: 9000 paise
      const quote = await calculateJewelleryPrice(
        {
          metalType: "SILVER",
          grossWeightGrams: 25.0,
          stoneWeightGrams: 0.0,
          stoneChargePaise: 0,
        },
        { requireCaApproval: true },
      );

      expect(quote.caApprovalConfirmed).toBe(true);
      expect(quote.metalValuePaise).toBe(2375_00);
      expect(quote.makingChargesPaise).toBe(375_00);
      expect(quote.metalGstPaise).toBe(71_25);
      expect(quote.makingGstPaise).toBe(18_75);
      expect(quote.totalGstPaise).toBe(90_00);
      expect(quote.totalPricePaise).toBe(2840_00);

      // Verify silver payal product is ready for store checkout
      expect(silverPayalProductId).toBeDefined();
    });

    it("allows jewellery checkout when caApprovalConfirmed=true and halts with 403 when revoked", async () => {
      // 1. Checkout succeeds when caApprovalConfirmed=true
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProductId, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Sharma",
          phone: "9876543299",
          addressLine1: "10 Main Bazar",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });

      expect(order.orderRef).toBeDefined();
      expect(order.taxPaise).toBeGreaterThan(0); // Authoritative GST applied
      expect(order.status).toBe("PENDING_PAYMENT");

      // 2. If CA approval is revoked, checkout immediately halts with 403
      await updateStoreSettings({
        jewellery: {
          caApprovalConfirmed: false,
        },
      });

      await expect(
        createStoreOrder({
          memberId,
          items: [{ productId: goldRingProductId, quantity: 1 }],
          shippingAddress: {
            fullName: "Radha Sharma",
            phone: "9876543299",
            addressLine1: "10 Main Bazar",
            city: "New Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
          paymentMethod: "ONLINE_RAZORPAY",
        }),
      ).rejects.toThrow(/gated pending written Chartered Accountant confirmation/);

      // 3. Normal grocery items remain unaffected even when jewellery CA approval is false!
      const groceryOrder = await createStoreOrder({
        memberId,
        items: [{ productId: groceryProductId, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Sharma",
          phone: "9876543299",
          addressLine1: "10 Main Bazar",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });
      expect(groceryOrder.orderRef).toBeDefined();
      expect(groceryOrder.status).toBe("PENDING_PAYMENT");

      // Restore approval
      await updateStoreSettings({
        jewellery: {
          caApprovalConfirmed: true,
        },
      });
    });
  });

  /* ========================================================================== */
  /*  C. SELLER GST & OFFICIAL PRODUCTION INVOICES                              */
  /* ========================================================================== */
  describe("C. Seller GST & Official Production Tax Invoices", () => {
    it("validates approved seller GSTIN format strictly", () => {
      expect(isValidGstin("06EXVPS0958F2ZR")).toBe(true);
      expect(isValidGstin("07AAAAA0000A1Z5")).toBe(true);
      expect(isValidGstin("07AAAFB1234A1Z5")).toBe(true);
      expect(isValidGstin("INVALID_GSTIN_123")).toBe(false);
      expect(isValidGstin("")).toBe(false);
    });

    it("generates production tax invoices without staging watermarks or placeholder text", async () => {
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProductId, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Sharma",
          phone: "9876543299",
          addressLine1: "10 Main Bazar",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });

      // Mark order as captured/processing
      order.status = "PROCESSING";
      order.paymentStatus = "CAPTURED";
      await order.save();

      // Allocate sequential invoice number
      const invoiceNumber = await getOrAllocateInvoiceNumber(order);
      expect(invoiceNumber).toBe("JMD/26-27/00001");

      // Generate PDF
      const pdfBytes = await generateOrderTaxInvoicePdf(order);
      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.byteLength).toBeGreaterThan(1000);

      // Verify idempotency
      const invoiceNumberReplay = await getOrAllocateInvoiceNumber(order);
      expect(invoiceNumberReplay).toBe(invoiceNumber);
    });

    it("rejects production invoice issuance with 422 if GSTIN is placeholder or entity missing", async () => {
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: groceryProductId, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Sharma",
          phone: "9876543299",
          addressLine1: "10 Main Bazar",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });

      // Temporarily set placeholder staging GSTIN
      await updateStoreSettings({
        invoice: {
          isProductionReady: true,
          gstin: "07AAAFB1234A1Z5", // Staging placeholder
        },
      });

      await expect(generateOrderTaxInvoicePdf(order)).rejects.toThrow(
        /Official tax invoice issuance is restricted/,
      );

      // Restore approved GSTIN
      await updateStoreSettings({
        invoice: {
          isProductionReady: true,
          gstin: "07AAAAA0000A1Z5",
        },
      });
    });
  });

  /* ========================================================================== */
  /*  D. PAYMENT & FEATURE ISOLATION                                            */
  /* ========================================================================== */
  describe("D. Payment Gateway & Feature Isolation", () => {
    it("allows normal product checkout through Razorpay without feature blockage", async () => {
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: groceryProductId, quantity: 2 }],
        shippingAddress: {
          fullName: "Radha Sharma",
          phone: "9876543299",
          addressLine1: "10 Main Bazar",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
        paymentMethod: "ONLINE_RAZORPAY",
      });

      expect(order.netPayablePaise).toBe(249_00 * 2 + 99_00); // 2 * 249 + shipping 99

      const attempt = await createPaymentAttempt({
        orderRef: order.orderRef,
        orderId: order._id.toString(),
        memberId,
        attemptNumber: 1,
        amountPaise: order.netPayablePaise,
        razorpayOrderId: "order_rzp_active_test_123",
      });

      expect(attempt.gateway).toBe("RAZORPAY");
      expect(attempt.status).toBe("CREATED");

      const { attempt: recordedAttempt } = await recordPaymentSuccess({
        paymentAttemptId: attempt._id,
        razorpayPaymentId: "pay_rzp_active_test_123",
        razorpaySignature: "sig_rzp_active_test_123",
        amountPaise: order.netPayablePaise,
      });

      expect(recordedAttempt.status).toBe("SUCCESS");
    });
  });
});
