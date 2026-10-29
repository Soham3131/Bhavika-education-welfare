"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Smartphone,
  Tv,
  Car,
  Zap,
  Flame,
  Droplets,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface Operator {
  id: string;
  name: string;
  serviceType: string;
}

interface RechargePlan {
  id: string;
  amountRupees: number;
  validity: string;
  description: string;
  category: string;
}

interface RechargeRecord {
  _id: string;
  rechargeRef: string;
  serviceType: string;
  operator: string;
  consumerNumber: string;
  amountPaise: number;
  status: "SUCCESS" | "PENDING_CONFIRMATION" | "FAILED" | "REVERSED";
  memberCommissionPaise: number;
  createdAt: string;
}

const SERVICE_TABS = [
  { id: "MOBILE_PREPAID", label: "Mobile", icon: Smartphone },
  { id: "DTH", label: "DTH", icon: Tv },
  { id: "FASTAG", label: "FASTag", icon: Car },
  { id: "ELECTRICITY", label: "Electricity", icon: Zap },
  { id: "GAS", label: "Gas", icon: Flame },
  { id: "WATER", label: "Water", icon: Droplets },
] as const;

export default function StoreRechargePage() {
  const [activeService, setActiveService] = useState<string>("MOBILE_PREPAID");
  const [operators, setOperators] = useState<Operator[]>([]);
  const [plans, setPlans] = useState<RechargePlan[]>([]);
  const [history, setHistory] = useState<RechargeRecord[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [selectedOperator, setSelectedOperator] = useState<string>("");
  const [consumerNumber, setConsumerNumber] = useState<string>("");
  const [amountRupees, setAmountRupees] = useState<number>(299);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [msg, setMsg] = useState<{ type: "success" | "error" | "pending"; text: string } | null>(null);

  const fetchServiceData = useCallback((service: string, op?: string) => {
    const url = `/api/store/recharge?service=${service}${op ? `&operator=${op}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.operators) {
          setOperators(res.operators);
          if (!op && res.operators.length > 0) {
            const defaultOp = res.operators[0].id;
            setSelectedOperator(defaultOp);
            fetch(`/api/store/recharge?service=${service}&operator=${defaultOp}`)
              .then((r2) => r2.json())
              .then((res2) => {
                if (res2.plans) setPlans(res2.plans);
              })
              .catch(() => {});
          }
        }
        if (res.plans) setPlans(res.plans);
        if (res.history) setHistory(res.history);
        if (typeof res.walletBalanceRupees === "number") {
          setWalletBalance(res.walletBalanceRupees);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchServiceData(activeService);
  }, [activeService, fetchServiceData]);

  const handleOperatorChange = (op: string) => {
    setSelectedOperator(op);
    fetchServiceData(activeService, op);
  };

  const handleSelectPlan = (plan: RechargePlan) => {
    setAmountRupees(plan.amountRupees);
  };

  const handleSubmitRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator || !consumerNumber || amountRupees <= 0) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch("/api/store/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: activeService,
          operator: selectedOperator,
          consumerNumber,
          amountRupees,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Recharge failed.");
      }

      if (data.status === "SUCCESS") {
        setMsg({ type: "success", text: data.message });
      } else if (data.status === "PENDING_CONFIRMATION") {
        setMsg({ type: "pending", text: data.message });
      }

      // Refresh balances and history
      fetchServiceData(activeService, selectedOperator);
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to process recharge",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#EBDCB9]/70 pb-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A] tracking-tight">
            Bill Payments & Recharges
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Instant mobile, DTH, utility recharges with guaranteed member cashback commissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#FAF7F2] border border-[#EBDCB9] rounded-xl text-right">
            <div className="text-[10px] font-bold text-[#6B0B1A] uppercase tracking-wider">
              Available Wallet Balance
            </div>
            <div className="text-lg font-black text-gray-900">
              ₹{walletBalance.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold border flex items-center gap-2 ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : msg.type === "pending"
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : msg.type === "pending" ? (
            <Clock className="w-4 h-4 shrink-0 text-blue-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Service Selector Tabs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {SERVICE_TABS.map((s) => {
          const Icon = s.icon;
          const isSelected = activeService === s.id;
          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveService(s.id);
                setMsg(null);
              }}
              className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-xs font-bold ${
                isSelected
                  ? "bg-[#6B0B1A] border-[#6B0B1A] text-white shadow-xs"
                  : "bg-white border-[#EBDCB9] text-gray-700 hover:border-[#C5A059] hover:bg-[#FAF7F2]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form & Plans Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recharge Form */}
        <div className="md:col-span-1 p-6 bg-white border border-ink-200 rounded-2xl shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-ink-900 border-b border-ink-100 pb-2">
            Recharge Details
          </h2>

          <form onSubmit={handleSubmitRecharge} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-ink-600 uppercase mb-1">
                Operator / Provider
              </label>
              <select
                value={selectedOperator}
                onChange={(e) => handleOperatorChange(e.target.value)}
                className="w-full p-2.5 border border-ink-200 rounded-lg text-xs font-bold text-ink-900 bg-white"
              >
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-600 uppercase mb-1">
                {activeService === "MOBILE_PREPAID"
                  ? "10-Digit Mobile Number"
                  : activeService === "DTH"
                  ? "Subscriber / Smart Card ID"
                  : activeService === "FASTAG"
                  ? "Vehicle / Wallet ID"
                  : "Consumer Account Number"}
              </label>
              <input
                type="text"
                required
                placeholder={
                  activeService === "MOBILE_PREPAID"
                    ? "e.g. 9876543210"
                    : "Enter consumer account number"
                }
                value={consumerNumber}
                onChange={(e) => setConsumerNumber(e.target.value)}
                className="w-full p-2.5 border border-ink-200 rounded-lg text-xs font-mono font-bold text-ink-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-600 uppercase mb-1">
                Recharge Amount (₹)
              </label>
              <input
                type="number"
                required
                min={1}
                value={amountRupees}
                onChange={(e) => setAmountRupees(Number(e.target.value))}
                className="w-full p-2.5 border border-ink-200 rounded-lg text-base font-black text-brand-600"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
              >
                <span>{submitting ? "Processing Recharge..." : `Pay ₹${amountRupees} via Wallet`}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-ink-400 text-center leading-relaxed">
              Deducted directly from your JMD store wallet. Commission credited upon confirmed operator success.
            </p>
          </form>
        </div>

        {/* Plans Browsing */}
        <div className="md:col-span-2 p-6 bg-white border border-ink-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-ink-100 pb-2">
            <h2 className="text-sm font-bold text-ink-900">
              Popular Plans for {selectedOperator}
            </h2>
            <span className="text-[11px] text-ink-400">Click a plan to select</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-ink-400 animate-pulse">
              Loading plans...
            </div>
          ) : plans.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">
              No pre-configured plans available. Enter custom bill amount manually.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectPlan(p)}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition ${
                    amountRupees === p.amountRupees
                      ? "border-brand-500 bg-brand-50/50"
                      : "border-ink-200 hover:border-ink-300 hover:bg-ink-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-black text-ink-900">
                      ₹{p.amountRupees}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-ink-100 text-ink-700">
                      {p.validity}
                    </span>
                  </div>
                  <p className="text-xs text-ink-600 mt-1 line-clamp-2">
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-6 border-b border-ink-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">
            Recent Recharge Transactions ({history.length})
          </h2>
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-400">
            No recharge orders placed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                  <th className="p-3">Reference</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Operator / Consumer</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Cashback Commission</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {history.map((h) => (
                  <tr key={h._id} className="hover:bg-ink-50/50">
                    <td className="p-3 font-mono font-bold text-ink-900">
                      {h.rechargeRef}
                    </td>
                    <td className="p-3 font-semibold text-ink-700">
                      {h.serviceType}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-ink-800">{h.operator}</div>
                      <div className="text-[10px] text-ink-400 font-mono">{h.consumerNumber}</div>
                    </td>
                    <td className="p-3 font-bold text-ink-900">
                      ₹{(h.amountPaise / 100).toFixed(2)}
                    </td>
                    <td className="p-3 font-bold text-brand-600">
                      ₹{(h.memberCommissionPaise / 100).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          h.status === "SUCCESS"
                            ? "bg-emerald-50 text-emerald-700"
                            : h.status === "PENDING_CONFIRMATION"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td className="p-3 text-ink-400">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
