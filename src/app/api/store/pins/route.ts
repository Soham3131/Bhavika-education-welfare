import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  listMemberPins,
  purchasePin,
  transferPin,
  activateMemberWithPin,
} from "@/server/store/services/pin.service";
import { PinTier } from "@/server/store/models/StorePin";
import { z } from "zod";

const pinActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PURCHASE"),
    tier: z.enum(["AREA", "CHIEF"]),
  }),
  z.object({
    action: z.literal("TRANSFER"),
    pinId: z.string().min(1, "pinId required"),
    toPhone: z.string().regex(/^\d{10}$/, "Valid 10-digit phone number required"),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("ACTIVATE_MEMBER"),
    pinId: z.string().min(1, "pinId required"),
    targetMemberPhone: z.string().regex(/^\d{10}$/, "Valid 10-digit phone number required"),
  }),
]);

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const pins = await listMemberPins(session.memberId);
  return ok({ pins });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = pinActionSchema.parse(body);

  if (parsed.action === "PURCHASE") {
    const pin = await purchasePin({
      memberId: session.memberId,
      tier: parsed.tier as PinTier,
    });
    return ok({
      message: `${pin.tier} activation PIN purchased successfully! Code: ${pin.pinCode}`,
      pin,
    });
  }

  if (parsed.action === "TRANSFER") {
    const pin = await transferPin({
      pinId: parsed.pinId,
      fromMemberId: session.memberId,
      toPhone: parsed.toPhone,
      note: parsed.note,
    });
    return ok({
      message: `PIN ${pin.pinCode} successfully transferred to ${parsed.toPhone}.`,
      pin,
    });
  }

  if (parsed.action === "ACTIVATE_MEMBER") {
    const result = await activateMemberWithPin({
      pinId: parsed.pinId,
      actingMemberId: session.memberId,
      targetMemberPhone: parsed.targetMemberPhone,
    });
    return ok({
      message: `Downline member (${parsed.targetMemberPhone}) successfully upgraded to ${result.tier} tier!`,
      result,
    });
  }

  return fail("Invalid action", 400);
});
