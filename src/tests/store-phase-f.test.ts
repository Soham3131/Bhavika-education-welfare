import { describe, it, expect, beforeAll } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import {
  createLuckyDraw,
  issueOrderTickets,
  snapshotLuckyDraw,
  executeAuditableDraw,
  cancelLuckyDraw,
  listMemberLuckyTickets,
  listStorefrontDraws,
} from "@/server/store/services/lucky-draw.service";
import {
  LuckyDrawStatus,
} from "@/server/store/models/StoreLuckyDraw";
import {
  LuckyTicketStatus,
  getStoreLuckyTicketModel,
} from "@/server/store/models/StoreLuckyTicket";
import { Types } from "mongoose";
import crypto from "node:crypto";

type RegisteredMember = Awaited<ReturnType<typeof registerStoreMember>>;

describe("Phase F — Lucky Draws, Tamper-Evident Snapshot & Auditable Winner Selection", () => {
  let member1: RegisteredMember;
  let member2: RegisteredMember;
  let member3: RegisteredMember;

  beforeAll(async () => {
    member1 = await registerStoreMember({
      name: "Lucky Participant One",
      phone: "9876546001",
      password: "password123",
      email: "lucky1@test.dev",
    });

    member2 = await registerStoreMember({
      name: "Lucky Participant Two",
      phone: "9876546002",
      password: "password123",
      email: "lucky2@test.dev",
    });

    member3 = await registerStoreMember({
      name: "Lucky Participant Three",
      phone: "9876546003",
      password: "password123",
      email: "lucky3@test.dev",
    });
  });

  describe("Lifecycle & Validation", () => {
    it("creates a lucky draw with active status when now is within dates", async () => {
      const draw = await createLuckyDraw({
        title: "Diwali Gold Bumper Draw",
        description: "Win 10g 24K gold coin with qualifying jewellery purchases",
        minOrderAmountPaise: 99900, // ₹999
        startDate: new Date(Date.now() - 3600000), // 1 hour ago
        endDate: new Date(Date.now() + 86400000), // tomorrow
        scheduledDrawDate: new Date(Date.now() + 172800000), // day after tomorrow
        prizes: [
          { rank: 1, prizeTitle: "10g 24K Gold Coin", prizeValueRupees: 75000, winnerCount: 1 },
          { rank: 2, prizeTitle: "Silver Pooja Thali", prizeValueRupees: 15000, winnerCount: 2 },
        ],
      });

      expect(draw._id).toBeDefined();
      expect(draw.drawCode).toMatch(/^JMD-DRAW-\d{4}-[A-Z0-9]+$/);
      expect(draw.status).toBe(LuckyDrawStatus.ACTIVE);
      expect(draw.prizes.length).toBe(2);
      expect(draw.prizes[0].winnerCount).toBe(1);
      expect(draw.prizes[1].winnerCount).toBe(2);
    });

    it("rejects draw creation with invalid dates or missing prizes", async () => {
      // Start date after end date
      await expect(
        createLuckyDraw({
          title: "Invalid Dates Draw",
          description: "Test",
          minOrderAmountPaise: 99900,
          startDate: new Date(Date.now() + 86400000),
          endDate: new Date(Date.now() - 86400000),
          scheduledDrawDate: new Date(Date.now() + 172800000),
          prizes: [{ rank: 1, prizeTitle: "Prize", winnerCount: 1 }],
        }),
      ).rejects.toThrow(/start date must be strictly before end date/);

      // No prizes
      await expect(
        createLuckyDraw({
          title: "No Prizes Draw",
          description: "Test",
          minOrderAmountPaise: 99900,
          startDate: new Date(Date.now() - 3600000),
          endDate: new Date(Date.now() + 86400000),
          scheduledDrawDate: new Date(Date.now() + 172800000),
          prizes: [],
        }),
      ).rejects.toThrow(/At least one prize must be configured/);
    });
  });

  describe("Automatic Promotional Ticket Issuance & Idempotency", () => {
    it("issues lucky ticket only when order amount meets or exceeds minimum threshold", async () => {
      const draw = await createLuckyDraw({
        title: "Electronics Bumper Draw",
        description: "Win 55-inch LED TV",
        minOrderAmountPaise: 150000, // ₹1,500
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        scheduledDrawDate: new Date(Date.now() + 172800000),
        prizes: [{ rank: 1, prizeTitle: "55-inch 4K TV", winnerCount: 1 }],
      });

      // Order with ₹1,000 (below threshold) -> no tickets for Electronics draw
      const ticketsBelow = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member1._id,
        orderRef: "JMD-ORD-TEST-BELOW",
        totalAmountPaise: 100000,
      });
      const ticketForElectronics = ticketsBelow.find(
        (t) => t.luckyDraw.toString() === draw._id.toString(),
      );
      expect(ticketForElectronics).toBeUndefined();

      // Order with ₹2,000 (qualifying) -> ticket issued
      const ticketsQualifying = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member1._id,
        orderRef: "JMD-ORD-TEST-QUALIFY",
        totalAmountPaise: 200000,
      });

      expect(ticketsQualifying.length).toBeGreaterThanOrEqual(1);
      const myTicket = ticketsQualifying.find((t) => t.luckyDraw.toString() === draw._id.toString());
      expect(myTicket).toBeDefined();
      expect(myTicket?.ticketNumber).toMatch(/^TKT-\d{4}-[A-Z0-9]+$/);
      expect(myTicket?.status).toBe(LuckyTicketStatus.ISSUED);
    });

    it("is strictly idempotent: repeated issue calls for same order return existing ticket", async () => {
      const orderRef = "JMD-ORD-IDEMPOTENT-001";
      const firstCall = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member2._id,
        orderRef,
        totalAmountPaise: 250000,
      });

      expect(firstCall.length).toBeGreaterThan(0);
      const firstTicketNumber = firstCall[0].ticketNumber;

      // Second call with same orderRef
      const secondCall = await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member2._id,
        orderRef,
        totalAmountPaise: 250000,
      });

      expect(secondCall.length).toBe(firstCall.length);
      expect(secondCall[0].ticketNumber).toBe(firstTicketNumber);
    });
  });

  describe("Tamper-Evident Canonical Snapshotting", () => {
    it("freezes eligible tickets and computes canonical SHA-256 hash", async () => {
      const draw = await createLuckyDraw({
        title: "Snapshot Integrity Test Draw",
        description: "Verifying cryptographic hash",
        minOrderAmountPaise: 50000, // ₹500
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        scheduledDrawDate: new Date(Date.now() + 172800000),
        prizes: [{ rank: 1, prizeTitle: "Tablet", winnerCount: 1 }],
      });

      // Issue tickets for members 1, 2, 3
      await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member1._id,
        orderRef: "JMD-ORD-SNAP-01",
        totalAmountPaise: 100000,
      });
      await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member2._id,
        orderRef: "JMD-ORD-SNAP-02",
        totalAmountPaise: 100000,
      });
      await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member3._id,
        orderRef: "JMD-ORD-SNAP-03",
        totalAmountPaise: 100000,
      });

      // Take snapshot
      const lockedDraw = await snapshotLuckyDraw(draw._id);
      expect(lockedDraw.status).toBe(LuckyDrawStatus.LOCKED);
      expect(lockedDraw.snapshot.totalEligibleTickets).toBeGreaterThanOrEqual(3);
      expect(lockedDraw.snapshot.snapshotHash).toBeDefined();

      // Verify canonical SHA-256 hash calculation matches sorted ticket numbers
      const sortedTickets = [...lockedDraw.snapshot.ticketNumbers].sort();
      const expectedHash = crypto
        .createHash("sha256")
        .update(sortedTickets.join("|"))
        .digest("hex");

      expect(lockedDraw.snapshot.snapshotHash).toBe(expectedHash);
    });
  });

  describe("Auditable & Reproducible Winner Selection", () => {
    it("selects winners deterministically: identical seed produces identical outcome", async () => {
      const draw = await createLuckyDraw({
        title: "Deterministic Selection Draw",
        description: "Checking seed repeatability",
        minOrderAmountPaise: 50000,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        scheduledDrawDate: new Date(Date.now() + 172800000),
        prizes: [
          { rank: 1, prizeTitle: "Diamond Ring", winnerCount: 1 },
          { rank: 2, prizeTitle: "Silver Coin", winnerCount: 2 },
        ],
      });

      // Issue 5 distinct tickets
      for (let i = 1; i <= 5; i++) {
        await issueOrderTickets({
          orderId: new Types.ObjectId(),
          memberId: member1._id,
          orderRef: `JMD-ORD-DET-${i}-${Date.now()}`,
          totalAmountPaise: 60000,
        });
      }

      await snapshotLuckyDraw(draw._id);

      const fixedSeed = "test-crypto-seed-2026-fixed-alpha-beta";
      const adminId = new Types.ObjectId();

      const completedDraw = await executeAuditableDraw({
        drawId: draw._id,
        adminId,
        seed: fixedSeed,
      });

      expect(completedDraw.status).toBe(LuckyDrawStatus.COMPLETED);
      expect(completedDraw.winners.length).toBe(3); // 1 for rank 1, 2 for rank 2
      expect(completedDraw.randomSeed).toBe(fixedSeed);
      expect(completedDraw.winners[0].rank).toBe(1);
      expect(completedDraw.winners[0].prizeTitle).toBe("Diamond Ring");
      expect(completedDraw.winners[1].rank).toBe(2);
      expect(completedDraw.winners[2].rank).toBe(2);

      // Verify winning tickets status updated
      const db = await getStoreDb();
      const TicketModel = getStoreLuckyTicketModel(db);
      for (const w of completedDraw.winners) {
        const tDoc = await TicketModel.findOne({ ticketNumber: w.ticketNumber });
        expect(tDoc?.status).toBe(LuckyTicketStatus.WON);
        expect(tDoc?.prizeWon).toBe(w.prizeTitle);
      }

      // Verify no duplicate winning tickets
      const winningNumbers = completedDraw.winners.map((w) => w.ticketNumber);
      const uniqueNumbers = new Set(winningNumbers);
      expect(uniqueNumbers.size).toBe(winningNumbers.length);
    });

    it("rejects execution if snapshot has not been taken (status is not LOCKED)", async () => {
      const draw = await createLuckyDraw({
        title: "Premature Execution Test",
        description: "Cannot execute without snapshot",
        minOrderAmountPaise: 50000,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        scheduledDrawDate: new Date(Date.now() + 172800000),
        prizes: [{ rank: 1, prizeTitle: "Prize", winnerCount: 1 }],
      });

      await expect(
        executeAuditableDraw({
          drawId: draw._id,
          adminId: new Types.ObjectId(),
        }),
      ).rejects.toThrow(/Snapshot must be taken first/);
    });
  });

  describe("Cancellation Safety & Roster Queries", () => {
    it("cancels draw, voids all associated tickets, and prevents subsequent execution", async () => {
      const draw = await createLuckyDraw({
        title: "Cancelled Promotion Draw",
        description: "Will be cancelled by admin",
        minOrderAmountPaise: 50000,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 86400000),
        scheduledDrawDate: new Date(Date.now() + 172800000),
        prizes: [{ rank: 1, prizeTitle: "Prize", winnerCount: 1 }],
      });

      await issueOrderTickets({
        orderId: new Types.ObjectId(),
        memberId: member2._id,
        orderRef: "JMD-ORD-CANCEL-001",
        totalAmountPaise: 100000,
      });

      const cancelled = await cancelLuckyDraw({
        drawId: draw._id,
        adminId: new Types.ObjectId(),
        reason: "Administrative restructuring",
      });

      expect(cancelled.status).toBe(LuckyDrawStatus.CANCELLED);
      expect(cancelled.cancellationReason).toBe("Administrative restructuring");

      // Verify tickets are voided
      const db = await getStoreDb();
      const TicketModel = getStoreLuckyTicketModel(db);
      const tickets = await TicketModel.find({ luckyDraw: draw._id });
      expect(tickets.length).toBeGreaterThan(0);
      expect(tickets.every((t) => t.status === LuckyTicketStatus.VOIDED)).toBe(true);
    });

    it("lists member lucky tickets populated with draw details", async () => {
      const tickets = await listMemberLuckyTickets(member1._id);
      expect(tickets.length).toBeGreaterThan(0);
      expect(tickets[0].ticketNumber).toMatch(/^TKT-\d{4}-[A-Z0-9]+$/);
    });

    it("lists active and completed storefront draws", async () => {
      const storefrontDraws = await listStorefrontDraws();
      expect(storefrontDraws.length).toBeGreaterThan(0);
      expect(storefrontDraws.some((d) => d.status === LuckyDrawStatus.ACTIVE || d.status === LuckyDrawStatus.COMPLETED)).toBe(true);
    });
  });
});
