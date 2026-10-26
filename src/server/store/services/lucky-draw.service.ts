import "server-only";
import { Types } from "mongoose";
import crypto from "node:crypto";
import { getStoreDb } from "../db/connect";
import {
  getStoreLuckyDrawModel,
  IStoreLuckyDrawDoc,
  LuckyDrawStatus,
  ILuckyDrawPrize,
  ILuckyDrawWinner,
} from "../models/StoreLuckyDraw";
import {
  getStoreLuckyTicketModel,
  IStoreLuckyTicketDoc,
  LuckyTicketStatus,
} from "../models/StoreLuckyTicket";
import { getStoreMemberModel } from "../models/StoreMember";
import { DomainError } from "@/server/errors";

export interface CreateLuckyDrawInput {
  title: string;
  description: string;
  bannerUrl?: string;
  minOrderAmountPaise: number;
  startDate: Date | string;
  endDate: Date | string;
  scheduledDrawDate: Date | string;
  prizes: ILuckyDrawPrize[];
}

export function generateDrawCode(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `JMD-DRAW-${year}-${random}`;
}

export function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    random += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return `TKT-${year}-${random}`;
}

/**
 * Creates a new lucky draw.
 */
export async function createLuckyDraw(
  input: CreateLuckyDrawInput,
): Promise<IStoreLuckyDrawDoc> {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  const scheduledDrawDate = new Date(input.scheduledDrawDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || isNaN(scheduledDrawDate.getTime())) {
    throw new DomainError("Invalid draw schedule dates provided.", 400, "INVALID_DATES");
  }

  if (startDate >= endDate) {
    throw new DomainError("Draw start date must be strictly before end date.", 400, "INVALID_DATES");
  }

  if (endDate > scheduledDrawDate) {
    throw new DomainError("Scheduled draw date cannot precede draw end date.", 400, "INVALID_DATES");
  }

  if (!input.prizes || input.prizes.length === 0) {
    throw new DomainError("At least one prize must be configured.", 400, "INVALID_PRIZES");
  }

  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);

  const now = new Date();
  const status =
    now >= startDate && now <= endDate
      ? LuckyDrawStatus.ACTIVE
      : now < startDate
      ? LuckyDrawStatus.UPCOMING
      : LuckyDrawStatus.LOCKED;

  const draw = new DrawModel({
    drawCode: generateDrawCode(),
    title: input.title.trim(),
    description: input.description.trim(),
    bannerUrl: input.bannerUrl || null,
    status,
    minOrderAmountPaise: Math.max(100, input.minOrderAmountPaise),
    startDate,
    endDate,
    scheduledDrawDate,
    prizes: input.prizes,
  });

  await draw.save();
  return draw;
}

/**
 * Automatically mints lucky draw tickets for a qualifying paid order.
 * Strictly idempotent per draw and order.
 */
export async function issueOrderTickets(input: {
  orderId: string | Types.ObjectId;
  memberId: string | Types.ObjectId;
  orderRef: string;
  totalAmountPaise: number;
}): Promise<IStoreLuckyTicketDoc[]> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);
  const TicketModel = getStoreLuckyTicketModel(db);

  const now = new Date();
  const activeDraws = await DrawModel.find({
    status: LuckyDrawStatus.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
    minOrderAmountPaise: { $lte: input.totalAmountPaise },
  });

  const memberObjectId =
    typeof input.memberId === "string"
      ? new Types.ObjectId(input.memberId)
      : input.memberId;

  const issuedTickets: IStoreLuckyTicketDoc[] = [];

  for (const draw of activeDraws) {
    // Idempotency check: ticket already issued for this order in this draw
    const existing = await TicketModel.findOne({
      luckyDraw: draw._id,
      orderRef: input.orderRef,
    });

    if (existing) {
      issuedTickets.push(existing);
      continue;
    }

    const ticketNumber = generateTicketNumber();
    const ticket = new TicketModel({
      ticketNumber,
      luckyDraw: draw._id,
      member: memberObjectId,
      orderRef: input.orderRef,
      status: LuckyTicketStatus.ISSUED,
      issuedAt: now,
    });

    await ticket.save();
    issuedTickets.push(ticket);
  }

  return issuedTickets;
}

/**
 * Freezes eligible tickets into an immutable snapshot and locks the draw.
 * Generates canonical SHA-256 hash across sorted ticket numbers.
 */
export async function snapshotLuckyDraw(
  drawId: string | Types.ObjectId,
): Promise<IStoreLuckyDrawDoc> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);
  const TicketModel = getStoreLuckyTicketModel(db);

  const draw = await DrawModel.findById(drawId);
  if (!draw) {
    throw new DomainError("Lucky draw not found.", 404, "DRAW_NOT_FOUND");
  }

  if (draw.status !== LuckyDrawStatus.ACTIVE && draw.status !== LuckyDrawStatus.UPCOMING) {
    throw new DomainError(
      `Cannot snapshot draw with status '${draw.status}'. Must be ACTIVE or UPCOMING.`,
      400,
      "INVALID_DRAW_STATE",
    );
  }

  const tickets = await TicketModel.find({
    luckyDraw: draw._id,
    status: LuckyTicketStatus.ISSUED,
  }).select("ticketNumber");

  const ticketNumbers = tickets.map((t) => t.ticketNumber).sort(); // Canonical alphabetical sort
  const snapshotHash = crypto
    .createHash("sha256")
    .update(ticketNumbers.join("|"))
    .digest("hex");

  draw.status = LuckyDrawStatus.LOCKED;
  draw.snapshot = {
    takenAt: new Date(),
    totalEligibleTickets: ticketNumbers.length,
    snapshotHash,
    ticketNumbers,
  };

  await draw.save();
  return draw;
}

/**
 * Executes a deterministic, reproducible, and verifiable draw using cryptographic pseudorandomness.
 * Given identical seed and snapshot, the exact same winners are selected.
 */
export async function executeAuditableDraw(input: {
  drawId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  seed?: string;
}): Promise<IStoreLuckyDrawDoc> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);
  const TicketModel = getStoreLuckyTicketModel(db);
  const MemberModel = getStoreMemberModel(db);

  const draw = await DrawModel.findById(input.drawId);
  if (!draw) {
    throw new DomainError("Lucky draw not found.", 404, "DRAW_NOT_FOUND");
  }

  if (draw.status !== LuckyDrawStatus.LOCKED) {
    throw new DomainError(
      `Cannot execute draw with status '${draw.status}'. Snapshot must be taken first (status must be LOCKED).`,
      400,
      "INVALID_DRAW_STATE",
    );
  }

  const seed = input.seed?.trim() || crypto.randomBytes(32).toString("hex");
  const pool = [...draw.snapshot.ticketNumbers];

  // Flatten prize tiers into distinct prize slots (sorted by rank)
  const prizeSlots: Array<{
    rank: number;
    prizeTitle: string;
    prizeValueRupees?: number;
  }> = [];

  const sortedPrizes = [...draw.prizes].sort((a, b) => a.rank - b.rank);
  for (const prize of sortedPrizes) {
    for (let c = 0; c < prize.winnerCount; c++) {
      prizeSlots.push({
        rank: prize.rank,
        prizeTitle: prize.prizeTitle,
        prizeValueRupees: prize.prizeValueRupees,
      });
    }
  }

  const winners: ILuckyDrawWinner[] = [];
  const winningTicketNumbers = new Set<string>();

  for (let i = 0; i < prizeSlots.length; i++) {
    if (pool.length === 0) break; // Exhausted available tickets

    const slot = prizeSlots[i];
    // Reproducible selection using HMAC-SHA256
    const hmac = crypto
      .createHmac("sha256", seed)
      .update(`slot:${i}:rank:${slot.rank}`)
      .digest("hex");

    // Convert leading 12 hex chars to BigInt
    const selectedIndex = Number(BigInt("0x" + hmac.slice(0, 12)) % BigInt(pool.length));
    const chosenTicketNumber = pool[selectedIndex];

    pool.splice(selectedIndex, 1); // Remove to prevent ticket winning twice
    winningTicketNumbers.add(chosenTicketNumber);

    const ticket = await TicketModel.findOne({ ticketNumber: chosenTicketNumber });
    if (!ticket) continue;

    const member = await MemberModel.findById(ticket.member);

    winners.push({
      rank: slot.rank,
      prizeTitle: slot.prizeTitle,
      ticketNumber: chosenTicketNumber,
      member: ticket.member,
      memberName: member?.name || "Participant",
      memberPhone: member?.phone || undefined,
      orderRef: ticket.orderRef,
      awardedAt: new Date(),
    });

    // Mark winning ticket
    ticket.status = LuckyTicketStatus.WON;
    ticket.prizeWon = slot.prizeTitle;
    ticket.rankWon = slot.rank;
    await ticket.save();
  }

  // Mark all non-winning tickets in this draw as NOT_SELECTED
  await TicketModel.updateMany(
    {
      luckyDraw: draw._id,
      ticketNumber: { $nin: Array.from(winningTicketNumbers) },
      status: LuckyTicketStatus.ISSUED,
    },
    {
      status: LuckyTicketStatus.NOT_SELECTED,
    },
  );

  const adminObjectId =
    typeof input.adminId === "string"
      ? new Types.ObjectId(input.adminId)
      : input.adminId;

  draw.status = LuckyDrawStatus.COMPLETED;
  draw.winners = winners;
  draw.randomSeed = seed;
  draw.drawnAt = new Date();
  draw.drawnBy = adminObjectId;

  await draw.save();
  return draw;
}

/**
 * Cancels a lucky draw and marks all associated tickets VOIDED.
 */
export async function cancelLuckyDraw(input: {
  drawId: string | Types.ObjectId;
  adminId: string | Types.ObjectId;
  reason: string;
}): Promise<IStoreLuckyDrawDoc> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);
  const TicketModel = getStoreLuckyTicketModel(db);

  const draw = await DrawModel.findById(input.drawId);
  if (!draw) {
    throw new DomainError("Lucky draw not found.", 404, "DRAW_NOT_FOUND");
  }

  if (draw.status === LuckyDrawStatus.COMPLETED) {
    throw new DomainError("Cannot cancel a completed lucky draw.", 400, "CANNOT_CANCEL_COMPLETED");
  }

  draw.status = LuckyDrawStatus.CANCELLED;
  draw.cancellationReason = input.reason.trim();
  await draw.save();

  await TicketModel.updateMany(
    { luckyDraw: draw._id },
    { status: LuckyTicketStatus.VOIDED },
  );

  return draw;
}

/**
 * Lists active and recently completed draws for storefront display.
 */
export async function listStorefrontDraws(): Promise<IStoreLuckyDrawDoc[]> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);

  return DrawModel.find({
    status: { $in: [LuckyDrawStatus.ACTIVE, LuckyDrawStatus.UPCOMING, LuckyDrawStatus.COMPLETED] },
  }).sort({ scheduledDrawDate: 1 });
}

/**
 * Lists tickets issued to a specific member.
 */
export async function listMemberLuckyTickets(
  memberId: string | Types.ObjectId,
): Promise<IStoreLuckyTicketDoc[]> {
  const db = await getStoreDb();
  const TicketModel = getStoreLuckyTicketModel(db);

  const memberObjectId =
    typeof memberId === "string" ? new Types.ObjectId(memberId) : memberId;

  return TicketModel.find({ member: memberObjectId })
    .populate("luckyDraw", "drawCode title status scheduledDrawDate bannerUrl")
    .sort({ createdAt: -1 });
}

/**
 * Lists all draws for store administration.
 */
export async function listAllLuckyDraws(): Promise<IStoreLuckyDrawDoc[]> {
  const db = await getStoreDb();
  const DrawModel = getStoreLuckyDrawModel(db);

  return DrawModel.find().sort({ createdAt: -1 });
}
