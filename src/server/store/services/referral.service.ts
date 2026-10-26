import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreMemberModel } from "../models/StoreMember";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { StoreWalletType } from "../models/StoreWalletLedger";
import { issueStoreCoupon } from "./store-coupon.service";
import { StoreCouponSource } from "../models/StoreCoupon";
import { DomainError } from "@/server/errors";

export interface ReferralConfig {
  enabled: boolean;
  freeReferralRewardPaise: number; // e.g. 5,000 paise (₹50)
  paidReferralRewardPaise: number; // e.g. 10,000 paise (₹100)
  bonusCouponRewardPaise: number;  // e.g. 5,000 paise (₹50 bonus coupon)
  issueBonusCoupon: boolean;
}

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  enabled: false, // Recruitment/enrolment financial bonuses strictly disabled under Consumer Protection (Direct Selling) Rules, 2021
  freeReferralRewardPaise: 0,
  paidReferralRewardPaise: 0,
  bonusCouponRewardPaise: 0,
  issueBonusCoupon: false,
};

let currentReferralConfig: ReferralConfig = { ...DEFAULT_REFERRAL_CONFIG };

export function getReferralConfig(): ReferralConfig {
  return { ...currentReferralConfig };
}

export function updateReferralConfig(newConfig: Partial<ReferralConfig>): ReferralConfig {
  currentReferralConfig = { ...currentReferralConfig, ...newConfig };
  return { ...currentReferralConfig };
}

/**
 * Processes a referral reward for a sponsor when their referred downline member
 * completes registration or qualifies on an order.
 * Strictly guarantees exactly-once payout via idempotent ledger transactions.
 */
export async function processStoreReferralReward(input: {
  sponsorMemberId: string | Types.ObjectId;
  referredMemberId: string | Types.ObjectId;
  eventRef?: string;
}): Promise<{
  rewarded: boolean;
  walletType?: StoreWalletType;
  amountPaise?: number;
  bonusCouponCode?: string;
  isReplay?: boolean;
}> {
  if (!currentReferralConfig.enabled) {
    return { rewarded: false };
  }

  const sponsorObjectId =
    typeof input.sponsorMemberId === "string"
      ? new Types.ObjectId(input.sponsorMemberId)
      : input.sponsorMemberId;

  const referredObjectId =
    typeof input.referredMemberId === "string"
      ? new Types.ObjectId(input.referredMemberId)
      : input.referredMemberId;

  const idempotencyKey = `ref-reward:${sponsorObjectId.toString()}:${referredObjectId.toString()}`;

  const db = await getStoreDb();
  const MemberModel = getStoreMemberModel(db);

  // 1. Fetch sponsor and referred member
  const [sponsor, referred] = await Promise.all([
    MemberModel.findById(sponsorObjectId),
    MemberModel.findById(referredObjectId),
  ]);

  if (!sponsor || !referred) {
    throw new DomainError("Sponsor or referred member not found.", 404, "MEMBER_NOT_FOUND");
  }

  // 2. Determine wallet segregation: FREE vs PAID referral wallet
  const isPaidTier = sponsor.tier === "AREA" || sponsor.tier === "CHIEF";
  const walletType: StoreWalletType = isPaidTier
    ? "PAID_REFERRAL"
    : "FREE_REFERRAL";

  const rewardAmountPaise = isPaidTier
    ? currentReferralConfig.paidReferralRewardPaise
    : currentReferralConfig.freeReferralRewardPaise;

  // 3. Mutate wallet atomically via standard ledger engine
  const mutateRes = await mutateStoreWallet({
    memberId: sponsorObjectId,
    walletType,
    type: "CREDIT",
    unit: "INR_PAISE",
    amountPaise: rewardAmountPaise,
    referenceType: "REFERRAL_COMMISSION",
    referenceId: referred.memberId,
    idempotencyKey,
    description: `Referral reward for introducing member ${referred.memberId} (${referred.name})`,
  });

  if (mutateRes.isReplay) {
    return {
      rewarded: true,
      walletType,
      amountPaise: rewardAmountPaise,
      isReplay: true,
    };
  }

  // 4. Increment sponsor's referral counter
  sponsor.directReferralCount = (sponsor.directReferralCount ?? 0) + 1;
  await sponsor.save();

  // 5. Optional: issue REFERRAL_REWARD native coupon if configured
  let bonusCouponCode: string | undefined;
  if (currentReferralConfig.issueBonusCoupon && currentReferralConfig.bonusCouponRewardPaise > 0) {
    const coupon = await issueStoreCoupon({
      memberId: sponsorObjectId,
      faceValuePaise: currentReferralConfig.bonusCouponRewardPaise,
      source: StoreCouponSource.REFERRAL_REWARD,
      sourceRef: idempotencyKey,
      validityDays: 90,
      isEligibleForDraw: true,
      metadata: {
        referredMemberId: referred.memberId,
      },
    });
    bonusCouponCode = coupon.couponCode;
  }

  return {
    rewarded: true,
    walletType,
    amountPaise: rewardAmountPaise,
    bonusCouponCode,
    isReplay: false,
  };
}

/**
 * Retrieves the sponsor tree and direct referrals for a store member.
 */
export async function getMemberSponsorTree(memberId: string | Types.ObjectId): Promise<{
  member: {
    memberId: string;
    name: string;
    tier: string;
    sponsorId?: string | null;
  };
  sponsor: {
    memberId: string;
    name: string;
    tier: string;
  } | null;
  directReferrals: Array<{
    memberId: string;
    name: string;
    tier: string;
    joinedAt: Date;
    directSalesPaise: number;
  }>;
  summary: {
    totalDirect: number;
    freeCount: number;
    areaCount: number;
    chiefCount: number;
  };
}> {
  const db = await getStoreDb();
  const MemberModel = getStoreMemberModel(db);
  const memberObjectId =
    typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;

  const member = await MemberModel.findById(memberObjectId).lean();
  if (!member) {
    throw new DomainError("Member not found.", 404, "MEMBER_NOT_FOUND");
  }

  // Fetch sponsor if present
  let sponsorInfo: { memberId: string; name: string; tier: string } | null = null;
  if (member.sponsorId) {
    const sp = await MemberModel.findOne({ memberId: member.sponsorId }).lean();
    if (sp) {
      sponsorInfo = {
        memberId: sp.memberId,
        name: sp.name,
        tier: sp.tier,
      };
    }
  }

  // Fetch direct downline
  const downline = await MemberModel.find({ sponsorId: member.memberId })
    .sort({ createdAt: -1 })
    .lean();

  let freeCount = 0;
  let areaCount = 0;
  let chiefCount = 0;

  const directReferrals = downline.map((d) => {
    if (d.tier === "FREE") freeCount++;
    else if (d.tier === "AREA") areaCount++;
    else if (d.tier === "CHIEF") chiefCount++;

    return {
      memberId: d.memberId,
      name: d.name,
      tier: d.tier,
      joinedAt: (d as unknown as { createdAt: Date }).createdAt,
      directSalesPaise: d.totalDirectSalesPaise ?? 0,
    };
  });

  return {
    member: {
      memberId: member.memberId,
      name: member.name,
      tier: member.tier,
      sponsorId: member.sponsorId,
    },
    sponsor: sponsorInfo,
    directReferrals,
    summary: {
      totalDirect: downline.length,
      freeCount,
      areaCount,
      chiefCount,
    },
  };
}
