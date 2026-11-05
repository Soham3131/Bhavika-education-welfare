import "server-only";
import { Types } from "mongoose";
import { getStoreDb, withStoreTransaction } from "../db/connect";
import {
  getStorePromotionalPlanModel,
  IStorePromotionalPlanDoc,
} from "../models/StorePromotionalPlan";
import {
  getStoreWalletLedgerModel,
  StoreLedgerRefType,
} from "../models/StoreWalletLedger";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { issueStoreCoupon } from "./store-coupon.service";
import { StoreCouponSource, StoreCouponType } from "../models/StoreCoupon";
import { getStoreSettingsModel } from "../models/StoreSettings";
import { AdminAuditLog } from "@/server/models";
import { DomainError } from "@/server/errors";

export const DEFAULT_PROMOTIONAL_PLANS = [
  {
    planCode: "PLAN_850",
    name: "Promotional Plan 1 (₹850)",
    description:
      "Client Promotional Tier 1: ₹850 purchase granting ₹1,000 product wallet balance and 2 Super Coupons.",
    pricePaise: 850_00,
    productWalletBenefitPaise: 1000_00,
    superCouponCount: 2,
    superCouponType: "SUPER" as StoreCouponType,
    superCouponFaceValuePaise: 500_00,
    pointsReward: 0,
    commissionEligible: false,
    directCommissionPercentage: 10,
    isPurchaseActive: false, // Safeguard: purchase disabled until client confirms coupon valuation
    validityDays: 365,
    maxPurchasesPerMember: 1,
  },
  {
    planCode: "PLAN_1500",
    name: "Promotional Plan 2 (₹1,500)",
    description:
      "Client Promotional Tier 2: ₹1,500 purchase granting ₹2,000 product wallet balance and 5 Super Coupons.",
    pricePaise: 1500_00,
    productWalletBenefitPaise: 2000_00,
    superCouponCount: 5,
    superCouponType: "SUPER" as StoreCouponType,
    superCouponFaceValuePaise: 400_00,
    pointsReward: 0,
    commissionEligible: false,
    directCommissionPercentage: 15,
    isPurchaseActive: false, // Safeguard: purchase disabled until client confirms coupon valuation
    validityDays: 365,
    maxPurchasesPerMember: 1,
  },
];

export async function ensureDefaultPromotionalPlans(): Promise<void> {
  const db = await getStoreDb();
  const PlanModel = getStorePromotionalPlanModel(db);

  for (const def of DEFAULT_PROMOTIONAL_PLANS) {
    const existing = await PlanModel.findOne({ planCode: def.planCode });
    if (!existing) {
      await PlanModel.create(def);
    }
  }
}

export async function listStorePromotionalPlans(): Promise<
  IStorePromotionalPlanDoc[]
> {
  await ensureDefaultPromotionalPlans();
  const db = await getStoreDb();
  const PlanModel = getStorePromotionalPlanModel(db);
  return PlanModel.find().sort({ pricePaise: 1 });
}

export async function getStorePromotionalPlanByCode(
  planCode: string,
): Promise<IStorePromotionalPlanDoc | null> {
  await ensureDefaultPromotionalPlans();
  const db = await getStoreDb();
  const PlanModel = getStorePromotionalPlanModel(db);
  return PlanModel.findOne({ planCode: planCode.toUpperCase().trim() });
}

export async function updateStorePromotionalPlan(params: {
  adminId: string | Types.ObjectId;
  planCode: string;
  name?: string;
  description?: string;
  pricePaise?: number;
  productWalletBenefitPaise?: number;
  superCouponCount?: number;
  superCouponType?: StoreCouponType;
  superCouponFaceValuePaise?: number;
  pointsReward?: number;
  commissionEligible?: boolean;
  directCommissionPercentage?: number;
  isPurchaseActive?: boolean;
  validityDays?: number;
  maxPurchasesPerMember?: number;
}): Promise<IStorePromotionalPlanDoc> {
  await ensureDefaultPromotionalPlans();
  const db = await getStoreDb();
  const PlanModel = getStorePromotionalPlanModel(db);

  const plan = await PlanModel.findOne({ planCode: params.planCode });
  if (!plan) {
    throw new DomainError("Promotional plan not found.", 404, "PLAN_NOT_FOUND");
  }

  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) plan.name = params.name;
  if (params.description !== undefined) plan.description = params.description;
  if (params.pricePaise !== undefined) plan.pricePaise = params.pricePaise;
  if (params.productWalletBenefitPaise !== undefined)
    plan.productWalletBenefitPaise = params.productWalletBenefitPaise;
  if (params.superCouponCount !== undefined)
    plan.superCouponCount = params.superCouponCount;
  if (params.superCouponType !== undefined)
    plan.superCouponType = params.superCouponType;
  if (params.superCouponFaceValuePaise !== undefined)
    plan.superCouponFaceValuePaise = params.superCouponFaceValuePaise;
  if (params.pointsReward !== undefined)
    plan.pointsReward = params.pointsReward;
  if (params.commissionEligible !== undefined)
    plan.commissionEligible = params.commissionEligible;
  if (params.directCommissionPercentage !== undefined)
    plan.directCommissionPercentage = params.directCommissionPercentage;
  if (params.isPurchaseActive !== undefined)
    plan.isPurchaseActive = params.isPurchaseActive;
  if (params.validityDays !== undefined)
    plan.validityDays = params.validityDays;
  if (params.maxPurchasesPerMember !== undefined)
    plan.maxPurchasesPerMember = params.maxPurchasesPerMember;

  await plan.save();

  await AdminAuditLog.create({
    admin: new Types.ObjectId(params.adminId),
    action: "STORE_PROMOTIONAL_PLAN_UPDATE",
    targetType: "STORE_PROMOTIONAL_PLAN",
    targetId: plan._id.toString(),
    meta: {
      planCode: plan.planCode,
      isPurchaseActive: plan.isPurchaseActive,
      pricePaise: plan.pricePaise,
      productWalletBenefitPaise: plan.productWalletBenefitPaise,
      superCouponCount: plan.superCouponCount,
    },
  });

  return plan;
}

export async function purchasePromotionalPlan(params: {
  memberId: string | Types.ObjectId;
  planCode: string;
  paymentRef: string;
  idempotencyKey: string;
}): Promise<{
  success: boolean;
  isReplay: boolean;
  plan: IStorePromotionalPlanDoc;
  walletCreditPaise: number;
  couponsIssuedCount: number;
  couponCodes: string[];
}> {
  const plan = await getStorePromotionalPlanByCode(params.planCode);
  if (!plan) {
    throw new DomainError("Promotional plan not found.", 404, "PLAN_NOT_FOUND");
  }

  // Safety gate: Require client confirmation before live activation
  if (!plan.isPurchaseActive) {
    throw new DomainError(
      "Promotional plan purchases are currently locked pending client confirmation of business rules and coupon valuation.",
      403,
      "PLAN_PURCHASE_LOCKED",
    );
  }

  const memberObjectId = new Types.ObjectId(params.memberId);
  const db = await getStoreDb();
  const LedgerModel = getStoreWalletLedgerModel(db);

  // Idempotency check: if this transaction already occurred, replay safely
  const existingLedger = await LedgerModel.findOne({
    idempotencyKey: params.idempotencyKey,
  });

  if (existingLedger) {
    return {
      success: true,
      isReplay: true,
      plan,
      walletCreditPaise: plan.productWalletBenefitPaise,
      couponsIssuedCount: plan.superCouponCount,
      couponCodes: (existingLedger.metadata?.couponCodes as string[]) || [],
    };
  }

  // Check legal clearance for lucky draw eligibility
  const SettingsModel = getStoreSettingsModel(db);
  const settingsDoc = (await SettingsModel.findOne({
    singletonKey: "DEFAULT_SETTINGS",
  }).lean()) as {
    settings?: {
      luckyDraw?: {
        luckyDrawsEnabled?: boolean;
        legalClearanceConfirmed?: boolean;
      };
    };
  } | null;

  const isDrawCleared =
    settingsDoc?.settings?.luckyDraw?.luckyDrawsEnabled === true &&
    settingsDoc?.settings?.luckyDraw?.legalClearanceConfirmed === true;

  const couponCodes: string[] = [];

  // Issue Super Coupons
  for (let i = 0; i < plan.superCouponCount; i++) {
    const coupon = await issueStoreCoupon({
      memberId: memberObjectId,
      faceValuePaise: plan.superCouponFaceValuePaise,
      couponType: plan.superCouponType,
      source: StoreCouponSource.MEMBERSHIP_PLAN,
      sourceRef: `${plan.planCode}-${params.paymentRef}-${i + 1}`,
      validityDays: plan.validityDays,
      isEligibleForDraw: isDrawCleared, // STRICT LEGAL GATE
      metadata: {
        planCode: plan.planCode,
        paymentRef: params.paymentRef,
        benefitIndex: i + 1,
        legalGateEnforced: !isDrawCleared,
      },
    });
    couponCodes.push(coupon.couponCode);
  }

  // Atomically credit product wallet
  await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "ADD_MONEY",
    type: "CREDIT",
    unit: "INR_PAISE",
    amountPaise: plan.productWalletBenefitPaise,
    referenceType: "MEMBER_ACTIVATION_FEE" as StoreLedgerRefType,
    referenceId: params.paymentRef,
    idempotencyKey: params.idempotencyKey,
    description: `Promotional ${plan.name} benefit: ₹${plan.productWalletBenefitPaise / 100} product wallet credit + ${plan.superCouponCount} Super Coupons`,
    metadata: {
      planCode: plan.planCode,
      couponCodes,
      superCouponCount: plan.superCouponCount,
    },
  });

  return {
    success: true,
    isReplay: false,
    plan,
    walletCreditPaise: plan.productWalletBenefitPaise,
    couponsIssuedCount: plan.superCouponCount,
    couponCodes,
  };
}
