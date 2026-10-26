import { handle, ok, fail } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  listAllLuckyDraws,
  createLuckyDraw,
  snapshotLuckyDraw,
  executeAuditableDraw,
  cancelLuckyDraw,
} from "@/server/store/services/lucky-draw.service";
import { AdminAuditLog } from "@/server/models";
import { Types } from "mongoose";
import { z } from "zod";

const prizeSchema = z.object({
  rank: z.number().int().min(1),
  prizeTitle: z.string().min(1, "Prize title required"),
  prizeDescription: z.string().optional(),
  prizeValueRupees: z.number().nonnegative().optional(),
  winnerCount: z.number().int().min(1).default(1),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().min(5, "Description must be at least 5 characters"),
    bannerUrl: z.string().url().optional().or(z.literal("")),
    minOrderAmountRupees: z.number().positive("Min order amount must be positive"),
    startDate: z.string().min(1, "Start date required"),
    endDate: z.string().min(1, "End date required"),
    scheduledDrawDate: z.string().min(1, "Scheduled draw date required"),
    prizes: z.array(prizeSchema).min(1, "At least one prize required"),
  }),
  z.object({
    action: z.literal("SNAPSHOT"),
    drawId: z.string().min(1, "drawId required"),
  }),
  z.object({
    action: z.literal("EXECUTE_DRAW"),
    drawId: z.string().min(1, "drawId required"),
    seed: z.string().optional(),
  }),
  z.object({
    action: z.literal("CANCEL"),
    drawId: z.string().min(1, "drawId required"),
    reason: z.string().min(3, "Cancellation reason required"),
  }),
]);

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const draws = await listAllLuckyDraws();
  return ok({ draws });
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = actionSchema.parse(body);

  if (parsed.action === "CREATE") {
    const draw = await createLuckyDraw({
      title: parsed.title,
      description: parsed.description,
      bannerUrl: parsed.bannerUrl || undefined,
      minOrderAmountPaise: Math.round(parsed.minOrderAmountRupees * 100),
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      scheduledDrawDate: parsed.scheduledDrawDate,
      prizes: parsed.prizes,
    });

    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "LUCKY_DRAW_CREATED",
      targetType: "STORE_LUCKY_DRAW",
      targetId: draw._id.toString(),
      meta: {
        drawCode: draw.drawCode,
        title: draw.title,
        prizesCount: draw.prizes.length,
      },
    });

    return ok({ message: `Lucky draw '${draw.title}' created successfully!`, draw });
  }

  if (parsed.action === "SNAPSHOT") {
    const draw = await snapshotLuckyDraw(parsed.drawId);

    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "LUCKY_DRAW_SNAPSHOT_TAKEN",
      targetType: "STORE_LUCKY_DRAW",
      targetId: draw._id.toString(),
      meta: {
        drawCode: draw.drawCode,
        totalEligibleTickets: draw.snapshot.totalEligibleTickets,
        snapshotHash: draw.snapshot.snapshotHash,
      },
    });

    return ok({
      message: `Snapshot locked for '${draw.title}'. Total eligible tickets: ${draw.snapshot.totalEligibleTickets}`,
      draw,
    });
  }

  if (parsed.action === "EXECUTE_DRAW") {
    const draw = await executeAuditableDraw({
      drawId: parsed.drawId,
      adminId: admin.id,
      seed: parsed.seed,
    });

    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "LUCKY_DRAW_EXECUTED",
      targetType: "STORE_LUCKY_DRAW",
      targetId: draw._id.toString(),
      meta: {
        drawCode: draw.drawCode,
        winnersCount: draw.winners.length,
        randomSeed: draw.randomSeed,
        snapshotHash: draw.snapshot.snapshotHash,
      },
    });

    return ok({
      message: `Draw completed! ${draw.winners.length} winners announced. Seed: ${draw.randomSeed}`,
      draw,
    });
  }

  if (parsed.action === "CANCEL") {
    const draw = await cancelLuckyDraw({
      drawId: parsed.drawId,
      adminId: admin.id,
      reason: parsed.reason,
    });

    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "LUCKY_DRAW_CANCELLED",
      targetType: "STORE_LUCKY_DRAW",
      targetId: draw._id.toString(),
      meta: {
        drawCode: draw.drawCode,
        reason: parsed.reason,
      },
    });

    return ok({ message: `Draw '${draw.title}' cancelled.`, draw });
  }

  return fail("Invalid action", 400);
});
