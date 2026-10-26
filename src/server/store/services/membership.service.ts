import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreMembershipPlanModel,
  IStoreMembershipPlanDoc,
} from "../models/StoreMembershipPlan";
import {
  getStoreMembershipHistoryModel,
  IStoreMembershipHistoryDoc,
  MembershipTransitionType,
} from "../models/StoreMembershipHistory";
import { getStoreMemberModel, StoreMemberTier } from "../models/StoreMember";
import { DomainError } from "@/server/errors";
import { logAdminAction } from "@/server/services/audit.service";

/**
 * Default membership tier templates.
 * Reflects Section A3 of docs/OPEN_DECISIONS.md:
 * Fees default to 0 and isFeeRequired = false to strictly prevent unapproved charges.
 */
export const DEFAULT_PLANS: Array<{
  tier: StoreMemberTier;
  name: string;
  description: string;
  qualificationThresholdPaise: number;
  productDiscountPercentage: number;
  directReferralCommissionPercentage: number;
  status: "FINAL" | "DEV-CONFIRMED" | "PROPOSED";
}> = [
  {
    tier: "FREE",
    name: "Free Member",
    description: "Standard registered store member with regular retail catalogue access.",
    qualificationThresholdPaise: 0,
    productDiscountPercentage: 0,
    directReferralCommissionPercentage: 0,
    status: "FINAL",
  },
  {
    tier: "AREA",
    name: "Area Coordinator",
    description: "Active direct selling promoter earning direct product referral commissions.",
    qualificationThresholdPaise: 200000, // Proposed Rs 2,000 threshold
    productDiscountPercentage: 5,
    directReferralCommissionPercentage: 5,
    status: "DEV-CONFIRMED",
  },
  {
    tier: "CHIEF",
    name: "Chief Coordinator",
    description: "High-volume direct selling partner with maximum tier discounts and commission rates.",
    qualificationThresholdPaise: 1000000, // Proposed Rs 10,000 threshold
    productDiscountPercentage: 10,
    directReferralCommissionPercentage: 8,
    status: "PROPOSED",
  },
];

/**
 * Ensures default membership plans exist in the database.
 */
export async function ensureDefaultMembershipPlans(): Promise<void> {
  const db = await getStoreDb();
  const Plan = getStoreMembershipPlanModel(db);

  for (const def of DEFAULT_PLANS) {
    const existing = await Plan.findOne({ tier: def.tier });
    if (!existing) {
      await Plan.create({
        ...def,
        annualFeePaise: 0,
        monthlyFeePaise: 0,
        isFeeRequired: false,
        isActive: true,
      });
    }
  }
}

/**
 * Lists all active membership plans.
 */
export async function listStoreMembershipPlans(): Promise<
  IStoreMembershipPlanDoc[]
> {
  await ensureDefaultMembershipPlans();
  const db = await getStoreDb();
  const Plan = getStoreMembershipPlanModel(db);
  return Plan.find({ isActive: true }).sort({ qualificationThresholdPaise: 1 });
}

/**
 * Updates a membership plan's configuration. (Admin only)
 */
export async function updateStoreMembershipPlan(params: {
  tier: StoreMemberTier;
  qualificationThresholdPaise?: number;
  productDiscountPercentage?: number;
  directReferralCommissionPercentage?: number;
  name?: string;
  description?: string;
  isActive?: boolean;
}): Promise<IStoreMembershipPlanDoc> {
  const db = await getStoreDb();
  const Plan = getStoreMembershipPlanModel(db);

  const plan = await Plan.findOne({ tier: params.tier });
  if (!plan) {
    throw new DomainError("Plan not found.", 404, "PLAN_NOT_FOUND");
  }

  if (params.qualificationThresholdPaise !== undefined) {
    plan.qualificationThresholdPaise = params.qualificationThresholdPaise;
  }
  if (params.productDiscountPercentage !== undefined) {
    plan.productDiscountPercentage = params.productDiscountPercentage;
  }
  if (params.directReferralCommissionPercentage !== undefined) {
    plan.directReferralCommissionPercentage =
      params.directReferralCommissionPercentage;
  }
  if (params.name !== undefined) plan.name = params.name;
  if (params.description !== undefined) plan.description = params.description;
  if (params.isActive !== undefined) plan.isActive = params.isActive;

  await plan.save();
  return plan;
}

/**
 * Evaluates whether a member's completed order qualifies them for an upgrade.
 * Safeguard: Upgrades only, never degrades on a single purchase.
 */
export async function evaluateMemberTierQualification(params: {
  memberId: string | Types.ObjectId;
  orderRef: string;
  orderAmountPaise: number;
}): Promise<{
  upgraded: boolean;
  oldTier: StoreMemberTier;
  newTier: StoreMemberTier;
}> {
  const db = await getStoreDb();
  const Member = getStoreMemberModel(db);
  const Plan = getStoreMembershipPlanModel(db);
  const History = getStoreMembershipHistoryModel(db);

  const member = await Member.findById(new Types.ObjectId(params.memberId));
  if (!member) {
    return { upgraded: false, oldTier: "FREE", newTier: "FREE" };
  }

  const oldTier = member.tier;
  const newLifetimePaid = member.lifetimePaidPaise + params.orderAmountPaise;
  const newHighestOrder = Math.max(
    member.highestSingleOrderPaise,
    params.orderAmountPaise,
  );

  member.lifetimePaidPaise = newLifetimePaid;
  member.highestSingleOrderPaise = newHighestOrder;

  // Determine highest qualified tier based on cumulative spend
  const plans = await Plan.find({ isActive: true }).sort({
    qualificationThresholdPaise: -1,
  });

  let targetTier: StoreMemberTier = oldTier;
  for (const plan of plans) {
    if (newLifetimePaid >= plan.qualificationThresholdPaise) {
      // Check tier hierarchy: CHIEF > AREA > FREE
      const tierRank: Record<StoreMemberTier, number> = {
        FREE: 1,
        AREA: 2,
        CHIEF: 3,
      };
      if (tierRank[plan.tier] > tierRank[targetTier]) {
        targetTier = plan.tier;
        break;
      }
    }
  }

  if (targetTier !== oldTier) {
    member.tier = targetTier;
    await member.save();

    await History.create({
      memberId: member._id,
      fromTier: oldTier,
      toTier: targetTier,
      transitionType: "UPGRADE",
      reason: `Automated qualification via order ${params.orderRef} (cumulative spend: ₹${(newLifetimePaid / 100).toFixed(2)})`,
      orderRef: params.orderRef,
      effectiveAt: new Date(),
    });

    return { upgraded: true, oldTier, newTier: targetTier };
  }

  await member.save();
  return { upgraded: false, oldTier, newTier: oldTier };
}

/**
 * Manually changes a member's tier (Store Admin operation).
 * Audited to both StoreMembershipHistory and AdminAuditLog.
 */
export async function adminChangeMemberTier(params: {
  memberId: string | Types.ObjectId;
  targetTier: StoreMemberTier;
  adminId: string;
  reason: string;
}): Promise<IStoreMembershipHistoryDoc> {
  const db = await getStoreDb();
  const Member = getStoreMemberModel(db);
  const History = getStoreMembershipHistoryModel(db);

  const member = await Member.findById(new Types.ObjectId(params.memberId));
  if (!member) {
    throw new DomainError("Member not found.", 404, "MEMBER_NOT_FOUND");
  }

  const fromTier = member.tier;
  if (fromTier === params.targetTier) {
    throw new DomainError(
      `Member is already in tier ${params.targetTier}.`,
      400,
      "NO_CHANGE",
    );
  }

  const transitionType: MembershipTransitionType =
    params.targetTier === "FREE" ? "DOWNGRADE" : "ADMIN_OVERRIDE";

  member.tier = params.targetTier;
  await member.save();

  const history = await History.create({
    memberId: member._id,
    fromTier,
    toTier: params.targetTier,
    transitionType,
    reason: params.reason,
    adminId: params.adminId,
    effectiveAt: new Date(),
  });

  // Dual audit: record in append-only NGO AdminAuditLog
  await logAdminAction(params.adminId, "STORE_MEMBER_TIER_OVERRIDE", {
    targetType: "STORE_MEMBER",
    targetId: member._id.toString(),
    reason: params.reason,
    meta: {
      fromTier,
      toTier: params.targetTier,
      historyId: history._id.toString(),
    },
  });

  return history;
}

/**
 * Retrieves the full membership profile and transition history for a member.
 */
export async function getMemberMembershipDetails(
  memberId: string | Types.ObjectId,
): Promise<{
  member: {
    id: string;
    memberId: string;
    tier: StoreMemberTier;
    lifetimePaidRupees: number;
    highestOrderRupees: number;
    sponsorId: string | null;
  };
  history: Array<{
    id: string;
    fromTier: StoreMemberTier;
    toTier: StoreMemberTier;
    transitionType: string;
    reason: string;
    orderRef: string | null;
    effectiveAt: Date;
  }>;
}> {
  const db = await getStoreDb();
  const Member = getStoreMemberModel(db);
  const History = getStoreMembershipHistoryModel(db);

  const member = await Member.findById(new Types.ObjectId(memberId));
  if (!member) {
    throw new DomainError("Member not found.", 404, "MEMBER_NOT_FOUND");
  }

  const history = await History.find({ memberId: member._id }).sort({
    createdAt: -1,
  });

  return {
    member: {
      id: member._id.toString(),
      memberId: member.memberId,
      tier: member.tier,
      lifetimePaidRupees: member.lifetimePaidPaise / 100,
      highestOrderRupees: member.highestSingleOrderPaise / 100,
      sponsorId: member.sponsorId,
    },
    history: history.map((h) => ({
      id: h._id.toString(),
      fromTier: h.fromTier,
      toTier: h.toTier,
      transitionType: h.transitionType,
      reason: h.reason,
      orderRef: h.orderRef,
      effectiveAt: h.effectiveAt,
    })),
  };
}
