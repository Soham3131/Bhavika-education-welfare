import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { getStoreDb } from "../db/connect";
import {
  getStoreEmiScheduleModel,
  IStoreEmiScheduleDoc,
  EmiStatus,
  InstalmentStatus,
  IEmiInstalment,
} from "../models/StoreEmiSchedule";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { issueStoreCoupon } from "./store-coupon.service";
import { StoreCouponSource } from "../models/StoreCoupon";
import { DomainError } from "@/server/errors";

export interface CreateEmiInput {
  orderId: string | Types.ObjectId;
  memberId: string | Types.ObjectId;
  orderRef: string;
  totalPrincipalPaise: number;
  totalInstalments: number;
}

export function generateEmiRef(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-EMI-${year}-${random}`;
}

/**
 * Creates an EMI schedule for a qualifying high-ticket order.
 */
export async function createEmiSchedule(
  input: CreateEmiInput,
): Promise<IStoreEmiScheduleDoc> {
  if (input.totalInstalments < 2 || input.totalInstalments > 24) {
    throw new DomainError("Instalments must be between 2 and 24 months.", 400, "INVALID_INSTALMENTS");
  }

  const monthlyAmountPaise = Math.ceil(input.totalPrincipalPaise / input.totalInstalments);
  const instalments: IEmiInstalment[] = [];
  const now = new Date();

  for (let i = 1; i <= input.totalInstalments; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + i);

    // Adjust last instalment for exact principal matching
    const amountPaise =
      i === input.totalInstalments
        ? input.totalPrincipalPaise - monthlyAmountPaise * (input.totalInstalments - 1)
        : monthlyAmountPaise;

    instalments.push({
      instalmentNumber: i,
      dueDate,
      amountPaise,
      status: InstalmentStatus.PENDING,
    });
  }

  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);

  const emi = new EmiModel({
    emiRef: generateEmiRef(),
    order: new Types.ObjectId(input.orderId),
    orderRef: input.orderRef,
    member: new Types.ObjectId(input.memberId),
    totalPrincipalPaise: input.totalPrincipalPaise,
    totalInstalments: input.totalInstalments,
    monthlyAmountPaise,
    status: EmiStatus.ACTIVE,
    instalments,
  });

  await emi.save();
  return emi;
}

/**
 * Pays a specific EMI instalment:
 * 1. Debits member wallet.
 * 2. Issues promotional instalment reward coupon.
 * 3. Transitions status to COMPLETED if all instalments paid.
 */
export async function payEmiInstalment(input: {
  emiId: string | Types.ObjectId;
  instalmentNumber: number;
  memberId: string | Types.ObjectId;
}): Promise<IStoreEmiScheduleDoc> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);

  const emi = await EmiModel.findById(input.emiId);
  if (!emi) {
    throw new DomainError("EMI schedule not found.", 404, "EMI_NOT_FOUND");
  }

  if (emi.status !== EmiStatus.ACTIVE) {
    throw new DomainError(`Cannot pay instalment on ${emi.status} EMI plan.`, 400, "INVALID_EMI_STATE");
  }

  const inst = emi.instalments.find((i) => i.instalmentNumber === input.instalmentNumber);
  if (!inst) {
    throw new DomainError(`Instalment #${input.instalmentNumber} not found.`, 404, "INSTALMENT_NOT_FOUND");
  }

  if (inst.status === InstalmentStatus.PAID) {
    return emi; // Idempotent
  }

  if (inst.status === InstalmentStatus.WAIVED_BY_PRIZE_WIN) {
    throw new DomainError("This instalment was waived under the Winner-Stops-EMI rule.", 400, "INSTALMENT_WAIVED");
  }

  const memberObjectId = new Types.ObjectId(input.memberId);

  // 1. Debit member wallet
  await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "ADD_MONEY",
    type: "DEBIT",
    unit: "INR_PAISE",
    amountPaise: inst.amountPaise,
    referenceType: "ORDER_CHECKOUT",
    referenceId: `${emi.emiRef}-INST-${inst.instalmentNumber}`,
    idempotencyKey: `emi-pay:${emi.emiRef}:${inst.instalmentNumber}`,
    description: `EMI instalment #${inst.instalmentNumber} for order ${emi.orderRef}`,
  });

  // 2. Issue promotional instalment coupon (5% value of instalment)
  const couponValuePaise = Math.max(1000, Math.floor(inst.amountPaise * 0.05));
  const coupon = await issueStoreCoupon({
    memberId: memberObjectId,
    faceValuePaise: couponValuePaise,
    source: StoreCouponSource.EMI_INSTALMENT,
    sourceRef: `${emi.emiRef}-INST-${inst.instalmentNumber}`,
    validityDays: 90,
    isEligibleForDraw: true,
    metadata: {
      emiRef: emi.emiRef,
      instalmentNumber: inst.instalmentNumber,
    },
  });

  inst.status = InstalmentStatus.PAID;
  inst.paidAt = new Date();
  inst.paymentMethod = "WALLET";
  inst.couponIssuedId = coupon._id as Types.ObjectId;

  emi.paidInstalmentsCount += 1;

  // Check if fully settled
  const totalSettled = emi.paidInstalmentsCount + emi.waivedInstalmentsCount;
  if (totalSettled >= emi.totalInstalments) {
    emi.status = EmiStatus.COMPLETED;
  }

  await emi.save();
  return emi;
}

/**
 * "Winner-Stops-EMI" Rule:
 * When a member wins an eligible lucky draw or contest, all remaining unpaid instalments
 * on active EMI schedules are waived (WAIVED_BY_PRIZE_WIN).
 * The plan is marked fully settled without penalty or negative balance.
 */
export async function applyWinnerStopsEmi(input: {
  memberId: string | Types.ObjectId;
  winningRef: string;
}): Promise<IStoreEmiScheduleDoc[]> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);

  const memberObjectId = new Types.ObjectId(input.memberId);
  const activeEmis = await EmiModel.find({
    member: memberObjectId,
    status: EmiStatus.ACTIVE,
  });

  const updatedPlans: IStoreEmiScheduleDoc[] = [];

  for (const emi of activeEmis) {
    let newlyWaivedCount = 0;
    const now = new Date();

    for (const inst of emi.instalments) {
      if (inst.status === InstalmentStatus.PENDING || inst.status === InstalmentStatus.OVERDUE) {
        inst.status = InstalmentStatus.WAIVED_BY_PRIZE_WIN;
        inst.waivedAt = now;
        inst.waiverReason = `Winner-Stops-EMI: Won prize in ${input.winningRef}`;
        newlyWaivedCount++;
      }
    }

    if (newlyWaivedCount > 0) {
      emi.waivedInstalmentsCount += newlyWaivedCount;
      emi.winnerStopsEmiApplied = true;
      emi.winnerStopsEmiRef = input.winningRef;
      emi.status = EmiStatus.COMPLETED;
      await emi.save();
      updatedPlans.push(emi);
    }
  }

  return updatedPlans;
}

/**
 * Requests EMI plan cancellation by member.
 */
export async function requestEmiCancellation(input: {
  emiId: string | Types.ObjectId;
  memberId: string | Types.ObjectId;
  reason: string;
}): Promise<IStoreEmiScheduleDoc> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);

  const emi = await EmiModel.findOne({
    _id: input.emiId,
    member: input.memberId,
  });

  if (!emi) {
    throw new DomainError("EMI schedule not found.", 404, "EMI_NOT_FOUND");
  }

  if (emi.status !== EmiStatus.ACTIVE) {
    throw new DomainError(`Cannot cancel a ${emi.status} EMI plan.`, 400, "INVALID_EMI_STATE");
  }

  emi.cancellationRequested = true;
  emi.cancellationReason = input.reason.trim();
  await emi.save();
  return emi;
}

/**
 * Approves or rejects an EMI cancellation request by store admin.
 */
export async function approveEmiCancellation(input: {
  emiId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  decision: "APPROVE" | "REJECT";
}): Promise<IStoreEmiScheduleDoc> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);

  const emi = await EmiModel.findById(input.emiId);
  if (!emi) {
    throw new DomainError("EMI schedule not found.", 404, "EMI_NOT_FOUND");
  }

  if (!emi.cancellationRequested) {
    throw new DomainError("No cancellation requested for this EMI plan.", 400, "NO_REQUEST");
  }

  const adminObjectId = new Types.ObjectId(input.adminId);
  emi.cancellationApprovedBy = adminObjectId;
  emi.cancellationApprovedAt = new Date();

  if (input.decision === "APPROVE") {
    emi.status = EmiStatus.CANCELLED;
  } else {
    emi.cancellationRequested = false;
  }

  await emi.save();
  return emi;
}

/**
 * Lists member EMI schedules.
 */
export async function listMemberEmis(
  memberId: string | Types.ObjectId,
): Promise<IStoreEmiScheduleDoc[]> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);
  return EmiModel.find({ member: memberId }).sort({ createdAt: -1 });
}

/**
 * Lists all EMI schedules for admin.
 */
export async function listAllEmis(): Promise<IStoreEmiScheduleDoc[]> {
  const db = await getStoreDb();
  const EmiModel = getStoreEmiScheduleModel(db);
  return EmiModel.find().populate("member", "name phone memberId").sort({ createdAt: -1 });
}
