import { z } from "zod";

export const storeSettingsSchema = z.object({
  rechargeCommissionSplits: z.object({
    freeTierPercent: z.coerce.number().min(0).max(100).default(40),
    freeTierCapPaise: z.coerce.number().int().min(0).default(200),
    areaTierPercent: z.coerce.number().min(0).max(100).default(60),
    chiefTierPercent: z.coerce.number().min(0).max(100).default(80),
  }),

  membership: z.object({
    qualificationStrategy: z
      .enum(["SINGLE_ORDER_THRESHOLD", "CUMULATIVE_SPEND_THRESHOLD", "KIT_OR_PIN_ONLY"])
      .default("SINGLE_ORDER_THRESHOLD"),
    areaTierThresholdPaise: z.coerce.number().int().min(0).default(200_000), // ₹2,000
    chiefTierThresholdPaise: z.coerce.number().int().min(0).default(1_000_000), // ₹10,000
    directReferralProductMarginPercent: z.coerce.number().min(0).max(100).default(10),
  }),

  jewellery: z.object({
    metalGstRateBasisPoints: z.coerce.number().int().min(0).max(5000).default(300), // 3.00%
    makingGstRateBasisPoints: z.coerce.number().int().min(0).max(5000).default(500), // 5.00%
    stoneGstRateBasisPoints: z.coerce.number().int().min(0).max(5000).default(300), // 3.00%
    goldMakingChargePerGramPaise: z.coerce.number().int().min(0).default(450_00), // ₹450.00 / gram
    silverMakingChargePerGramPaise: z.coerce.number().int().min(0).default(15_00), // ₹15.00 / gram
    quoteLockDurationMinutes: z.coerce.number().int().min(5).max(1440).default(30),
    caApprovalConfirmed: z.boolean().default(false), // STRICT FAILSAFE: schema default is false; explicit DB setting required
  }),

  cod: z.object({
    codEnabled: z.boolean().default(true),
    maxOrderAmountPaise: z.coerce.number().int().min(0).default(500_000), // Max ₹5,000.00 for COD orders
  }).default({
    codEnabled: true,
    maxOrderAmountPaise: 500_000,
  }),

  inventory: z.object({
    stockReservationDurationMinutes: z.coerce.number().int().min(5).max(120).default(15),
  }),

  luckyDraw: z.object({
    luckyDrawsEnabled: z.boolean().default(false),
    legalClearanceConfirmed: z.boolean().default(false),
  }),

  recharge: z.object({
    mockRechargeEnabled: z.boolean().default(true),
  }),

  coupons: z.object({
    freeRegistrationMiniCouponValuePaise: z.coerce.number().int().min(0).default(50_00), // ₹50.00 default pending written client confirmation
    freeRegistrationCouponValidityDays: z.coerce.number().int().min(1).default(90), // 90 days validity
  }).default({
    freeRegistrationMiniCouponValuePaise: 50_00,
    freeRegistrationCouponValidityDays: 90,
  }),

  invoice: z.object({
    isProductionReady: z.boolean().default(false), // STRICT GATE: blocks official production invoices until legal identity is verified and GST is confirmed ACTIVE
    legalEntityName: z.string().trim().default("RAJENDER SINGH"),
    tradeName: z.string().trim().default("JAI MA DURGA & COMPANY"),
    businessConstitution: z.string().trim().default("Proprietorship"),
    udyamNumber: z.string().trim().default("UDYAM-HR-17-0005563"),
    gstin: z.string().trim().default("06EXVPS0958F2ZR"),
    pan: z.string().trim().default("EXVPS0958F"),
    registeredAddress: z
      .string()
      .trim()
      .default("Ramsara Jogiwala Daiyer Road, Rampur Dhani, Sirsa, Haryana - 125055"),
    district: z.string().trim().default("Sirsa"),
    state: z.string().trim().default("Haryana"),
    stateCode: z.string().trim().default("06"),
    gstStatus: z
      .enum(["ACTIVE", "SUSPENDED", "PENDING_REACTIVATION"])
      .default("PENDING_REACTIVATION"),
    invoiceNumberPrefix: z.string().trim().default("JMD"),
    financialYear: z.string().trim().default("26-27"),
    supportEmail: z.string().trim().default("store@bhavikawelfare.org"),
    supportPhone: z.string().trim().default(""),
    hsnMappings: z.record(z.string(), z.string()).default({
      JEWELLERY_GOLD: "7113",
      JEWELLERY_SILVER: "7113",
      GROCERY: "2106",
      FASHION: "6204",
      ELECTRONICS: "8517",
      RECHARGE: "9984",
    }),
  }).default({
    isProductionReady: false,
    legalEntityName: "RAJENDER SINGH",
    tradeName: "JAI MA DURGA & COMPANY",
    businessConstitution: "Proprietorship",
    udyamNumber: "UDYAM-HR-17-0005563",
    gstin: "06EXVPS0958F2ZR",
    pan: "EXVPS0958F",
    registeredAddress: "Ramsara Jogiwala Daiyer Road, Rampur Dhani, Sirsa, Haryana - 125055",
    district: "Sirsa",
    state: "Haryana",
    stateCode: "06",
    gstStatus: "PENDING_REACTIVATION",
    invoiceNumberPrefix: "JMD",
    financialYear: "26-27",
    supportEmail: "store@bhavikawelfare.org",
    supportPhone: "",
    hsnMappings: {
      JEWELLERY_GOLD: "7113",
      JEWELLERY_SILVER: "7113",
      GROCERY: "2106",
      FASHION: "6204",
      ELECTRONICS: "8517",
      RECHARGE: "9984",
    },
  }),
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_STORE_SETTINGS: StoreSettings = storeSettingsSchema.parse({
  rechargeCommissionSplits: {},
  membership: {},
  jewellery: {},
  cod: {},
  inventory: {},
  luckyDraw: {},
  recharge: {},
  invoice: {},
});

