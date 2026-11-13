import { describe, it, expect, beforeAll } from "vitest";
import {
  submitCard,
  approveCard,
  rejectCard,
  adminIssueCard,
  adminListCards,
  adminRevealCard,
  getDownloadableCard,
} from "@/server/services/idcard.service";
import { renderIdCardPdf } from "@/server/services/idcard-pdf";
import { encryptPII, decryptPII } from "@/server/crypto/pii";
import { IdCard, User } from "@/server/models";
import { IdCardStatus, UserRole } from "@/lib/enums";
import { DomainError } from "@/server/errors";
import { makeUser } from "./helpers";

const AADHAAR = "123412341234";
const PAN = "ABCDE1234F";
const PHOTO = "https://res.cloudinary.com/demo/image/upload/avatars/test.png";

async function codeOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof DomainError ? err.code : `UNEXPECTED:${String(err)}`;
  }
}

const KYC = { fatherName: "Ram Kumar", address: "12 Example Rd, Rohtak 124001", aadhaar: AADHAAR, pan: PAN };

beforeAll(async () => {
  await IdCard.syncIndexes();
});

describe("PII encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const ct = encryptPII(AADHAAR);
    expect(ct).not.toContain(AADHAAR);
    expect(decryptPII(ct)).toBe(AADHAAR);
  });

  it("rejects tampered ciphertext", () => {
    const ct = encryptPII(PAN);
    const tampered = ct.slice(0, -2) + (ct.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptPII(tampered)).toThrow();
  });
});

describe("member submit → approve → download", () => {
  it("requires a profile photo before submitting", async () => {
    const user = await makeUser(); // no avatar
    expect(await codeOf(() => submitCard(user._id.toString(), KYC))).toBe("NO_PHOTO");
  });

  it("submits PENDING, encrypts the PII, and shows only masked values", async () => {
    const user = await makeUser({ avatarUrl: PHOTO, city: "Rohtak" });
    const dto = await submitCard(user._id.toString(), KYC);

    expect(dto.status).toBe(IdCardStatus.PENDING);
    expect(dto.memberId).toBeNull();
    expect(dto.aadhaarMasked).toBe("XXXX XXXX 1234");
    expect(dto.panMasked).toBe("XXXXXX234F");
    expect(dto.photoUrl).toBe(PHOTO);

    // Stored encrypted, decryptable, plaintext never persisted.
    const raw = await IdCard.findOne({ user: user._id }).lean();
    expect(raw?.aadhaarEnc).not.toContain(AADHAAR);
    expect(decryptPII(raw!.aadhaarEnc)).toBe(AADHAAR);
    expect(raw?.aadhaarLast4).toBe("1234");
    expect(decryptPII(raw!.panEnc)).toBe(PAN);
  });

  it("approves with a unique member id, then renders a downloadable PDF", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const user = await makeUser({ avatarUrl: PHOTO, city: "Rohtak" });
    await submitCard(user._id.toString(), KYC);

    const card = await IdCard.findOne({ user: user._id }).lean();
    const approved = await approveCard(card!._id.toString(), admin._id.toString());

    expect(approved.status).toBe(IdCardStatus.APPROVED);
    expect(approved.memberId).toMatch(/^BHAV-\d{4}-\d{6}$/);
    expect(approved.canDownload).toBe(true);
    expect(approved.expiresAt).not.toBeNull();

    // Owner can pull the print payload; render it to a real PDF (no network photo).
    const print = await getDownloadableCard(card!._id.toString(), {
      id: user._id.toString(),
      role: UserRole.USER,
    });
    expect(print.memberId).toBe(approved.memberId);
    const pdf = await renderIdCardPdf({ ...print, photoUrl: "" });
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("gives different member ids to different members", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const a = await makeUser({ avatarUrl: PHOTO });
    const b = await makeUser({ avatarUrl: PHOTO });
    await submitCard(a._id.toString(), KYC);
    await submitCard(b._id.toString(), KYC);
    const [ca, cb] = await Promise.all([
      IdCard.findOne({ user: a._id }).lean(),
      IdCard.findOne({ user: b._id }).lean(),
    ]);
    const ra = await approveCard(ca!._id.toString(), admin._id.toString());
    const rb = await approveCard(cb!._id.toString(), admin._id.toString());
    expect(ra.memberId).not.toBe(rb.memberId);
  });
});

describe("reject and resubmit", () => {
  it("rejects with a reason, then a resubmit returns to PENDING (same card)", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const user = await makeUser({ avatarUrl: PHOTO });
    await submitCard(user._id.toString(), KYC);
    const card = await IdCard.findOne({ user: user._id }).lean();

    const rejected = await rejectCard(card!._id.toString(), admin._id.toString(), "Aadhaar unreadable");
    expect(rejected.status).toBe(IdCardStatus.REJECTED);
    expect(rejected.rejectionReason).toBe("Aadhaar unreadable");

    const resubmitted = await submitCard(user._id.toString(), { ...KYC, address: "New address 400001" });
    expect(resubmitted.status).toBe(IdCardStatus.PENDING);
    expect(resubmitted.rejectionReason).toBeNull();

    // Still exactly one card for this user.
    expect(await IdCard.countDocuments({ user: user._id })).toBe(1);
  });

  it("won't let a member resubmit once approved", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const user = await makeUser({ avatarUrl: PHOTO });
    await submitCard(user._id.toString(), KYC);
    const card = await IdCard.findOne({ user: user._id }).lean();
    await approveCard(card!._id.toString(), admin._id.toString());

    expect(await codeOf(() => submitCard(user._id.toString(), KYC))).toBe("ALREADY_ISSUED");
  });
});

describe("admin issue (allotment)", () => {
  it("creates an approved card directly and saves the photo to a member with none", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const user = await makeUser({ city: "Delhi" }); // no avatar
    const dto = await adminIssueCard({
      userId: user._id.toString(),
      ...KYC,
      photoUrl: PHOTO,
      adminId: admin._id.toString(),
    });

    expect(dto.status).toBe(IdCardStatus.APPROVED);
    expect(dto.issuedByAdmin).toBe(true);
    expect(dto.memberId).toMatch(/^BHAV-\d{4}-\d{6}$/);
    expect(dto.photoUrl).toBe(PHOTO);

    // Photo persisted to the member's profile since they had none.
    const fresh = await User.findById(user._id).select("avatarUrl").lean();
    expect(fresh?.avatarUrl).toBe(PHOTO);
  });
});

describe("reveal + authorization", () => {
  it("decrypts full PII for admin reveal", async () => {
    const user = await makeUser({ avatarUrl: PHOTO });
    await submitCard(user._id.toString(), KYC);
    const card = await IdCard.findOne({ user: user._id }).lean();
    const pii = await adminRevealCard(card!._id.toString());
    expect(pii).toEqual({ aadhaar: AADHAAR, pan: PAN });
  });

  it("blocks download for a non-owner non-admin and for un-approved cards", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const owner = await makeUser({ avatarUrl: PHOTO });
    const stranger = await makeUser();
    await submitCard(owner._id.toString(), KYC);
    const card = await IdCard.findOne({ user: owner._id }).lean();
    const cardId = card!._id.toString();

    // Pending → not ready, even for the owner.
    expect(await codeOf(() => getDownloadableCard(cardId, { id: owner._id.toString(), role: UserRole.USER }))).toBe("NOT_READY");

    await approveCard(cardId, admin._id.toString());
    // Stranger forbidden; admin allowed.
    expect(await codeOf(() => getDownloadableCard(cardId, { id: stranger._id.toString(), role: UserRole.USER }))).toBe("FORBIDDEN");
    const asAdmin = await getDownloadableCard(cardId, { id: admin._id.toString(), role: UserRole.ADMIN });
    expect(asAdmin.memberId).toBeTruthy();
  });
});

describe("admin list", () => {
  it("tallies statuses and returns masked values", async () => {
    const admin = await makeUser({ role: UserRole.ADMIN });
    const u1 = await makeUser({ avatarUrl: PHOTO });
    const u2 = await makeUser({ avatarUrl: PHOTO });
    await submitCard(u1._id.toString(), KYC);
    await submitCard(u2._id.toString(), KYC);
    const c1 = await IdCard.findOne({ user: u1._id }).lean();
    await approveCard(c1!._id.toString(), admin._id.toString());

    const page = await adminListCards({});
    expect(page.counts.pending).toBeGreaterThanOrEqual(1);
    expect(page.counts.approved).toBeGreaterThanOrEqual(1);
    expect(page.items.every((i) => i.aadhaarMasked.startsWith("XXXX"))).toBe(true);
  });
});
