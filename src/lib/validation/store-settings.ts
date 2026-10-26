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
    quoteLockDurationMinutes: z.coerce.number().int().min(5).max(1440).default(30),
    caApprovalConfirmed: z.boolean().default(false), // Awaiting written confirmation from Chartered Accountant
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
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_STORE_SETTINGS: StoreSettings = storeSettingsSchema.parse({
  rechargeCommissionSplits: {},
  membership: {},
  jewellery: {},
  inventory: {},
  luckyDraw: {},
  recharge: {},
});
