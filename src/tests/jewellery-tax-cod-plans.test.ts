import { describe, it, expect, beforeEach } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import {
  calculateJewelleryPrice,
  updateBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import {
  calculateCart,
} from "@/server/store/services/cart.service";
import {
  createStoreOrder,
  confirmCodPayment,
} from "@/server/store/services/order.service";
import {
  registerStoreMember,
} from "@/server/store/services/member.service";
import {
  getStoreProductModel,
  getStoreCategoryModel,
} from "@/server/store/models";
import {
  updateStoreSettings,
} from "@/server/store/services/settings.service";
import {
  listStorePromotionalPlans,
  updateStorePromotionalPlan,
  purchasePromotionalPlan,
} from "@/server/store/services/promotional-plan.service";
import {
  getOrCreateStoreWallet,
} from "@/server/store/services/wallet-ledger.service";
import {
  generateOrderTaxInvoicePdf,
  getOrAllocateInvoiceNumber,
} from "@/server/store/services/tax-invoice-pdf.service";
import { Types } from "mongoose";
import { IStoreCategoryDoc } from "@/server/store/models/StoreCategory";
import { IStoreProductDoc } from "@/server/store/models/StoreProduct";

describe("Jewellery Pricing, CA-Approved GST, COD, and Promotional Plans", () => {
  let memberId: Types.ObjectId;
  let goldCategory: IStoreCategoryDoc;
  let goldRingProduct: IStoreProductDoc;

  beforeEach(async () => {
    const conn = await getStoreDb();
    const collections = conn.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }

    await updateBullionRates({
      adminId: memberId,
      goldRatePerGramPaise: 7500_00,
      silverRatePerGramPaise: 95_00,
    });

    // Set default approved settings: 3% metal GST, 5% making GST, 3% stone GST, CA approval confirmed, COD enabled
    await updateStoreSettings({
      jewellery: {
        goldMakingChargePerGramPaise: 450_00, // ₹450/g
        silverMakingChargePerGramPaise: 15_00, // ₹15/g
        quoteLockDurationMinutes: 30,
        metalGstRateBasisPoints: 300, // 3%
        makingGstRateBasisPoints: 500, // 5%
        stoneGstRateBasisPoints: 300, // 3%
        caApprovalConfirmed: true,
      },
      cod: {
        codEnabled: true,
        maxOrderAmountPaise: 5000_00, // ₹5,000 max COD
      },
    });

    // Register a test member
    const member = await registerStoreMember({
      name: "Radha Verma",
      phone: "9876543299",
      email: "radha@example.com",
      password: "Password123!",
    });
    memberId = member._id;

    // Create jewellery categories
    const CatModel = getStoreCategoryModel(conn);
    goldCategory = await CatModel.create({
      name: "Gold Jewellery",
      slug: "gold-jewellery",
      type: "JEWELLERY_GOLD",
      isActive: true,
    });
    await CatModel.create({
      name: "Silver Jewellery",
      slug: "silver-jewellery",
      type: "JEWELLERY_SILVER",
      isActive: true,
    });

    // Create a Gold Ring product (10g gross weight, 0.5g stone weight, stone charge ₹1,000)
    const ProdModel = getStoreProductModel(conn);
    goldRingProduct = await ProdModel.create({
      sku: "JMD-GLD-RNG-01",
      title: "22K Traditional Gold Ring",
      slug: "traditional-gold-ring",
      category: goldCategory._id,
      basePricePaise: 50000_00, // Static catalog base price
      stock: 10,
      reservedStock: 0,
      isActive: true,
      attributes: {
        metalType: "GOLD",
        grossWeightGrams: 10.0,
        netWeightGrams: 9.5,
        stoneWeightGrams: 0.5,
        stoneChargePaise: 1000_00, // ₹1,000 stone charge
        purity: "22K",
      },
    });
  });

  describe("1. Authoritative Jewellery Pricing & CA-Approved GST", () => {
    it("calculates 10g gold item with 3% metal GST, 5% making GST, and 3% stone GST correctly", async () => {
      // 10g gross, 0.5g stone -> 9.5g net gold
      // Gold rate = ₹7,500/g (750000 paise/g)
      // Metal Value = 9.5 * 750000 = 7,125,000 paise (₹71,250.00)
      // Making charge = 10g * ₹450 = 4,500.00 = 450,000 paise
      // Stone charge = ₹1,000.00 = 100,000 paise
      // Subtotal before GST = 7125000 + 450000 + 100000 = 7,675,000 paise (₹76,750.00)
      // Metal GST (3%) = Math.round(7125000 * 0.03) = 213,750 paise (₹2,137.50)
      // Making GST (5%) = Math.round(450000 * 0.05) = 22,500 paise (₹225.00)
      // Stone GST (3%) = Math.round(100000 * 0.03) = 3,000 paise (₹30.00)  <-- VERIFY BUG FIX
      // Raw GST = 213750 + 22500 + 3000 = 239,250 paise
      // Unrounded total = 7675000 + 239250 = 7,914,250 paise
      // Half-up to nearest rupee = 7,914,300 paise (₹79,143.00)
      // Rounded Total GST = 7914300 - 7675000 = 239,300 paise (₹2,393.00)

      const quote = await calculateJewelleryPrice({
        metalType: "GOLD",
        grossWeightGrams: 10.0,
        stoneWeightGrams: 0.5,
        stoneChargePaise: 1000_00,
      });

      expect(quote.metalType).toBe("GOLD");
      expect(quote.grossWeightGrams).toBe(10.0);
      expect(quote.netWeightGrams).toBe(9.5);
      expect(quote.metalValuePaise).toBe(71250_00);
      expect(quote.makingChargesPaise).toBe(4500_00);
      expect(quote.stoneChargePaise).toBe(1000_00);
      expect(quote.subtotalBeforeGstPaise).toBe(76750_00);

      // Verify GST breakdown components
      expect(quote.metalGstPaise).toBe(213750);
      expect(quote.makingGstPaise).toBe(22500);
      expect(quote.stoneGstPaise).toBe(3000); // Stone GST is included!

      // Total GST and total rounded to nearest rupee
      expect(quote.totalPricePaise).toBe(79143_00);
      expect(quote.totalPriceRupees).toBe(79143);
      expect(quote.caApprovalConfirmed).toBe(true);
      expect(quote.pricingStatus).toBe("APPROVED_FINAL_PRICE");
    });

    it("calculates silver pricing with separate silver making charges (₹15/g) and 3% metal GST", async () => {
      // 50g Silver Pooja Bowl, 0 stone
      // Silver rate = ₹95/g (9500 paise/g)
      // Metal Value = 50 * 9500 = 475,000 paise (₹4,750.00)
      // Making charge = 50g * ₹15 = 750.00 = 75,000 paise (silver default is ₹15/g)
      // Stone charge = 0
      // Subtotal before GST = 475000 + 75000 = 550,000 paise (₹5,500.00)
      // Metal GST (3%) = Math.round(475000 * 0.03) = 14,250 paise
      // Making GST (5%) = Math.round(75000 * 0.05) = 3,750 paise
      // Stone GST (3%) = 0
      // Raw GST = 18,000 paise
      // Total price = 550,000 + 18,000 = 568,000 paise (₹5,680.00)

      const quote = await calculateJewelleryPrice({
        metalType: "SILVER",
        grossWeightGrams: 50.0,
      });

      expect(quote.metalType).toBe("SILVER");
      expect(quote.metalValuePaise).toBe(4750_00);
      expect(quote.makingChargesPaise).toBe(750_00);
      expect(quote.metalGstPaise).toBe(14250);
      expect(quote.makingGstPaise).toBe(3750);
      expect(quote.stoneGstPaise).toBe(0);
      expect(quote.totalGstPaise).toBe(180_00);
      expect(quote.totalPricePaise).toBe(5680_00);
      expect(quote.totalPriceRupees).toBe(5680);
    });

    it("dynamically updates quotes when bullion rates change", async () => {
      // Update gold rate to ₹8,000/g
      await updateBullionRates({
        adminId: memberId,
        goldRatePerGramPaise: 8000_00,
        silverRatePerGramPaise: 100_00,
      });

      const updatedQuote = await calculateJewelleryPrice({
        metalType: "GOLD",
        grossWeightGrams: 10.0,
        stoneWeightGrams: 0,
      });

      // 10g * 8000 = ₹80,000 (8000000 paise)
      expect(updatedQuote.metalValuePaise).toBe(80000_00);
    });
  });

  describe("2. Cart & Dynamic Jewellery Quotation Integration", () => {
    it("connects dynamic jewellery pricing to cart and computes authoritative GST (not 0)", async () => {
      const cart = await calculateCart([{ productId: goldRingProduct._id, quantity: 1 }]);
      expect(cart.items.length).toBe(1);
      const cartItem = cart.items[0];

      // Cart item price is derived from dynamic bullion quote
      expect(cartItem.unitPricePaise).toBeGreaterThan(70000_00);
      expect(cart.taxPaise).toBeGreaterThan(0); // Tax is NOT hardcoded to 0
      expect(cart.taxPaise).toBe(cartItem.taxPaise);

      // Cart gross total = items total + tax + shipping
      expect(cart.totalPayablePaise).toBe(
        cart.itemsTotalPaise + cart.taxPaise + cart.shippingFeePaise,
      );
    });

    it("rejects unapproved checkout if CA approval is revoked", async () => {
      // Revoke CA approval temporarily to test safety gate
      await updateStoreSettings({
        jewellery: {
          caApprovalConfirmed: false,
        },
      });

      await expect(
        createStoreOrder({
          memberId,
          items: [{ productId: goldRingProduct._id, quantity: 1 }],
          shippingAddress: {
            fullName: "Radha Verma",
            phone: "9876543299",
            addressLine1: "123 Golden Lane",
            city: "New Delhi",
            state: "Delhi",
            postalCode: "110001",
            country: "India",
          },
        }),
      ).rejects.toThrow(/Chartered Accountant confirmation|JEWELLERY_TAX_APPROVAL_PENDING/);

      // Re-enable CA approval
      await updateStoreSettings({
        jewellery: {
          caApprovalConfirmed: true,
        },
      });
    });

    it("creates jewellery order with authoritative GST and payment amount matching server quotation", async () => {
      const cart = await calculateCart([{ productId: goldRingProduct._id, quantity: 1 }]);

      const orderResult = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Verma",
          phone: "9876543299",
          addressLine1: "123 Golden Lane",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(orderResult).toBeDefined();
      expect(orderResult.taxPaise).toBe(cart.taxPaise);
      expect(orderResult.itemsTotalPaise).toBe(cart.itemsTotalPaise);
      expect(orderResult.netPayablePaise).toBe(cart.totalPayablePaise);
      expect(orderResult.items[0].taxPaise).toBe(cart.taxPaise);
    });
  });

  describe("3. Cash-on-Delivery (COD) Order Flow", () => {
    it("creates COD order in PROCESSING status with PENDING payment, and restricts order amount", async () => {
      // Create non-jewellery product within COD limit
      const conn = await getStoreDb();
      const ProdModel = getStoreProductModel(conn);
      const CatModel = getStoreCategoryModel(conn);
      const apparelCat = await CatModel.create({
        name: "Apparel",
        slug: "apparel",
        type: "FASHION",
        isActive: true,
      });

      const silkSaree = await ProdModel.create({
        sku: "JMD-SAR-01",
        title: "Kanjivaram Silk Saree",
        slug: "kanjivaram-silk-saree",
        category: apparelCat._id,
        basePricePaise: 2500_00, // ₹2,500.00
        stock: 5,
        reservedStock: 0,
        isActive: true,
      });

      const orderResult = await createStoreOrder({
        memberId,
        items: [{ productId: silkSaree._id, quantity: 1 }],
        paymentMethod: "COD",
        shippingAddress: {
          fullName: "Radha Verma",
          phone: "9876543299",
          addressLine1: "123 Golden Lane",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(orderResult.paymentMethod).toBe("COD");
      expect(orderResult.status).toBe("PROCESSING");
      expect(orderResult.paymentStatus).toBe("PENDING");

      // Admin confirms cash collection upon delivery
      const confirmedOrder = await confirmCodPayment({
        orderRef: orderResult.orderRef,
        adminId: memberId,
      });

      expect(confirmedOrder.paymentStatus).toBe("CAPTURED");
      expect(confirmedOrder.status).toBe("DELIVERED");
      expect(confirmedOrder.paidCashPaise).toBe(confirmedOrder.netPayablePaise);
    });
  });

  describe("4. Priority 2: Promotional Membership Plans (Plan 1 & Plan 2)", () => {
    it("lists Plan 1 (₹850) and Plan 2 (₹1,500) with configured benefits", async () => {
      const plans = await listStorePromotionalPlans();
      expect(plans.length).toBeGreaterThanOrEqual(2);

      const plan1 = plans.find((p) => p.planCode === "PLAN_850");
      expect(plan1).toBeDefined();
      expect(plan1?.pricePaise).toBe(850_00);
      expect(plan1?.productWalletBenefitPaise).toBe(1000_00); // ₹1,000 wallet credit
      expect(plan1?.superCouponCount).toBe(2);
      expect(plan1?.superCouponType).toBe("SUPER");
      expect(plan1?.isPurchaseActive).toBe(false); // Gated pending client business rule signoff

      const plan2 = plans.find((p) => p.planCode === "PLAN_1500");
      expect(plan2).toBeDefined();
      expect(plan2?.pricePaise).toBe(1500_00);
      expect(plan2?.productWalletBenefitPaise).toBe(2000_00); // ₹2,000 wallet credit
      expect(plan2?.superCouponCount).toBe(5);
      expect(plan2?.superCouponType).toBe("SUPER");
    });

    it("prevents purchase while isPurchaseActive is false, and allows purchase when activated", async () => {
      // 1. Must fail when locked
      await expect(
        purchasePromotionalPlan({
          memberId,
          planCode: "PLAN_850",
          paymentRef: "PAY-TEST-001",
          idempotencyKey: "promo-buy-key-1",
        }),
      ).rejects.toThrow(/locked pending client confirmation|PLAN_PURCHASE_LOCKED/);

      // 2. Admin activates Plan 1
      await updateStorePromotionalPlan({
        adminId: memberId,
        planCode: "PLAN_850",
        isPurchaseActive: true,
      });

      // 3. Member purchases Plan 1
      const result = await purchasePromotionalPlan({
        memberId,
        planCode: "PLAN_850",
        paymentRef: "PAY-TEST-001",
        idempotencyKey: "promo-buy-key-1",
      });

      expect(result.success).toBe(true);
      expect(result.isReplay).toBe(false);
      expect(result.walletCreditPaise).toBe(1000_00);
      expect(result.couponsIssuedCount).toBe(2);
      expect(result.couponCodes.length).toBe(2);

      // Check member wallet balance
      const wallet = await getOrCreateStoreWallet(memberId);
      expect(wallet.addMoneyPaise).toBe(1000_00); // Product wallet credited ₹1,000

      // 4. Test Idempotency: repeated call with identical idempotencyKey returns existing outcome without duplicate credits
      const replay = await purchasePromotionalPlan({
        memberId,
        planCode: "PLAN_850",
        paymentRef: "PAY-TEST-001",
        idempotencyKey: "promo-buy-key-1",
      });

      expect(replay.isReplay).toBe(true);
      const walletAfterReplay = await getOrCreateStoreWallet(memberId);
      expect(walletAfterReplay.addMoneyPaise).toBe(1000_00); // Balance NOT doubled!
    });
  });

  describe("5. GST Tax Invoice Generation", () => {
    it("generates a valid PDF document with order, tax breakdown, and seller details", async () => {
      const orderResult = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Radha Verma",
          phone: "9876543299",
          addressLine1: "123 Golden Lane",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const pdfBytes = await generateOrderTaxInvoicePdf(orderResult);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000); // Genuine PDF content

      // First 4 bytes of any valid PDF is '%PDF'
      const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 4));
      expect(pdfHeader).toBe("%PDF");
    });

    it("allows multiple orders without allocated invoice numbers without null collisions", async () => {
      const orderA = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Customer A",
          phone: "9876543291",
          addressLine1: "Address A",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const orderB = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Customer B",
          phone: "9876543292",
          addressLine1: "Address B",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const orderC = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Customer C",
          phone: "9876543293",
          addressLine1: "Address C",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      expect(orderA.invoiceNumber).toBeFalsy();
      expect(orderB.invoiceNumber).toBeFalsy();
      expect(orderC.invoiceNumber).toBeFalsy();
    });

    it("allocates sequential invoice numbers safely across distinct orders", async () => {
      const order1 = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Sequential User 1",
          phone: "9876543294",
          addressLine1: "Address 1",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const order2 = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Sequential User 2",
          phone: "9876543295",
          addressLine1: "Address 2",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const num1 = await getOrAllocateInvoiceNumber(order1);
      const num2 = await getOrAllocateInvoiceNumber(order2);

      expect(num1).toMatch(/^JMD\/26-27\/\d{5}$/);
      expect(num2).toMatch(/^JMD\/26-27\/\d{5}$/);
      expect(num1).not.toBe(num2);

      const seq1 = parseInt(num1.split("/")[2], 10);
      const seq2 = parseInt(num2.split("/")[2], 10);
      expect(seq2).toBe(seq1 + 1);
    });

    it("guarantees idempotent invoice allocation and prevents duplicate issuance for the same order", async () => {
      const order = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Idempotency User",
          phone: "9876543296",
          addressLine1: "Address Idempotent",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const firstAlloc = await getOrAllocateInvoiceNumber(order);
      const secondAlloc = await getOrAllocateInvoiceNumber(order);

      expect(firstAlloc).toBe(secondAlloc);
      expect(order.invoiceNumber).toBe(firstAlloc);
    });

    it("safely handles concurrent invoice allocation without duplicate key collisions", async () => {
      const orderX = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Concurrent X",
          phone: "9876543297",
          addressLine1: "Address X",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const orderY = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Concurrent Y",
          phone: "9876543298",
          addressLine1: "Address Y",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const orderZ = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Concurrent Z",
          phone: "9876543299",
          addressLine1: "Address Z",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const [numX, numY, numZ] = await Promise.all([
        getOrAllocateInvoiceNumber(orderX),
        getOrAllocateInvoiceNumber(orderY),
        getOrAllocateInvoiceNumber(orderZ),
      ]);

      const numbers = new Set([numX, numY, numZ]);
      expect(numbers.size).toBe(3); // All three must be unique

      // Also test multiple concurrent calls on the SAME order
      const singleOrder = await createStoreOrder({
        memberId,
        items: [{ productId: goldRingProduct._id, quantity: 1 }],
        shippingAddress: {
          fullName: "Same Order Concurrent",
          phone: "9876543200",
          addressLine1: "Address Single",
          city: "New Delhi",
          state: "Delhi",
          postalCode: "110001",
          country: "India",
        },
      });

      const [res1, res2, res3] = await Promise.all([
        getOrAllocateInvoiceNumber(singleOrder),
        getOrAllocateInvoiceNumber(singleOrder),
        getOrAllocateInvoiceNumber(singleOrder),
      ]);

      expect(res1).toBe(res2);
      expect(res2).toBe(res3);
    });
  });
});
