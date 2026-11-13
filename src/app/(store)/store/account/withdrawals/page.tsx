"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Coins,
  ArrowRight,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Building,
  AlertCircle,
} from "lucide-react";

interface WithdrawalItem {
  _id: string;
  withdrawalRef: string;
  walletType: "FREE_REFERRAL" | "PAID_REFERRAL";
  amountPaise: number;
  status: "REQUESTED" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED" | "FAILED";
  bankDetails: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  };
  rejectionReason?: string | null;
  providerPayoutRef?: string | null;
  createdAt: string;
}

interface BalanceInfo {
  freeReferralPaise: number;
  paidReferralPaise: number;
  totalWithdrawablePaise: number;
}

export default function MemberWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [balances, setBalances] = useState<BalanceInfo>({
    freeReferralPaise: 0,
    paidReferralPaise: 0,
    totalWithdrawablePaise: 0,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [walletType, setWalletType] = useState<"FREE_REFERRAL" | "PAID_REFERRAL">("FREE_REFERRAL");
  const [amountRupees, setAmountRupees] = useState<string>("500");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");

  const loadData = () => {
    fetch("/api/store/withdrawals")
      .then((r) => r.json())
      .then((res) => {
        if (res.withdrawals) setWithdrawals(res.withdrawals);
        if (res.balances) setBalances(res.balances);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const amountPaise = Math.round(parseFloat(amountRupees || "0") * 100);
    if (isNaN(amountPaise) || amountPaise < 200_00) {
      setMsg({ type: "error", text: "Minimum withdrawal amount is ₹200." });
      return;
    }
    if (amountPaise > 50000_00) {
      setMsg({ type: "error", text: "Maximum withdrawal amount per request is ₹50,000." });
      return;
    }

    const maxAvailable =
      walletType === "FREE_REFERRAL"
        ? balances.freeReferralPaise
        : balances.paidReferralPaise;

    if (amountPaise > maxAvailable) {
      setMsg({
        type: "error",
        text: `Insufficient withdrawable balance in ${
          walletType === "FREE_REFERRAL" ? "Free" : "Paid"
        } Referral Wallet. Available: ₹${(maxAvailable / 100).toFixed(2)}.`,
      });
      return;
    }

    const cleanAcc = accountNumber.trim();
    if (!/^\d{8,20}$/.test(cleanAcc)) {
      setMsg({ type: "error", text: "Bank account number must be between 8 and 20 digits." });
      return;
    }

    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setMsg({ type: "error", text: "Invalid IFSC code format (e.g. SBIN0001234)." });
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `wdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch("/api/store/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletType,
          amountPaise,
          bankDetails: {
            accountHolderName: accountHolderName.trim(),
            bankName: bankName.trim(),
            accountNumber: cleanAcc,
            ifscCode: cleanIfsc,
          },
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit withdrawal request.");

      setMsg({
        type: "success",
        text: data.message || "Withdrawal request submitted successfully! Held pending admin verification.",
      });

      // Clear form
      setAmountRupees("500");
      setAccountNumber("");
      setIfscCode("");
      loadData();
    } catch (err: unknown) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Error submitting withdrawal request.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hasPendingRequest = withdrawals.some(
    (w) => w.status === "REQUESTED" || w.status === "PROCESSING",
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900 tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-brand-600" />
            <span>Bank Withdrawals & Payouts</span>
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Transfer verified referral commissions directly to your linked bank account
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
            href="/store/account/coupons"
            className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-xs font-semibold"
          >
            My Coupons
          </Link>
        </div>
      </div>

      {/* Governance & Safeguards Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-900">
          <div className="font-bold">Financial Safeguards & Withdrawal Rules</div>
          <p className="text-amber-700 leading-relaxed text-[11px]">
            &bull; Withdrawals are strictly restricted to verified referral earnings (Free and Paid Referral cash balances).<br />
            &bull; Shopping credit (Product Points, Add Money, and Coupons) is non-withdrawable.<br />
            &bull; Limits: Minimum ₹200.00 &bull; Maximum ₹50,000.00 per request &bull; 1 active request at a time.<br />
            &bull; Requested funds are placed on temporary ledger hold immediately upon submission. Rejection automatically restores your wallet balance.
          </p>
        </div>
      </div>

      {/* Available Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white border border-ink-200 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-ink-400 uppercase tracking-wider block">
            Free Referral Balance
          </span>
          <div className="text-2xl font-black text-ink-900 mt-1">
            ₹{(balances.freeReferralPaise / 100).toFixed(2)}
          </div>
          <span className="text-[11px] text-ink-500 mt-0.5 block">Eligible for withdrawal</span>
        </div>

        <div className="p-5 bg-white border border-ink-200 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-ink-400 uppercase tracking-wider block">
            Paid Referral Balance
          </span>
          <div className="text-2xl font-black text-ink-900 mt-1">
            ₹{(balances.paidReferralPaise / 100).toFixed(2)}
          </div>
          <span className="text-[11px] text-ink-500 mt-0.5 block">Area / Chief Tier earnings</span>
        </div>

        <div className="p-5 bg-linear-to-br from-brand-50 to-white border border-brand-200 rounded-2xl shadow-xs">
          <span className="text-xs font-bold text-brand-700 uppercase tracking-wider block">
            Total Withdrawable
          </span>
          <div className="text-2xl font-black text-brand-800 mt-1">
            ₹{(balances.totalWithdrawablePaise / 100).toFixed(2)}
          </div>
          <span className="text-[11px] text-brand-600 mt-0.5 block">Total cash available to withdraw</span>
        </div>
      </div>

      {/* Submission Form */}
      <div className="bg-white border border-ink-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-brand-600" />
            <span>Request Bank Transfer</span>
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            Enter your beneficiary bank account details. Settlements are verified and confirmed via NEFT/RTGS.
          </p>
        </div>

        {msg && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
              msg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
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

        {hasPendingRequest && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              You already have a pending withdrawal request in review. Additional requests cannot be submitted until your pending request is processed.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Withdraw From Wallet
              </label>
              <select
                disabled={hasPendingRequest}
                value={walletType}
                onChange={(e) => setWalletType(e.target.value as "FREE_REFERRAL" | "PAID_REFERRAL")}
                className="w-full text-xs border border-ink-200 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
              >
                <option value="FREE_REFERRAL">
                  Free Referral Wallet (Available: ₹{(balances.freeReferralPaise / 100).toFixed(2)})
                </option>
                <option value="PAID_REFERRAL">
                  Paid Referral Wallet (Available: ₹{(balances.paidReferralPaise / 100).toFixed(2)})
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Withdrawal Amount (₹)
              </label>
              <input
                type="number"
                disabled={hasPendingRequest}
                min={200}
                max={50000}
                step={50}
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="500"
                className="w-full text-xs border border-ink-200 rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
                required
              />
              <span className="text-[10px] text-ink-400 mt-1 block">Min ₹200 &bull; Max ₹50,000</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                disabled={hasPendingRequest}
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="As per bank passbook"
                className="w-full text-xs border border-ink-200 rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                disabled={hasPendingRequest}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. State Bank of India, HDFC"
                className="w-full text-xs border border-ink-200 rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                Account Number
              </label>
              <input
                type="text"
                disabled={hasPendingRequest}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\s+/g, ""))}
                placeholder="8 to 20 digits"
                className="w-full text-xs font-mono border border-ink-200 rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                disabled={hasPendingRequest}
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN0001234"
                className="w-full text-xs font-mono uppercase border border-ink-200 rounded-xl px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-brand-500 disabled:bg-ink-50"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={hasPendingRequest || submitting}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting Request..." : "Submit Withdrawal Request"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-6 border-b border-ink-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">
            Withdrawal Requests History ({withdrawals.length})
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-ink-400 animate-pulse">
            Loading withdrawal requests...
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Coins className="w-10 h-10 text-ink-300 mx-auto" />
            <h4 className="text-sm font-bold text-ink-700">No withdrawal requests yet</h4>
            <p className="text-xs text-ink-400 max-w-sm mx-auto">
              Your submitted requests and bank settlement history will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-ink-50 border-b border-ink-100 text-ink-500 font-bold uppercase">
                <tr>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Wallet</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Bank Details</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Settlement / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {withdrawals.map((w) => (
                  <tr key={w._id} className="hover:bg-ink-50/50">
                    <td className="p-3 font-mono font-bold text-ink-900">
                      {w.withdrawalRef}
                    </td>
                    <td className="p-3 text-ink-500">
                      {new Date(w.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="p-3 text-ink-600 font-mono text-[11px]">
                      {w.walletType === "FREE_REFERRAL" ? "Free Ref" : "Paid Ref"}
                    </td>
                    <td className="p-3 font-bold text-ink-900">
                      ₹{(w.amountPaise / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-ink-700">
                      <div className="font-medium">{w.bankDetails.bankName}</div>
                      <div className="text-[10px] text-ink-500 font-mono">
                        A/C: ****{w.bankDetails.accountNumber.slice(-4)} &bull; {w.bankDetails.ifscCode}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.status === "REQUESTED"
                            ? "bg-amber-50 text-amber-700"
                            : w.status === "APPROVED"
                            ? "bg-blue-50 text-blue-700"
                            : w.status === "PROCESSING"
                            ? "bg-purple-50 text-purple-700"
                            : w.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {w.status === "PAID"
                          ? "PAID / SETTLED"
                          : w.status === "REJECTED"
                          ? "REJECTED (REFUNDED)"
                          : w.status}
                      </span>
                    </td>
                    <td className="p-3 text-ink-600 text-[11px]">
                      {w.status === "PAID" && (
                        <div className="text-emerald-700 font-mono text-[10px] font-semibold">
                          UTR: {w.providerPayoutRef || "BANK_SETTLEMENT"}
                        </div>
                      )}
                      {w.status === "REJECTED" && (
                        <div className="text-rose-600 font-medium">
                          Reason: {w.rejectionReason || "Admin rejected"}
                        </div>
                      )}
                      {w.status !== "PAID" && w.status !== "REJECTED" && (
                        <span className="text-ink-400">Under review</span>
                      )}
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
