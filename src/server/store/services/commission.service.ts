import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreCommissionLedgerModel,
  IStoreCommissionLedgerDoc,
} from "../models/StoreCommissionLedger";
import { getStoreMemberModel } from "../models/StoreMember";
import { getStoreMembershipPlanModel } from "../models/StoreMembershipPlan";
import { DomainError } from "@/server/errors";

/**
 * Global commission feature toggle.
 * Safeguard 6: Keep live payouts disabled pending client review and legal approval.
 */
let commissionPayoutsEnabled = false;

export function setCommissionPayoutsEnabled(enabled: boolean): void {
  commissionPayoutsEnabled = enabled;
}

export function isCommissionPayoutsEnabled(): boolean {
  return commissionPayoutsEnabled;
}

export interface CalculateCommissionResult {
  generated: boolean;
  isReplay: boolean;
  ledgerEntry: IStoreCommissionLedgerDoc | null;
  reason?: string;
}

/**
 * Calculates and records direct-sponsor product sales commission.
 *
 * Mandatory Safeguards:
 * 1. Immediate direct sponsor ONLY (depth = 1).
 * 2. Calculated on net product sales (excl. GST and shipping).
 * 3. Idempotent: duplicate calls with same orderRef return existing row.
 * 4. Payouts gated behind isCommissionPayoutsEnabled().
 */
export async function calculateOrderDirectCommission(params: {
  orderRef: string;
  purchasingMemberId: string | Types.ObjectId;
  itemsTotalPaise: number;
  couponDiscountPaise?: number;
}): Promise<CalculateCommissionResult> {
  const db = await getStoreDb();
  const Member = getStoreMemberModel(db);
  const Plan = getStoreMembershipPlanModel(db);
  const CommissionLedger = getStoreCommissionLedgerModel(db);

  // 1. Fetch purchasing member
  const buyer = await Member.findById(
    new Types.ObjectId(params.purchasingMemberId),
  );
  if (!buyer) {
    throw new DomainError("Purchasing member not found.", 404, "BUYER_NOT_FOUND");
  }

  // 2. Identify immediate direct sponsor
  if (!buyer.sponsorId) {
    return {
      generated: false,
      isReplay: false,
      ledgerEntry: null,
      reason: "Purchasing member has no sponsor. Zero commission generated.",
    };
  }

  const sponsor = await Member.findOne({ memberId: buyer.sponsorId });
  if (!sponsor) {
    return {
      generated: false,
      isReplay: false,
      ledgerEntry: null,
      reason: `Sponsor ${buyer.sponsorId} not found in store database.`,
    };
  }

  // 3. Idempotency Check
  const idempotencyKey = `comm:${params.orderRef}:${buyer._id}:${sponsor._id}:DIRECT`;
  const existing = await CommissionLedger.findOne({ idempotencyKey });
  if (existing) {
    return {
      generated: true,
      isReplay: true,
      ledgerEntry: existing,
    };
  }

  // 4. Fetch sponsor's tier and commission rate
  const plan = await Plan.findOne({ tier: sponsor.tier });
  const ratePercentage = plan?.directReferralCommissionPercentage ?? 0;

  if (ratePercentage <= 0) {
    return {
      generated: false,
      isReplay: false,
      ledgerEntry: null,
      reason: `Sponsor ${sponsor.memberId} tier (${sponsor.tier}) has 0% direct referral commission.`,
    };
  }

  // 5. Calculate eligible commission base: Net product revenue (excl shipping & GST)
  const couponDiscount = params.couponDiscountPaise ?? 0;
  const eligibleBasePaise = Math.max(0, params.itemsTotalPaise - couponDiscount);
  const commissionAmountPaise = Math.round(
    (eligibleBasePaise * ratePercentage) / 100,
  );

  if (commissionAmountPaise <= 0) {
    return {
      generated: false,
      isReplay: false,
      ledgerEntry: null,
      reason: "Calculated commission amount is 0 paise.",
    };
  }

  // 6. Record immutable commission ledger row with status PENDING
  // Note: level is strictly 1 (direct sponsor)
  const ledger = await CommissionLedger.create({
    memberId: sponsor._id,
    sourceMemberId: buyer._id,
    orderRef: params.orderRef,
    idempotencyKey,
    type: "SALE_DIRECT",
    status: "PENDING",
    level: 1,
    eligibleBasePaise,
    commissionRatePercentage: ratePercentage,
    commissionAmountPaise,
    meta: {
      sponsorMemberId: sponsor.memberId,
      buyerMemberId: buyer.memberId,
      sponsorTier: sponsor.tier,
      calculationBaseType: "NET_MERCHANDISE_REVENUE",
      livePayoutsActive: commissionPayoutsEnabled,
    },
  });

  // Track cumulative direct spend for sponsor
  sponsor.totalDirectSalesPaise += eligibleBasePaise;
  await sponsor.save();

  return {
    generated: true,
    isReplay: false,
    ledgerEntry: ledger,
  };
}

/**
 * Settles commission when an order is delivered and the return window has closed.
 */
export async function settleOrderCommission(
  orderRef: string,
): Promise<{
  settled: boolean;
  ledgerEntry: IStoreCommissionLedgerDoc | null;
}> {
  const db = await getStoreDb();
  const CommissionLedger = getStoreCommissionLedgerModel(db);

  const entry = await CommissionLedger.findOne({
    orderRef,
    type: "SALE_DIRECT",
  });
  if (!entry) {
    return { settled: false, ledgerEntry: null };
  }

  if (entry.status === "PAID" || entry.status === "PAYABLE") {
    return { settled: true, ledgerEntry: entry }; // Idempotent
  }

  if (entry.status === "CANCELLED" || entry.status === "REVERSED") {
    return { settled: false, ledgerEntry: entry };
  }

  // Transition to PAID if live payouts enabled, else PAYABLE (held)
  entry.status = commissionPayoutsEnabled ? "PAID" : "PAYABLE";
  entry.settledAt = new Date();
  await entry.save();

  return { settled: true, ledgerEntry: entry };
}

/**
 * Reverses or cancels commission on order cancellation or return/refund.
 * Safeguard 5: Never edits historical ledger rows; appends a compensating SALE_REVERSAL.
 */
export async function reverseOrderCommission(params: {
  orderRef: string;
  reason: string;
}): Promise<{
  reversed: boolean;
  reversalEntry: IStoreCommissionLedgerDoc | null;
}> {
  const db = await getStoreDb();
  const CommissionLedger = getStoreCommissionLedgerModel(db);

  const directEntry = await CommissionLedger.findOne({
    orderRef: params.orderRef,
    type: "SALE_DIRECT",
  });
  if (!directEntry) {
    return { reversed: false, reversalEntry: null };
  }

  // If still PENDING, simple state flip to CANCELLED (no funds were disbursed)
  if (directEntry.status === "PENDING") {
    directEntry.status = "CANCELLED";
    directEntry.reversalReason = params.reason;
    await directEntry.save();
    return { reversed: true, reversalEntry: directEntry };
  }

  // If already PAID or PAYABLE, create a compensating SALE_REVERSAL row
  const reversalIdempotencyKey = `comm:${params.orderRef}:${directEntry.sourceMemberId}:${directEntry.memberId}:REVERSAL`;
  const existingReversal = await CommissionLedger.findOne({
    idempotencyKey: reversalIdempotencyKey,
  });
  if (existingReversal) {
    return { reversed: true, reversalEntry: existingReversal };
  }

  directEntry.status = "REVERSED";
  await directEntry.save();

  const reversal = await CommissionLedger.create({
    memberId: directEntry.memberId,
    sourceMemberId: directEntry.sourceMemberId,
    orderRef: params.orderRef,
    idempotencyKey: reversalIdempotencyKey,
    type: "SALE_REVERSAL",
    status: "REVERSED",
    level: 1,
    eligibleBasePaise: directEntry.eligibleBasePaise,
    commissionRatePercentage: directEntry.commissionRatePercentage,
    commissionAmountPaise: directEntry.commissionAmountPaise,
    reversalReason: params.reason,
    originalCommissionId: directEntry._id,
    settledAt: new Date(),
    meta: {
      originalCommissionId: directEntry._id.toString(),
      originalCreatedAt: directEntry.createdAt,
    },
  });

  return { reversed: true, reversalEntry: reversal };
}

/**
 * Lists commission ledger records for a member or store admin audit.
 */
export async function listCommissionLedger(params: {
  memberId?: string | Types.ObjectId;
  orderRef?: string;
  limit?: number;
}): Promise<IStoreCommissionLedgerDoc[]> {
  const db = await getStoreDb();
  const CommissionLedger = getStoreCommissionLedgerModel(db);

  const filter: Record<string, unknown> = {};
  if (params.memberId) {
    filter.memberId = new Types.ObjectId(params.memberId);
  }
  if (params.orderRef) {
    filter.orderRef = params.orderRef;
  }

  return CommissionLedger.find(filter)
    .sort({ createdAt: -1 })
    .limit(params.limit || 100);
}
