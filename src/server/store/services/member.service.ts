import "server-only";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { getStoreDb, withStoreTransaction } from "../db/connect";
import { getStoreMemberModel, IStoreMemberDoc } from "../models/StoreMember";
import { getOrCreateStoreWallet } from "./wallet-ledger.service";
import {
  getStoreCouponModel,
  StoreCouponSource,
  StoreCouponStatus,
} from "../models/StoreCoupon";
import { getStoreSettingsModel } from "../models/StoreSettings";
import { generateStoreCouponCode } from "./store-coupon.service";
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

    // 7. Automatic Free Registration Mini Coupon Issuance (Client Requirement B.1)
    const CouponModel = getStoreCouponModel(conn);
    const existingRegistrationCoupon = await CouponModel.findOne({
      member: newMember._id,
      source: StoreCouponSource.FREE_REGISTRATION,
    }).session(session);

    if (!existingRegistrationCoupon) {
      // Check legal clearance for draw participation
      const SettingsModel = getStoreSettingsModel(conn);
      const settingsDoc = (await SettingsModel.findOne({
        singletonKey: "DEFAULT_SETTINGS",
      })
        .session(session)
        .lean()) as {
        settings?: {
          luckyDraw?: {
            luckyDrawsEnabled?: boolean;
            legalClearanceConfirmed?: boolean;
          };
          coupons?: {
            freeRegistrationMiniCouponValuePaise?: number;
            freeRegistrationCouponValidityDays?: number;
          };
        };
      } | null;

      const isDrawCleared =
        settingsDoc?.settings?.luckyDraw?.luckyDrawsEnabled === true &&
        settingsDoc?.settings?.luckyDraw?.legalClearanceConfirmed === true;

      // Unique coupon code
      let couponCode = generateStoreCouponCode();
      while (await CouponModel.findOne({ couponCode }).session(session)) {
        couponCode = generateStoreCouponCode();
      }

      // Configurable face value (default ₹50.00 pending written client confirmation)
      const faceValuePaise =
        settingsDoc?.settings?.coupons?.freeRegistrationMiniCouponValuePaise ?? 50_00;
      const validityDays =
        settingsDoc?.settings?.coupons?.freeRegistrationCouponValidityDays ?? 90;
      const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

      await CouponModel.create(
        [
          {
            couponCode,
            member: newMember._id,
            faceValuePaise,
            couponType: "MINI",
            source: StoreCouponSource.FREE_REGISTRATION,
            sourceRef: `reg:${newMember.memberId}`,
            status: StoreCouponStatus.ACTIVE,
            expiresAt,
            isEligibleForDraw: isDrawCleared, // STRICT LEGAL GATE: false unless legalClearanceConfirmed=true
            metadata: {
              registrationBonus: true,
              issuedAt: new Date().toISOString(),
              legalGateEnforced: !isDrawCleared,
              faceValuePendingClientConfirmation: true,
            },
          },
        ],
        { session },
      );

      // Note: Free registration mini coupon is an unbacked discount voucher in StoreCoupon collection.
      // It does NOT inflate the member's 7-wallet cache or create an unauthorized ledger balance.
    }

    return newMember;
  });
}

/**
 * Idempotently issues a free registration mini coupon to an existing member if not already granted.
 */
export async function ensureFreeRegistrationCoupon(
  memberId: string | Types.ObjectId,
) {
  return withStoreTransaction(async (session, conn) => {
    const memberObjectId =
      typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;
    const MemberModel = getStoreMemberModel(conn);
    const member = await MemberModel.findById(memberObjectId).session(session);
    if (!member) {
      throw new DomainError("Member not found.", 404, "MEMBER_NOT_FOUND");
    }

    const CouponModel = getStoreCouponModel(conn);
    const existing = await CouponModel.findOne({
      member: memberObjectId,
      source: StoreCouponSource.FREE_REGISTRATION,
    }).session(session);

    if (existing) {
      return { issued: false, isReplay: true, coupon: existing };
    }

    const SettingsModel = getStoreSettingsModel(conn);
    const settingsDoc = (await SettingsModel.findOne({
      singletonKey: "DEFAULT_SETTINGS",
    })
      .session(session)
      .lean()) as {
      settings?: {
        luckyDraw?: {
          luckyDrawsEnabled?: boolean;
          legalClearanceConfirmed?: boolean;
        };
        coupons?: {
          freeRegistrationMiniCouponValuePaise?: number;
          freeRegistrationCouponValidityDays?: number;
        };
      };
    } | null;

    const isDrawCleared =
      settingsDoc?.settings?.luckyDraw?.luckyDrawsEnabled === true &&
      settingsDoc?.settings?.luckyDraw?.legalClearanceConfirmed === true;

    let couponCode = generateStoreCouponCode();
    while (await CouponModel.findOne({ couponCode }).session(session)) {
      couponCode = generateStoreCouponCode();
    }

    const faceValuePaise =
      settingsDoc?.settings?.coupons?.freeRegistrationMiniCouponValuePaise ?? 50_00;
    const validityDays =
      settingsDoc?.settings?.coupons?.freeRegistrationCouponValidityDays ?? 90;
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    const [coupon] = await CouponModel.create(
      [
        {
          couponCode,
          member: memberObjectId,
          faceValuePaise,
          couponType: "MINI",
          source: StoreCouponSource.FREE_REGISTRATION,
          sourceRef: `reg:${member.memberId}`,
          status: StoreCouponStatus.ACTIVE,
          expiresAt,
          isEligibleForDraw: isDrawCleared,
          metadata: {
            registrationBonus: true,
            issuedAt: new Date().toISOString(),
            legalGateEnforced: !isDrawCleared,
            faceValuePendingClientConfirmation: true,
          },
        },
      ],
      { session },
    );

    return { issued: true, isReplay: false, coupon };
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
