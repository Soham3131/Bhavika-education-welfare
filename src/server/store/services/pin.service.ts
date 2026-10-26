import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { getStoreDb } from "../db/connect";
import {
  getStorePinModel,
  IStorePinDoc,
  PinStatus,
  PinTier,
} from "../models/StorePin";
import { getStoreMemberModel } from "../models/StoreMember";
import { mutateStoreWallet } from "./wallet-ledger.service";
import { DomainError } from "@/server/errors";

const PIN_TIER_PRICES: Record<PinTier, number> = {
  AREA: 2500000, // ₹25,000.00
  CHIEF: 10000000, // ₹1,00,000.00
};

export function generatePinCode(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-PIN-${year}-${random}`;
}

/**
 * Purchases an activation PIN using member wallet balance.
 */
export async function purchasePin(input: {
  memberId: string | Types.ObjectId;
  tier: PinTier;
}): Promise<IStorePinDoc> {
  const faceValuePaise = PIN_TIER_PRICES[input.tier];
  if (!faceValuePaise) {
    throw new DomainError("Invalid PIN tier.", 400, "INVALID_TIER");
  }

  const memberObjectId = new Types.ObjectId(input.memberId);
  const pinCode = generatePinCode();

  // 1. Debit member wallet
  await mutateStoreWallet({
    memberId: memberObjectId,
    walletType: "ADD_MONEY",
    type: "DEBIT",
    unit: "INR_PAISE",
    amountPaise: faceValuePaise,
    referenceType: "MEMBER_ACTIVATION_FEE",
    referenceId: pinCode,
    idempotencyKey: `pin-buy:${pinCode}`,
    description: `Purchase of ${input.tier} activation PIN`,
  });

  const db = await getStoreDb();
  const PinModel = getStorePinModel(db);

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 12 months validity

  const pin = new PinModel({
    pinCode,
    tier: input.tier,
    faceValuePaise,
    status: PinStatus.ACTIVE,
    ownerMember: memberObjectId,
    purchaserMember: memberObjectId,
    expiresAt,
  });

  await pin.save();
  return pin;
}

/**
 * Transfers a PIN from current owner to another member via phone number.
 */
export async function transferPin(input: {
  pinId: string | Types.ObjectId;
  fromMemberId: string | Types.ObjectId;
  toPhone: string;
  note?: string;
}): Promise<IStorePinDoc> {
  const db = await getStoreDb();
  const PinModel = getStorePinModel(db);
  const MemberModel = getStoreMemberModel(db);

  const fromObjectId = new Types.ObjectId(input.fromMemberId);
  const pin = await PinModel.findOne({
    _id: input.pinId,
    ownerMember: fromObjectId,
    status: PinStatus.ACTIVE,
  });

  if (!pin) {
    throw new DomainError("Active PIN not found in your account.", 404, "PIN_NOT_FOUND");
  }

  const recipient = await MemberModel.findOne({ phone: input.toPhone.trim() });
  if (!recipient) {
    throw new DomainError("Recipient member not found with this phone number.", 404, "RECIPIENT_NOT_FOUND");
  }

  if (recipient._id.toString() === fromObjectId.toString()) {
    throw new DomainError("Cannot transfer a PIN to yourself.", 400, "SELF_TRANSFER");
  }

  // Atomically reassign owner and record transfer log
  pin.ownerMember = recipient._id;
  pin.transferHistory.push({
    fromMember: fromObjectId,
    toMember: recipient._id,
    transferredAt: new Date(),
    note: input.note || null,
  });

  await pin.save();
  return pin;
}

/**
 * Activates a downline member using a PIN.
 * CRITICAL REGULATORY & ACCESS BOUNDARY:
 * 1. Acting member must own the active PIN.
 * 2. Target member MUST be in the acting member's immediate downline tree.
 *    (Cannot activate arbitrary cross-network members).
 */
export async function activateMemberWithPin(input: {
  pinId: string | Types.ObjectId;
  actingMemberId: string | Types.ObjectId;
  targetMemberPhone: string;
}): Promise<{
  pin: IStorePinDoc;
  activatedMemberId: string;
  tier: PinTier;
}> {
  const db = await getStoreDb();
  const PinModel = getStorePinModel(db);
  const MemberModel = getStoreMemberModel(db);

  const actingObjectId = new Types.ObjectId(input.actingMemberId);
  const actingMember = await MemberModel.findById(actingObjectId);
  if (!actingMember) {
    throw new DomainError("Acting member not found.", 404, "MEMBER_NOT_FOUND");
  }

  const pin = await PinModel.findOne({
    _id: input.pinId,
    ownerMember: actingObjectId,
    status: PinStatus.ACTIVE,
  });

  if (!pin) {
    throw new DomainError("Active PIN not found in your inventory.", 404, "PIN_NOT_FOUND");
  }

  if (pin.expiresAt < new Date()) {
    pin.status = PinStatus.CANCELLED;
    await pin.save();
    throw new DomainError("This PIN has expired.", 400, "PIN_EXPIRED");
  }

  const targetMember = await MemberModel.findOne({
    phone: input.targetMemberPhone.trim(),
  });

  if (!targetMember) {
    throw new DomainError("Target member not found.", 404, "TARGET_NOT_FOUND");
  }

  // IMMEDIATE DIRECT SPONSOR SECURITY BOUNDARY:
  // PIN activation is strictly restricted to a member whose immediate sponsor is the acting PIN holder.
  // Deeper descendants (e.g. grandchildren) are strictly rejected.
  const isDirectSponsored = targetMember.sponsorId === actingMember.memberId;

  if (!isDirectSponsored) {
    throw new DomainError(
      "Regulatory boundary: PIN activation is strictly restricted to your immediate direct sponsored member.",
      403,
      "NOT_IMMEDIATE_SPONSOR",
    );
  }

  // Upgrade target member tier
  targetMember.tier = pin.tier;
  await targetMember.save();

  // Mark PIN as redeemed
  pin.status = PinStatus.REDEEMED;
  pin.redeemedByMember = targetMember._id;
  pin.redeemedAt = new Date();
  await pin.save();

  return {
    pin,
    activatedMemberId: targetMember.memberId,
    tier: pin.tier,
  };
}

/**
 * Lists PINs owned by a member.
 */
export async function listMemberPins(
  memberId: string | Types.ObjectId,
): Promise<IStorePinDoc[]> {
  const db = await getStoreDb();
  const PinModel = getStorePinModel(db);
  return PinModel.find({ ownerMember: memberId }).sort({ createdAt: -1 });
}

/**
 * Lists all PINs for store admin.
 */
export async function listAllPins(): Promise<IStorePinDoc[]> {
  const db = await getStoreDb();
  const PinModel = getStorePinModel(db);
  return PinModel.find()
    .populate("ownerMember", "name phone memberId")
    .populate("redeemedByMember", "name phone memberId")
    .sort({ createdAt: -1 });
}
