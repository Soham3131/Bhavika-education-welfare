import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listAllEmis,
  approveEmiCancellation,
} from "@/server/store/services/emi.service";
import { AdminAuditLog } from "@/server/models";
import { Types } from "mongoose";
import { z } from "zod";

const emiAdminActionSchema = z.object({
  emiId: z.string().min(1, "emiId required"),
  decision: z.enum(["APPROVE", "REJECT"]),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const emis = await listAllEmis();
  return ok({ emis });
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = emiAdminActionSchema.parse(body);

  const emi = await approveEmiCancellation({
    emiId: parsed.emiId,
    adminId: admin.id,
    decision: parsed.decision,
  });

  await AdminAuditLog.create({
    admin: new Types.ObjectId(admin.id),
    action: parsed.decision === "APPROVE" ? "EMI_CANCELLATION_APPROVED" : "EMI_CANCELLATION_REJECTED",
    targetType: "STORE_EMI_SCHEDULE",
    targetId: emi._id.toString(),
    meta: {
      emiRef: emi.emiRef,
      decision: parsed.decision,
    },
  });

  return ok({
    message: `EMI cancellation request ${parsed.decision === "APPROVE" ? "approved" : "rejected"}.`,
    emi,
  });
});
