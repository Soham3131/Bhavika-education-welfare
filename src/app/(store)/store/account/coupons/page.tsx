"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Ticket,
  Coins,
  ArrowRight,
  Clock,
  Send,
  Printer,
  X,
  Sparkles,
  QrCode,
} from "lucide-react";

interface MemberCoupon {
  _id: string;
  couponCode: string;
  faceValuePaise: number;
  couponType?: "STANDARD" | "SUPER" | "MINI";
  source: string;
  status: "ACTIVE" | "REDEEMED" | "EXPIRED" | "CANCELLED" | "TRANSFERRED";
  expiresAt: string;
  isEligibleForDraw: boolean;
}

interface PointsStatus {
  productPoints: number;
  equivalentRupees: number;
  minPointsToRedeem: number;
  stepPoints: number;
  canRedeem: boolean;
}

export default function MemberCouponsPage() {
  const [coupons, setCoupons] = useState<MemberCoupon[]>([]);
  const [pointsStatus, setPointsStatus] = useState<PointsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [pointsToConvert, setPointsToConvert] = useState(5000);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Transfer Modal State
  const [transferringCoupon, setTransferringCoupon] = useState<MemberCoupon | null>(null);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // Print/View Modal State
  const [viewingCoupon, setViewingCoupon] = useState<MemberCoupon | null>(null);

  const loadData = () => {
    fetch("/api/store/coupons")
      .then((r) => r.json())
      .then((res) => {
        if (res.coupons) setCoupons(res.coupons);
        if (res.pointsStatus) {
          setPointsStatus(res.pointsStatus);
          setPointsToConvert(res.pointsStatus.minPointsToRedeem || 5000);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConvertPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    setConverting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/store/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONVERT_POINTS",
          pointsToConvert,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert points");
      setMsg({ type: "success", text: data.message });
      loadData();
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error converting points",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleTransferCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringCoupon) return;
    setTransferLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/store/coupons/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponId: transferringCoupon._id,
          toPhone: recipientPhone.trim(),
          note: transferNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to transfer coupon");
      setMsg({ type: "success", text: data.message || "Coupon transferred successfully!" });
      setTransferringCoupon(null);
      setRecipientPhone("");
      setTransferNote("");
      loadData();
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error transferring coupon",
      });
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900 tracking-tight">
            My Coupons & Points
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Manage your store coupons, Super Coupons, transfer to peers, and redeem loyalty points
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/store/account/referrals"
            className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-xs font-semibold"
          >
            Sponsor Tree & Referrals
          </Link>
          <Link
            href="/store/account/orders"
            className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-xs font-semibold"
          >
            My Orders
          </Link>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold border ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Points Card & Conversion */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 p-6 bg-linear-to-br from-amber-500 to-amber-600 text-white rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-amber-100">
              Product Points Balance
            </span>
            <Coins className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <div className="text-4xl font-black">
              {pointsStatus?.productPoints.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-amber-100 mt-1">
              Worth approx. ₹{pointsStatus?.equivalentRupees.toLocaleString() ?? 0} in store coupons
            </div>
          </div>
          <div className="pt-2 border-t border-amber-400/40 text-[11px] text-amber-100">
            Earn points with every purchase. 10 points = ₹1 coupon value.
          </div>
        </div>

        {/* Convert points form */}
        <div className="md:col-span-2 p-6 bg-white border border-ink-200 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-brand-600" />
            Convert Product Points into Store Coupons
          </h3>
          <p className="text-xs text-ink-500 leading-relaxed">
            Convert your points in steps of {pointsStatus?.stepPoints.toLocaleString() ?? 500} points.
            Generated coupons are valid for 90 days and eligible for the monthly lucky draw!
          </p>

          <form onSubmit={handleConvertPoints} className="space-y-4 pt-2">
            <div className="flex items-center gap-4">
              <div className="w-48">
                <label className="block text-[11px] font-bold text-ink-600 mb-1">
                  Points to Convert
                </label>
                <input
                  type="number"
                  min={pointsStatus?.minPointsToRedeem || 5000}
                  step={pointsStatus?.stepPoints || 500}
                  value={pointsToConvert}
                  onChange={(e) => setPointsToConvert(Number(e.target.value))}
                  className="w-full p-2.5 border border-ink-200 rounded-lg text-sm font-bold text-ink-900"
                />
              </div>
              <div className="pt-5">
                <div className="text-xs font-bold text-ink-700">
                  Coupon Value:{" "}
                  <span className="text-brand-600 text-base font-black">
                    ₹{Math.floor(pointsToConvert / 10)}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={converting || !(pointsStatus?.canRedeem)}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-2"
            >
              <span>{converting ? "Converting..." : "Generate Store Coupon"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {!pointsStatus?.canRedeem && (
              <p className="text-[11px] text-amber-700">
                You need at least {pointsStatus?.minPointsToRedeem.toLocaleString()} points to generate a coupon.
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Coupons List */}
      <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-6 border-b border-ink-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">
            My Coupons Portfolio ({coupons.length})
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-ink-400 animate-pulse">
            Loading your coupons...
          </div>
        ) : coupons.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Ticket className="w-10 h-10 text-ink-300 mx-auto" />
            <h4 className="text-sm font-bold text-ink-700">No coupons yet</h4>
            <p className="text-xs text-ink-400 max-w-sm mx-auto">
              You will receive coupons upon qualifying orders, promotional plan purchases, or lucky draw events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {coupons.map((c) => (
              <div
                key={c._id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-ink-50/50 transition"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-black text-ink-900 text-sm">
                      {c.couponCode}
                    </span>
                    {c.couponType === "SUPER" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        SUPER COUPON
                      </span>
                    )}
                    {c.couponType === "MINI" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        MINI COUPON
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700"
                          : c.status === "REDEEMED"
                          ? "bg-blue-50 text-blue-700"
                          : c.status === "TRANSFERRED"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {c.status}
                    </span>
                    {c.isEligibleForDraw ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                        Draw Eligible
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                        Store Discount Only
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500">
                    Source: <span className="font-semibold text-ink-700">{c.source}</span>
                  </div>
                </div>

                <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2">
                  <div className="text-lg font-black text-brand-600">
                    ₹{(c.faceValuePaise / 100).toFixed(0)}
                  </div>
                  <div className="text-[11px] text-ink-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Expires: {new Date(c.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setViewingCoupon(c)}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" />
                      <span>View & Print</span>
                    </button>
                    {c.status === "ACTIVE" && (
                      <button
                        onClick={() => {
                          setTransferringCoupon(c);
                          setRecipientPhone("");
                          setTransferNote("");
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Transfer</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transfer Coupon Modal */}
      {transferringCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base">Transfer Coupon</h3>
                <p className="text-xs text-slate-500">
                  Send this coupon directly to another registered member
                </p>
              </div>
              <button
                onClick={() => setTransferringCoupon(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              <span className="font-bold">Coupon Code:</span>{" "}
              <span className="font-mono font-black">{transferringCoupon.couponCode}</span>
              <br />
              <span className="font-bold">Face Value:</span> ₹{transferringCoupon.faceValuePaise / 100}
            </div>

            <form onSubmit={handleTransferCoupon} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Member Mobile (10 Digits)
                </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  placeholder="e.g. 9876543210"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Transfer Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Gift for festival shopping"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTransferringCoupon(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferLoading || !recipientPhone}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  {transferLoading ? "Transferring..." : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print / View Modal */}
      {viewingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 print:p-0 print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 print:hidden">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Voucher Preview
              </span>
              <button
                onClick={() => setViewingCoupon(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Voucher Card */}
            <div className="border-2 border-dashed border-amber-400 bg-linear-to-br from-amber-50 via-white to-amber-50/50 p-6 rounded-2xl space-y-4 text-center">
              <div className="flex items-center justify-between text-xs text-amber-800 font-bold">
                <span>JAI MAA DURGA STORE</span>
                <span>
                  {viewingCoupon.couponType === "SUPER"
                    ? (viewingCoupon.isEligibleForDraw ? "SUPER DRAW VOUCHER" : "SUPER STORE VOUCHER")
                    : viewingCoupon.couponType === "MINI"
                    ? (viewingCoupon.isEligibleForDraw ? "MINI DRAW VOUCHER" : "MINI DISCOUNT COUPON")
                    : "STORE COUPON"}
                </span>
              </div>

              <div className="py-2">
                <div className="text-4xl font-black text-amber-600 tracking-tight">
                  ₹{(viewingCoupon.faceValuePaise / 100).toFixed(0)}
                </div>
                <div className="text-xs text-slate-500 mt-1">OFF ON QUALIFYING PURCHASES</div>
                {!viewingCoupon.isEligibleForDraw && (
                  <div className="mt-2 text-[10px] text-amber-800 bg-amber-100/70 border border-amber-200 rounded-md py-1 px-2 font-medium">
                    Store Shopping Discount Voucher
                  </div>
                )}
              </div>

              <div className="bg-white border border-amber-200 py-2.5 px-4 rounded-xl inline-block shadow-xs">
                <div className="font-mono text-base font-black text-slate-900 tracking-wider">
                  {viewingCoupon.couponCode}
                </div>
              </div>

              {/* QR / Barcode Visual */}
              <div className="flex justify-center py-2">
                <div className="p-3 bg-white border border-slate-200 rounded-xl inline-flex flex-col items-center gap-1 shadow-xs">
                  <QrCode className="w-16 h-16 text-slate-900" />
                  <span className="font-mono text-[9px] text-slate-400">{viewingCoupon.couponCode}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 border-t border-amber-200/60 pt-3">
                Valid until {new Date(viewingCoupon.expiresAt).toLocaleDateString()} &bull; Non-transferable once redeemed
              </div>
            </div>

            <div className="flex justify-end gap-3 print:hidden">
              <button
                onClick={() => setViewingCoupon(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
