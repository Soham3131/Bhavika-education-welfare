import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listStorePromotionalPlans,
  updateStorePromotionalPlan,
} from "@/server/store/services/promotional-plan.service";
import { z } from "zod";

export const runtime = "nodejs";

const updatePromotionalPlanSchema = z.object({
  planCode: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  priceRupees: z.number().min(0).optional(),
  productWalletBenefitRupees: z.number().min(0).optional(),
  superCouponCount: z.number().min(0).optional(),
  superCouponType: z.enum(["SUPER", "STANDARD", "MINI"]).optional(),
  superCouponFaceValueRupees: z.number().min(0).optional(),
  pointsReward: z.number().min(0).optional(),
  commissionEligible: z.boolean().optional(),
  directCommissionPercentage: z.number().min(0).max(100).optional(),
  isPurchaseActive: z.boolean().optional(),
  validityDays: z.number().min(1).optional(),
  maxPurchasesPerMember: z.number().min(1).optional(),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const plans = await listStorePromotionalPlans();
  return ok({
    plans: plans.map((p) => ({
      planCode: p.planCode,
      name: p.name,
      description: p.description,
      priceRupees: p.pricePaise / 100,
      productWalletBenefitRupees: p.productWalletBenefitPaise / 100,
      superCouponCount: p.superCouponCount,
      superCouponType: p.superCouponType,
      superCouponFaceValueRupees: p.superCouponFaceValuePaise / 100,
      pointsReward: p.pointsReward,
      commissionEligible: p.commissionEligible,
      directCommissionPercentage: p.directCommissionPercentage,
      isPurchaseActive: p.isPurchaseActive,
      validityDays: p.validityDays,
      maxPurchasesPerMember: p.maxPurchasesPerMember,
    })),
  });
});

export const PATCH = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = updatePromotionalPlanSchema.parse(body);

  const updated = await updateStorePromotionalPlan({
    adminId: admin.id,
    planCode: parsed.planCode,
    name: parsed.name,
    description: parsed.description,
    pricePaise:
      parsed.priceRupees !== undefined
        ? Math.round(parsed.priceRupees * 100)
        : undefined,
    productWalletBenefitPaise:
      parsed.productWalletBenefitRupees !== undefined
        ? Math.round(parsed.productWalletBenefitRupees * 100)
        : undefined,
    superCouponCount: parsed.superCouponCount,
    superCouponType: parsed.superCouponType,
    superCouponFaceValuePaise:
      parsed.superCouponFaceValueRupees !== undefined
        ? Math.round(parsed.superCouponFaceValueRupees * 100)
        : undefined,
    pointsReward: parsed.pointsReward,
    commissionEligible: parsed.commissionEligible,
    directCommissionPercentage: parsed.directCommissionPercentage,
    isPurchaseActive: parsed.isPurchaseActive,
    validityDays: parsed.validityDays,
    maxPurchasesPerMember: parsed.maxPurchasesPerMember,
  });

  return ok({
    message: `Plan ${updated.name} configuration updated successfully.`,
    plan: {
      planCode: updated.planCode,
      name: updated.name,
      priceRupees: updated.pricePaise / 100,
      productWalletBenefitRupees: updated.productWalletBenefitPaise / 100,
      superCouponCount: updated.superCouponCount,
      isPurchaseActive: updated.isPurchaseActive,
    },
  });
});
