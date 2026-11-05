import { handle, ok } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  listStorePromotionalPlans,
  purchasePromotionalPlan,
} from "@/server/store/services/promotional-plan.service";
import { z } from "zod";

export const runtime = "nodejs";

const purchaseSchema = z.object({
  planCode: z.string().min(1),
  paymentRef: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

export const GET = handle(async () => {
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
      isPurchaseActive: p.isPurchaseActive,
      validityDays: p.validityDays,
      maxPurchasesPerMember: p.maxPurchasesPerMember,
    })),
  });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = purchaseSchema.parse(body);

  const result = await purchasePromotionalPlan({
    memberId: session.memberId,
    planCode: parsed.planCode,
    paymentRef: parsed.paymentRef,
    idempotencyKey: parsed.idempotencyKey,
  });

  return ok({
    message: `Plan ${result.plan.name} purchased successfully! Granted ₹${result.walletCreditPaise / 100} product wallet credit and ${result.couponsIssuedCount} Super Coupons.`,
    ...result,
  });
});
