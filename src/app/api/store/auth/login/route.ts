import { handle, ok, fail } from "@/server/http";
import bcrypt from "bcryptjs";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import {
  createStoreMemberToken,
  STORE_SESSION_COOKIE,
} from "@/server/store/auth/session";
import { z } from "zod";

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Phone or Member ID is required"),
  password: z.string().min(1, "Password is required"),
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = loginSchema.parse(body);

  const db = await getStoreDb();
  const StoreMember = getStoreMemberModel(db);

  const identifier = parsed.identifier;
  const isMemberId = identifier.toUpperCase().startsWith("JMD-");

  const member = await StoreMember.findOne(
    isMemberId
      ? { memberId: identifier.toUpperCase() }
      : { phone: identifier },
  );

  if (!member) {
    return fail("Invalid credentials.", 401, { code: "INVALID_CREDENTIALS" });
  }

  if (member.status === "BLOCKED" || member.status === "SUSPENDED") {
    return fail(`Account is ${member.status.toLowerCase()}.`, 403, {
      code: "ACCOUNT_LOCKED",
    });
  }

  const isValidPassword = await bcrypt.compare(
    parsed.password,
    member.passwordHash,
  );
  if (!isValidPassword) {
    return fail("Invalid credentials.", 401, { code: "INVALID_CREDENTIALS" });
  }

  member.lastLoginAt = new Date();
  await member.save();

  const token = createStoreMemberToken(member);

  const response = ok({
    success: true,
    member: {
      memberId: member.memberId,
      name: member.name,
      phone: member.phone,
      tier: member.tier,
      sponsorId: member.sponsorId,
    },
  });

  response.cookies.set(STORE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
});
