import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listStoreMembershipPlans,
  updateStoreMembershipPlan,
  adminChangeMemberTier,
  getMemberMembershipDetails,
} from "@/server/store/services/membership.service";
import { StoreMemberTier } from "@/server/store/models/StoreMember";
import { z } from "zod";

export const runtime = "nodejs";

const updatePlanSchema = z.object({
  tier: z.enum(["FREE", "AREA", "CHIEF"]),
  qualificationThresholdRupees: z.number().min(0).optional(),
  productDiscountPercentage: z.number().min(0).max(100).optional(),
  directReferralCommissionPercentage: z.number().min(0).max(100).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const memberTierOverrideSchema = z.object({
  memberId: z.string().min(1),
  targetTier: z.enum(["FREE", "AREA", "CHIEF"]),
  reason: z.string().min(3),
});

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_CATALOGUE_VIEW");
  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId");

  if (memberId) {
    const details = await getMemberMembershipDetails(memberId);
    return ok(details);
  }

  const plans = await listStoreMembershipPlans();
  return ok({
    plans: plans.map((p) => ({
      tier: p.tier,
      name: p.name,
      description: p.description,
      annualFeeRupees: p.annualFeePaise / 100,
      monthlyFeeRupees: p.monthlyFeePaise / 100,
      isFeeRequired: p.isFeeRequired,
      qualificationThresholdRupees: p.qualificationThresholdPaise / 100,
      productDiscountPercentage: p.productDiscountPercentage,
      directReferralCommissionPercentage: p.directReferralCommissionPercentage,
      status: p.status,
      isActive: p.isActive,
    })),
  });
});

export const PATCH = handle(async (req) => {
  const body = await req.json();
  const parsed = updatePlanSchema.parse(body);

  await requireStoreAdmin("STORE_CATALOGUE_MANAGE", {
    action: "STORE_MEMBERSHIP_PLAN_UPDATE",
    targetType: "STORE_MEMBERSHIP_PLAN",
    meta: {
      tier: parsed.tier,
      discount: parsed.productDiscountPercentage,
      commission: parsed.directReferralCommissionPercentage,
    },
  });

  const updated = await updateStoreMembershipPlan({
    tier: parsed.tier as StoreMemberTier,
    qualificationThresholdPaise:
      parsed.qualificationThresholdRupees !== undefined
        ? Math.round(parsed.qualificationThresholdRupees * 100)
        : undefined,
    productDiscountPercentage: parsed.productDiscountPercentage,
    directReferralCommissionPercentage:
      parsed.directReferralCommissionPercentage,
    name: parsed.name,
    description: parsed.description,
    isActive: parsed.isActive,
  });

  return ok({
    success: true,
    plan: {
      tier: updated.tier,
      name: updated.name,
      qualificationThresholdRupees: updated.qualificationThresholdPaise / 100,
      productDiscountPercentage: updated.productDiscountPercentage,
      directReferralCommissionPercentage:
        updated.directReferralCommissionPercentage,
      status: updated.status,
      isActive: updated.isActive,
    },
  });
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = memberTierOverrideSchema.parse(body);

  const admin = await requireStoreAdmin("STORE_ORDER_MANAGE", {
    action: "STORE_MEMBER_TIER_OVERRIDE",
    targetType: "STORE_MEMBER",
    targetId: parsed.memberId,
    reason: parsed.reason,
    meta: { targetTier: parsed.targetTier },
  });

  const history = await adminChangeMemberTier({
    memberId: parsed.memberId,
    targetTier: parsed.targetTier as StoreMemberTier,
    adminId: admin.id,
    reason: parsed.reason,
  });

  return ok({
    success: true,
    historyId: history._id.toString(),
    fromTier: history.fromTier,
    toTier: history.toTier,
    transitionType: history.transitionType,
  });
});
