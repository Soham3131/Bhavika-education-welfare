import { handle, ok } from "@/server/http";
import { registerStoreMember } from "@/server/store/services/member.service";
import {
  createStoreMemberToken,
  STORE_SESSION_COOKIE,
} from "@/server/store/auth/session";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z.string().trim().min(10, "Valid phone number required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  sponsorId: z.string().trim().optional().or(z.literal("")),
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = registerSchema.parse(body);

  const member = await registerStoreMember({
    name: parsed.name,
    phone: parsed.phone,
    password: parsed.password,
    email: parsed.email || undefined,
    sponsorId: parsed.sponsorId || undefined,
  });

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
