import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { IStoreMemberDoc } from "../models/StoreMember";
import { AuthError } from "@/server/auth/session";

export const STORE_SESSION_COOKIE = "jmd_member_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface StoreMemberSessionPayload {
  memberId: string; // Sequential ID (e.g. JMD-2026-000001)
  storeMemberId: string; // Mongo ObjectId string
  name: string;
  phone: string;
  sessionVersion: number;
  exp: number;
}

function getSessionSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.STORE_SESSION_SECRET ||
    "fallback_insecure_development_secret_jmd_store_2026"
  );
}

export function createStoreMemberToken(member: IStoreMemberDoc): string {
  const payload: StoreMemberSessionPayload = {
    memberId: member.memberId,
    storeMemberId: member._id.toString(),
    name: member.name,
    phone: member.phone,
    sessionVersion: member.sessionVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

export function verifyStoreMemberToken(
  token: string,
): StoreMemberSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as StoreMemberSessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Reads the store member session from request cookies.
 */
export async function getStoreMemberSession(): Promise<StoreMemberSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STORE_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyStoreMemberToken(token);
}

/**
 * Requires a logged-in store member.
 */
export async function requireStoreMember(): Promise<StoreMemberSessionPayload> {
  const session = await getStoreMemberSession();
  if (!session) {
    throw new AuthError("UNAUTHENTICATED", "Store login required.");
  }
  return session;
}
