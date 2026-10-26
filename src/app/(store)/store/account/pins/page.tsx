"use client";

import React, { useEffect, useState } from "react";
import {
  KeyRound,
  ShieldCheck,
  Send,
  UserCheck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface Pin {
  _id: string;
  pinCode: string;
  tier: "AREA" | "CHIEF";
  faceValuePaise: number;
  status: "ACTIVE" | "REDEEMED" | "TRANSFERRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
}

export default function MemberPinsPage() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingTier, setBuyingTier] = useState<"AREA" | "CHIEF" | null>(null);
  const [transferModal, setTransferModal] = useState<Pin | null>(null);
  const [transferPhone, setTransferPhone] = useState("");
  const [activateModal, setActivateModal] = useState<Pin | null>(null);
  const [activatePhone, setActivatePhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = () => {
    fetch("/api/store/pins")
      .then((r) => r.json())
      .then((res) => {
        if (res.pins) setPins(res.pins);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePurchase = async (tier: "AREA" | "CHIEF") => {
    setBuyingTier(tier);
    setMsg(null);
    try {
      const res = await fetch("/api/store/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PURCHASE", tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      setMsg({ type: "success", text: data.message });
      loadData();
    } catch (err: unknown) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Purchase failed",
      });
    } finally {
      setBuyingTier(null);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/store/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TRANSFER",
          pinId: transferModal._id,
          toPhone: transferPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");
      setMsg({ type: "success", text: data.message });
      setTransferModal(null);
      setTransferPhone("");
      loadData();
    } catch (err: unknown) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Transfer failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activateModal) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/store/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACTIVATE_MEMBER",
          pinId: activateModal._id,
          targetMemberPhone: activatePhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activation failed");
      setMsg({ type: "success", text: data.message });
      setActivateModal(null);
      setActivatePhone("");
      loadData();
    } catch (err: unknown) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Activation failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-amber-600 to-orange-700 p-8 text-white shadow-xl space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-amber-100">
          <KeyRound className="w-3.5 h-3.5 text-yellow-300" />
          <span>Activation Tokens & Downline Network Powers</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          Membership PIN Management
        </h1>
        <p className="text-sm text-amber-100/90 leading-relaxed max-w-xl">
          PINs allow you to activate sponsored members in your downline directly to Area or Chief membership tiers.
          PIN activation is strictly scoped to your own network tree in compliance with direct-selling guidelines.
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

      {/* Buy PIN Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 bg-white border border-ink-100 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              Area Activation PIN
            </span>
            <span className="text-xl font-black text-ink-900">₹25,000</span>
          </div>
          <p className="text-xs text-ink-500">
            Activate any member in your downline to Area tier. Unlocks 60% recharge commission and Area referral benefits.
          </p>
          <button
            onClick={() => handlePurchase("AREA")}
            disabled={buyingTier === "AREA"}
            className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>
              {buyingTier === "AREA" ? "Purchasing..." : "Purchase Area PIN"}
            </span>
          </button>
        </div>

        <div className="p-6 bg-white border border-ink-100 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              Chief Activation PIN
            </span>
            <span className="text-xl font-black text-ink-900">₹1,00,000</span>
          </div>
          <p className="text-xs text-ink-500">
            Activate any downline member to Chief tier. Unlocks 80% recharge commission and maximum referral rewards.
          </p>
          <button
            onClick={() => handlePurchase("CHIEF")}
            disabled={buyingTier === "CHIEF"}
            className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>
              {buyingTier === "CHIEF" ? "Purchasing..." : "Purchase Chief PIN"}
            </span>
          </button>
        </div>
      </div>

      {/* Owned PINs Table */}
      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-ink-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">
            My PIN Inventory ({pins.length})
          </h3>
          <div className="text-[11px] text-ink-500 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Downline Scoped Activations Only</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                <th className="p-3">PIN Code</th>
                <th className="p-3">Tier</th>
                <th className="p-3 text-right">Face Value</th>
                <th className="p-3">Status</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-400 animate-pulse">
                    Loading your PIN inventory...
                  </td>
                </tr>
              ) : pins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-400">
                    You have no activation PINs in your inventory.
                  </td>
                </tr>
              ) : (
                pins.map((p) => (
                  <tr key={p._id} className="hover:bg-ink-50/50">
                    <td className="p-3 font-mono font-bold text-ink-900">
                      {p.pinCode}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.tier === "CHIEF"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {p.tier}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-ink-800">
                      ₹{(p.faceValuePaise / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.status === "REDEEMED"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-ink-100 text-ink-600"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-ink-500">
                      {new Date(p.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      {p.status === "ACTIVE" ? (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setActivateModal(p)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center space-x-1"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Activate Member</span>
                          </button>
                          <button
                            onClick={() => setTransferModal(p)}
                            className="px-2 py-1 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded text-[11px] font-semibold flex items-center space-x-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Transfer</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-ink-400 italic text-[11px]">
                          {p.status.toLowerCase()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
              <Send className="w-4 h-4 text-brand-600" />
              <span>Transfer PIN {transferModal.pinCode}</span>
            </h3>
            <form onSubmit={handleTransfer} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-ink-500 uppercase">
                  Recipient Member Phone (10 digits)
                </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  placeholder="9876543210"
                  value={transferPhone}
                  onChange={(e) => setTransferPhone(e.target.value)}
                  className="w-full p-2 border border-ink-200 rounded-lg font-mono text-sm"
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg font-bold"
                >
                  {submitting ? "Transferring..." : "Confirm Transfer"}
                </button>
                <button
                  type="button"
                  onClick={() => setTransferModal(null)}
                  className="px-4 py-2 border border-ink-200 text-ink-600 rounded-lg font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate Downline Modal */}
      {activateModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Activate Downline Member ({activateModal.tier})</span>
            </h3>
            <p className="text-[11px] text-ink-500">
              The member must be in your sponsored downline network. Upgrading them will redeem this PIN immediately.
            </p>
            <form onSubmit={handleActivate} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-ink-500 uppercase">
                  Downline Member Phone (10 digits)
                </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  placeholder="9876543210"
                  value={activatePhone}
                  onChange={(e) => setActivatePhone(e.target.value)}
                  className="w-full p-2 border border-ink-200 rounded-lg font-mono text-sm"
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold"
                >
                  {submitting ? "Activating..." : "Upgrade Member"}
                </button>
                <button
                  type="button"
                  onClick={() => setActivateModal(null)}
                  className="px-4 py-2 border border-ink-200 text-ink-600 rounded-lg font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
