"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Ticket,
  Calendar,
  Gift,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface Prize {
  rank: number;
  prizeTitle: string;
  prizeDescription?: string;
  prizeValueRupees?: number;
  winnerCount: number;
}

interface Winner {
  rank: number;
  prizeTitle: string;
  ticketNumber: string;
  memberName?: string;
  orderRef?: string;
  awardedAt: string;
}

interface Draw {
  _id: string;
  drawCode: string;
  title: string;
  description: string;
  status: "UPCOMING" | "ACTIVE" | "LOCKED" | "COMPLETED" | "CANCELLED";
  minOrderAmountPaise: number;
  startDate: string;
  endDate: string;
  scheduledDrawDate: string;
  prizes: Prize[];
  winners: Winner[];
  snapshot?: {
    totalEligibleTickets: number;
    snapshotHash: string | null;
  };
}

interface MemberTicket {
  _id: string;
  ticketNumber: string;
  orderRef: string;
  status: "ISSUED" | "WON" | "NOT_SELECTED" | "VOIDED";
  prizeWon?: string | null;
  rankWon?: number | null;
  issuedAt: string;
  luckyDraw?: {
    _id: string;
    drawCode: string;
    title: string;
    status: string;
    scheduledDrawDate: string;
  };
}

export default function MemberDrawsPage() {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [myTickets, setMyTickets] = useState<MemberTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"draws" | "tickets">("draws");

  useEffect(() => {
    fetch("/api/store/draws")
      .then((r) => r.json())
      .then((res) => {
        if (res.draws) setDraws(res.draws);
        if (res.myTickets) setMyTickets(res.myTickets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const myWinningTickets = myTickets.filter((t) => t.status === "WON");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-amber-100">
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Auditable Promotional Bumper Draws</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Lucky Draws & Bumper Rewards
          </h1>
          <p className="text-sm text-amber-100/90 leading-relaxed">
            Every qualifying shopping order automatically earns free tamper-evident lucky draw tickets.
            All draws are 100% transparent and algorithmically verifiable.
          </p>
        </div>
      </div>

      {/* Winner Spotlight (If Member Won) */}
      {myWinningTickets.length > 0 && (
        <div className="p-6 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl shadow-md space-y-3">
          <div className="flex items-center space-x-2">
            <Trophy className="w-6 h-6 text-yellow-300 animate-bounce" />
            <h3 className="text-lg font-black">Congratulations! You Won a Prize!</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myWinningTickets.map((t) => (
              <div
                key={t._id}
                className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl space-y-1"
              >
                <div className="text-xs font-bold text-emerald-100">
                  {t.luckyDraw?.title || "Bumper Draw"} • Rank #{t.rankWon || 1}
                </div>
                <div className="text-base font-black text-yellow-200">
                  {t.prizeWon}
                </div>
                <div className="text-[11px] font-mono text-white/80">
                  Ticket #{t.ticketNumber} • Order: {t.orderRef}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-ink-200 space-x-6 text-sm font-bold">
        <button
          onClick={() => setActiveTab("draws")}
          className={`pb-3 flex items-center space-x-2 ${
            activeTab === "draws"
              ? "border-b-2 border-brand-500 text-brand-600"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Active & Past Draws ({draws.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("tickets")}
          className={`pb-3 flex items-center space-x-2 ${
            activeTab === "tickets"
              ? "border-b-2 border-brand-500 text-brand-600"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>My Lucky Tickets ({myTickets.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-ink-400 animate-pulse">
          Loading lucky draws and tickets...
        </div>
      ) : activeTab === "draws" ? (
        <div className="space-y-6">
          {draws.length === 0 ? (
            <div className="p-12 text-center bg-white border border-ink-100 rounded-2xl shadow-xs space-y-3">
              <Gift className="w-12 h-12 text-ink-300 mx-auto" />
              <div className="text-base font-bold text-ink-800">
                No Lucky Draws Scheduled Right Now
              </div>
              <p className="text-xs text-ink-500 max-w-sm mx-auto">
                Check back soon! New festival bumper draws with gold coins, silver thalis, and electronic prizes are launched regularly.
              </p>
              <Link
                href="/store/products"
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold"
              >
                <span>Browse Products</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {draws.map((d) => (
                <div
                  key={d._id}
                  className="bg-white border border-ink-100 rounded-2xl shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="p-6 border-b border-ink-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-ink-50/50 to-white">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                          {d.drawCode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700"
                              : d.status === "LOCKED"
                              ? "bg-amber-50 text-amber-700"
                              : d.status === "COMPLETED"
                              ? "bg-brand-50 text-brand-700"
                              : "bg-ink-100 text-ink-600"
                          }`}
                        >
                          {d.status === "LOCKED" ? "DRAW POOL LOCKED" : d.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-ink-900 mt-1">
                        {d.title}
                      </h3>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {d.description}
                      </p>
                    </div>

                    <div className="text-right sm:text-right">
                      <div className="text-[11px] font-bold text-ink-400 uppercase">
                        Scheduled Draw Date
                      </div>
                      <div className="text-sm font-black text-ink-900 flex items-center sm:justify-end space-x-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-600" />
                        <span>
                          {new Date(d.scheduledDrawDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Draw Content & Prize Roster */}
                  <div className="p-6 space-y-4 flex-1">
                    <div className="text-xs font-bold text-ink-700 uppercase tracking-wider">
                      Prize Showcase
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {d.prizes.map((p, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                            <span>Rank #{p.rank}</span>
                            <span className="text-[10px] bg-amber-200/60 text-amber-900 px-1.5 py-0.2 rounded">
                              {p.winnerCount} {p.winnerCount === 1 ? "Winner" : "Winners"}
                            </span>
                          </div>
                          <div className="font-bold text-xs text-ink-900">
                            {p.prizeTitle}
                          </div>
                          {p.prizeValueRupees ? (
                            <div className="text-[10px] font-mono text-ink-500">
                              Worth ₹{p.prizeValueRupees.toLocaleString("en-IN")}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {/* Announced Winners (If Completed) */}
                    {d.status === "COMPLETED" && d.winners.length > 0 && (
                      <div className="mt-4 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Announced Winners Roster</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {d.winners.map((w, wIdx) => (
                            <div
                              key={wIdx}
                              className="p-2 bg-white rounded-lg border border-emerald-100 flex items-center justify-between"
                            >
                              <div>
                                <span className="font-bold text-ink-900">
                                  #{w.rank} {w.prizeTitle}
                                </span>
                                <div className="text-[10px] text-ink-500">
                                  {w.memberName || "Participant"}
                                </div>
                              </div>
                              <div className="font-mono text-xs font-bold text-emerald-700">
                                {w.ticketNumber}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Draw Footer */}
                  <div className="p-4 bg-ink-50/50 border-t border-ink-100 flex items-center justify-between text-xs text-ink-500">
                    <div className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>
                        Qualifying order: ₹{(d.minOrderAmountPaise / 100).toFixed(2)}+
                      </span>
                    </div>
                    {d.snapshot?.totalEligibleTickets !== undefined && (
                      <div className="font-mono text-[11px] text-ink-600">
                        {d.snapshot.totalEligibleTickets} Tickets in Pool
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* My Tickets Tab */
        <div className="space-y-4">
          {myTickets.length === 0 ? (
            <div className="p-12 text-center bg-white border border-ink-100 rounded-2xl shadow-xs space-y-3">
              <Ticket className="w-12 h-12 text-ink-300 mx-auto" />
              <div className="text-base font-bold text-ink-800">
                You Have No Lucky Draw Tickets Yet
              </div>
              <p className="text-xs text-ink-500 max-w-sm mx-auto">
                Place an order of ₹999 or more in the store to automatically earn free tickets for all active bumper draws.
              </p>
              <Link
                href="/store/products"
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold"
              >
                <span>Shop to Earn Tickets</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-ink-100">
                <h3 className="text-sm font-bold text-ink-900">
                  Your Lucky Draw Tickets & Outcome History
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                      <th className="p-3">Ticket Number</th>
                      <th className="p-3">Draw</th>
                      <th className="p-3">Order Reference</th>
                      <th className="p-3">Issued Date</th>
                      <th className="p-3">Prize / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {myTickets.map((t) => (
                      <tr key={t._id} className="hover:bg-ink-50/50">
                        <td className="p-3 font-mono font-bold text-ink-900">
                          {t.ticketNumber}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-ink-800">
                            {t.luckyDraw?.title || "Bumper Draw"}
                          </div>
                          <div className="text-[10px] font-mono text-ink-400">
                            {t.luckyDraw?.drawCode}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-ink-600">
                          {t.orderRef}
                        </td>
                        <td className="p-3 text-ink-500">
                          {new Date(t.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          {t.status === "WON" ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 flex items-center space-x-1 w-max">
                              <Trophy className="w-3 h-3 text-amber-600" />
                              <span>WON: {t.prizeWon}</span>
                            </span>
                          ) : t.status === "ISSUED" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                              In Draw Pool
                            </span>
                          ) : t.status === "NOT_SELECTED" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ink-100 text-ink-500">
                              Completed (No Prize)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                              Voided
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
