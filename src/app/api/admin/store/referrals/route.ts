import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  getMemberSponsorTree,
  getReferralConfig,
  updateReferralConfig,
} from "@/server/store/services/referral.service";
import {
  getPointsConfig,
  updatePointsConfig,
} from "@/server/store/services/points.service";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { z } from "zod";

const updateConfigSchema = z.object({
  referral: z
    .object({
      enabled: z.boolean().optional(),
      freeReferralRewardPaise: z.number().int().min(0).optional(),
      paidReferralRewardPaise: z.number().int().min(0).optional(),
      bonusCouponRewardPaise: z.number().int().min(0).optional(),
      issueBonusCoupon: z.boolean().optional(),
    })
    .optional(),
  points: z
    .object({
      pointsPerRupeeSpent: z.number().min(0).optional(),
      pointsToRupeeRatio: z.number().min(1).optional(),
      minPointsToRedeem: z.number().int().min(100).optional(),
      stepPoints: z.number().int().min(100).optional(),
      validityDays: z.number().int().min(1).optional(),
    })
    .optional(),
});

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");

  const url = new URL(req.url);
  const memberId = url.searchParams.get("memberId");

  if (memberId) {
    const tree = await getMemberSponsorTree(memberId);
    return ok({ tree });
  }

  // Summary statistics across store members
  const db = await getStoreDb();
  const MemberModel = getStoreMemberModel(db);

  const [totalMembers, sponsoredMembers, topReferrers] = await Promise.all([
    MemberModel.countDocuments(),
    MemberModel.countDocuments({ sponsorId: { $ne: null } }),
    MemberModel.find({ directReferralCount: { $gt: 0 } })
      .sort({ directReferralCount: -1 })
      .limit(10)
      .select("name phone memberId tier directReferralCount totalDirectSalesPaise")
      .lean(),
  ]);

  return ok({
    stats: {
      totalMembers,
      sponsoredMembers,
      organicMembers: totalMembers - sponsoredMembers,
    },
    topReferrers,
    referralConfig: getReferralConfig(),
    pointsConfig: getPointsConfig(),
  });
});

export const PATCH = handle(async (req) => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = updateConfigSchema.parse(body);

  if (parsed.referral) {
    updateReferralConfig(parsed.referral);
  }
  if (parsed.points) {
    updatePointsConfig(parsed.points);
  }

  return ok({
    message: "Referral and points configuration updated successfully.",
    referralConfig: getReferralConfig(),
    pointsConfig: getPointsConfig(),
  });
});
