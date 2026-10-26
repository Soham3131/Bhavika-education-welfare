import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  listMemberEmis,
  payEmiInstalment,
  requestEmiCancellation,
} from "@/server/store/services/emi.service";
import { z } from "zod";

const emiActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("PAY_INSTALMENT"),
    emiId: z.string().min(1, "emiId required"),
    instalmentNumber: z.number().int().min(1),
  }),
  z.object({
    action: z.literal("REQUEST_CANCEL"),
    emiId: z.string().min(1, "emiId required"),
    reason: z.string().min(3, "Cancellation reason required"),
  }),
]);

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const emis = await listMemberEmis(session.memberId);
  return ok({ emis });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = emiActionSchema.parse(body);

  if (parsed.action === "PAY_INSTALMENT") {
    const emi = await payEmiInstalment({
      emiId: parsed.emiId,
      instalmentNumber: parsed.instalmentNumber,
      memberId: session.memberId,
    });
    return ok({
      message: `Instalment #${parsed.instalmentNumber} paid successfully! Promotional coupon issued.`,
      emi,
    });
  }

  if (parsed.action === "REQUEST_CANCEL") {
    const emi = await requestEmiCancellation({
      emiId: parsed.emiId,
      memberId: session.memberId,
      reason: parsed.reason,
    });
    return ok({
      message: "EMI cancellation request submitted for administrative review.",
      emi,
    });
  }

  return fail("Invalid action", 400);
});
