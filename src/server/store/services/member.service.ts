import "server-only";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { getStoreDb, withStoreTransaction } from "../db/connect";
import { getStoreMemberModel, IStoreMemberDoc } from "../models/StoreMember";
import { getOrCreateStoreWallet } from "./wallet-ledger.service";
import { DomainError } from "@/server/errors";

export interface RegisterMemberInput {
  name: string;
  phone: string;
  email?: string | null;
  password: string;
  sponsorId?: string | null;
}

export type SafeStoreMember = Omit<IStoreMemberDoc, "passwordHash">;

/**
 * Generates an unambiguous, unique Member ID in format: JMD-YYYY-XXXXXX
 * (6 random alphanumeric characters using unambiguous alphabet)
 */
export function generateMemberId(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `JMD-${year}-${random}`;
}

export async function registerStoreMember(
  input: RegisterMemberInput,
): Promise<IStoreMemberDoc> {
  const cleanPhone = input.phone.trim();
  const cleanEmail = input.email ? input.email.trim().toLowerCase() : null;
  const cleanSponsor = input.sponsorId ? input.sponsorId.trim().toUpperCase() : null;

  return withStoreTransaction(async (session, conn) => {
    const MemberModel = getStoreMemberModel(conn);

    // 1. Uniqueness Checks
    const existingPhone = await MemberModel.findOne({ phone: cleanPhone }).session(session);
    if (existingPhone) {
      throw new DomainError("This phone number is already registered.", 409, "PHONE_EXISTS");
    }

    if (cleanEmail) {
      const existingEmail = await MemberModel.findOne({ email: cleanEmail }).session(session);
      if (existingEmail) {
        throw new DomainError("This email address is already registered.", 409, "EMAIL_EXISTS");
      }
    }

    // 2. Validate Sponsor Relationship
    let sponsorPath: string[] = [];
    if (cleanSponsor) {
      const sponsor = await MemberModel.findOne({ memberId: cleanSponsor }).session(session);
      if (!sponsor) {
        throw new DomainError("Invalid sponsor ID. No such member found.", 400, "INVALID_SPONSOR");
      }
      if (sponsor.status === "BLOCKED" || sponsor.status === "SUSPENDED") {
        throw new DomainError("This sponsor cannot accept new members.", 400, "SPONSOR_RESTRICTED");
      }
      sponsorPath = [...(sponsor.sponsorPath || []), sponsor.memberId];
    }

    // 3. Password Hashing (Cost 12)
    const passwordHash = await bcrypt.hash(input.password, 12);

    // 4. Collision-safe Member ID generation
    let memberId = generateMemberId();
    for (let attempts = 0; attempts < 5; attempts++) {
      const exists = await MemberModel.findOne({ memberId }).session(session);
      if (!exists) break;
      memberId = generateMemberId();
    }

    // 5. Create Member Document
    const newMember = new MemberModel({
      memberId,
      sponsorId: cleanSponsor,
      sponsorPath,
      name: input.name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      passwordHash,
      tier: "FREE",
      status: "ACTIVE",
      lifetimePaidPaise: 0,
      highestSingleOrderPaise: 0,
      hasPurchasedOnboardingKit: false,
      hasPinPrivilege: false,
      sessionVersion: 1,
    });
    await newMember.save({ session });

    // 6. Automatically Initialize the 7-Wallet Cache
    await getOrCreateStoreWallet(newMember._id, session);

    return newMember;
  });
}

export async function getStoreMemberById(
  id: string | Types.ObjectId,
): Promise<IStoreMemberDoc | null> {
  const conn = await getStoreDb();
  const MemberModel = getStoreMemberModel(conn);
  return MemberModel.findById(id);
}

export async function getStoreMemberByMemberId(
  memberId: string,
): Promise<IStoreMemberDoc | null> {
  const conn = await getStoreDb();
  const MemberModel = getStoreMemberModel(conn);
  return MemberModel.findOne({ memberId: memberId.trim().toUpperCase() });
}
