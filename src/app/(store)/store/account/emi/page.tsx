"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Calendar,
  CheckCircle2,
  Sparkles,
  Trophy,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

interface EmiInstalment {
  instalmentNumber: number;
  dueDate: string;
  amountPaise: number;
  status: "PENDING" | "PAID" | "OVERDUE" | "WAIVED_BY_PRIZE_WIN";
  paidAt?: string | null;
  waiverReason?: string | null;
}

interface EmiPlan {
  _id: string;
  emiRef: string;
  orderRef: string;
  totalPrincipalPaise: number;
  totalInstalments: number;
  monthlyAmountPaise: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED" | "DEFAULTED";
  paidInstalmentsCount: number;
  waivedInstalmentsCount: number;
  winnerStopsEmiApplied: boolean;
  winnerStopsEmiRef?: string | null;
  cancellationRequested: boolean;
  instalments: EmiInstalment[];
}

export default function MemberEmiPage() {
  const [emis, setEmis] = useState<EmiPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInstalment, setPayingInstalment] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = () => {
    fetch("/api/store/emi")
      .then((r) => r.json())
      .then((res) => {
        if (res.emis) setEmis(res.emis);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePay = async (emiId: string, instalmentNumber: number) => {
    setPayingInstalment(`${emiId}-${instalmentNumber}`);
    setMsg(null);
    try {
      const res = await fetch("/api/store/emi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PAY_INSTALMENT",
          emiId,
          instalmentNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      setMsg({ type: "success", text: data.message });
      loadData();
    } catch (err: unknown) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Payment failed",
      });
    } finally {
      setPayingInstalment(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-brand-600 to-indigo-700 p-8 text-white shadow-xl space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-brand-100">
          <CreditCard className="w-3.5 h-3.5 text-yellow-300" />
          <span>Flexible EMI & Promotional Rewards</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          My EMI Schedules & Instalments
        </h1>
        <p className="text-sm text-brand-100/90 leading-relaxed max-w-xl">
          Manage your monthly instalment schedules. Every paid instalment automatically issues a 5% promotional coupon.
          Under our <span className="font-bold text-yellow-200">Winner-Stops-EMI</span> rule, winning a bumper lucky draw completely waives all your remaining payments!
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center space-x-2 ${
            msg.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-ink-400 animate-pulse">
          Loading your EMI payment plans...
        </div>
      ) : emis.length === 0 ? (
        <div className="p-12 text-center bg-white border border-ink-100 rounded-2xl shadow-xs space-y-3">
          <CreditCard className="w-12 h-12 text-ink-300 mx-auto" />
          <div className="text-base font-bold text-ink-800">
            No Active EMI Plans
          </div>
          <p className="text-xs text-ink-500 max-w-sm mx-auto">
            Purchase gold or silver jewellery with convenient monthly instalments and unlock exclusive reward coupons.
          </p>
          <Link
            href="/store/products"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold"
          >
            <span>Explore Jewellery & Store</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {emis.map((plan) => (
            <div
              key={plan._id}
              className="bg-white border border-ink-100 rounded-2xl shadow-sm overflow-hidden"
            >
              {/* Plan Header */}
              <div className="p-6 border-b border-ink-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-ink-50/50 to-white">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-ink-500">
                      {plan.emiRef}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        plan.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700"
                          : plan.status === "ACTIVE"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {plan.status}
                    </span>
                    {plan.winnerStopsEmiApplied && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 flex items-center space-x-1">
                        <Trophy className="w-3 h-3 text-amber-600" />
                        <span>WINNER STOPS EMI APPLIED</span>
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-ink-900 mt-1">
                    Order Reference: {plan.orderRef}
                  </div>
                </div>

                <div className="text-right sm:text-right">
                  <div className="text-[11px] font-bold text-ink-400 uppercase">
                    Total Principal
                  </div>
                  <div className="text-xl font-black text-brand-600">
                    ₹{(plan.totalPrincipalPaise / 100).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-[11px] text-ink-500">
                    {plan.paidInstalmentsCount + plan.waivedInstalmentsCount} of{" "}
                    {plan.totalInstalments} settled
                  </div>
                </div>
              </div>

              {/* Instalments Grid */}
              <div className="p-6">
                <div className="text-xs font-bold text-ink-700 uppercase tracking-wider mb-3">
                  Monthly Instalments Breakdown
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {plan.instalments.map((inst) => (
                    <div
                      key={inst.instalmentNumber}
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-2 ${
                        inst.status === "PAID"
                          ? "bg-emerald-50/40 border-emerald-200"
                          : inst.status === "WAIVED_BY_PRIZE_WIN"
                          ? "bg-amber-50/40 border-amber-200"
                          : "bg-white border-ink-200"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-ink-800">
                            Instalment #{inst.instalmentNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              inst.status === "PAID"
                                ? "bg-emerald-100 text-emerald-800"
                                : inst.status === "WAIVED_BY_PRIZE_WIN"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-ink-100 text-ink-600"
                            }`}
                          >
                            {inst.status === "WAIVED_BY_PRIZE_WIN"
                              ? "WAIVED (PRIZE)"
                              : inst.status}
                          </span>
                        </div>
                        <div className="text-base font-black text-ink-900 mt-1">
                          ₹{(inst.amountPaise / 100).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-ink-500 flex items-center space-x-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-ink-400" />
                          <span>
                            Due: {new Date(inst.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {inst.status === "PENDING" && plan.status === "ACTIVE" && (
                        <button
                          onClick={() => handlePay(plan._id, inst.instalmentNumber)}
                          disabled={payingInstalment === `${plan._id}-${inst.instalmentNumber}`}
                          className="w-full mt-2 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs"
                        >
                          {payingInstalment === `${plan._id}-${inst.instalmentNumber}`
                            ? "Processing..."
                            : "Pay from Wallet"}
                        </button>
                      )}

                      {inst.status === "PAID" && (
                        <div className="text-[10px] font-semibold text-emerald-700 flex items-center space-x-1">
                          <Sparkles className="w-3 h-3" />
                          <span>5% Reward Coupon Issued</span>
                        </div>
                      )}

                      {inst.status === "WAIVED_BY_PRIZE_WIN" && (
                        <div className="text-[10px] font-bold text-amber-700">
                          {inst.waiverReason || "Waived upon lucky draw victory"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
