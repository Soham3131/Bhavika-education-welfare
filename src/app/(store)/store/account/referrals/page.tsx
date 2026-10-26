"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Copy, Check, Share2 } from "lucide-react";

interface SponsorTreeData {
  member: {
    memberId: string;
    name: string;
    tier: string;
    sponsorId?: string | null;
  };
  sponsor: {
    memberId: string;
    name: string;
    tier: string;
  } | null;
  directReferrals: Array<{
    memberId: string;
    name: string;
    tier: string;
    joinedAt: string;
    directSalesPaise: number;
  }>;
  summary: {
    totalDirect: number;
    freeCount: number;
    areaCount: number;
    chiefCount: number;
  };
}

export default function MemberReferralsPage() {
  const [treeData, setTreeData] = useState<SponsorTreeData | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/store/referrals")
      .then((r) => r.json())
      .then((res) => {
        if (res.tree) setTreeData(res.tree);
        if (res.referralCode) setReferralCode(res.referralCode);
        if (res.shareUrl) setShareUrl(res.shareUrl);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900 tracking-tight">
            Sponsor Tree & Referrals
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Grow your direct network and track immediate downline sales performance
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/store/account/coupons"
            className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-xs font-semibold"
          >
            My Coupons & Points
          </Link>
          <Link
            href="/store/account/orders"
            className="px-3 py-1.5 border border-ink-200 text-ink-700 hover:bg-ink-50 rounded-lg text-xs font-semibold"
          >
            My Orders
          </Link>
        </div>
      </div>

      {/* Share / Referral Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-6 bg-white border border-ink-200 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-ink-900 font-bold text-sm">
            <Share2 className="w-4 h-4 text-brand-600" />
            <span>Your Personal Referral Code & Link</span>
          </div>
          <p className="text-xs text-ink-500 leading-relaxed">
            Invite friends and customers using your direct code. Earn referral bonuses and sales commissions
            on every qualifying purchase made by your immediate downline members.
          </p>

          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                Your Sponsor ID Code
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralCode}
                  className="p-2.5 font-mono font-black text-base bg-ink-50 border border-ink-200 rounded-lg text-ink-900 w-48 text-center"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-500 uppercase tracking-wider mb-1">
                Shareable Registration Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="w-full p-2.5 font-mono text-xs bg-ink-50 border border-ink-200 rounded-lg text-ink-700"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sponsor Card */}
        <div className="md:col-span-1 p-6 bg-ink-50 border border-ink-200 rounded-2xl shadow-xs space-y-3">
          <div className="text-xs font-bold text-ink-500 uppercase tracking-wider">
            Your Direct Sponsor
          </div>
          {treeData?.sponsor ? (
            <div className="space-y-1">
              <div className="text-lg font-black text-ink-900">
                {treeData.sponsor.name}
              </div>
              <div className="font-mono text-xs text-ink-500">
                ID: {treeData.sponsor.memberId}
              </div>
              <div className="pt-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  {treeData.sponsor.tier} TIER
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-ink-500 italic pt-2">
              No sponsor attached (Direct / Organic member).
            </div>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-ink-500 uppercase">
            Total Direct Referrals
          </div>
          <div className="text-2xl font-black text-ink-900 mt-1">
            {treeData?.summary.totalDirect ?? 0}
          </div>
        </div>
        <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-ink-500 uppercase">
            Free Members
          </div>
          <div className="text-2xl font-black text-ink-600 mt-1">
            {treeData?.summary.freeCount ?? 0}
          </div>
        </div>
        <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-ink-500 uppercase">
            Area Members
          </div>
          <div className="text-2xl font-black text-brand-600 mt-1">
            {treeData?.summary.areaCount ?? 0}
          </div>
        </div>
        <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-ink-500 uppercase">
            Chief Members
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {treeData?.summary.chiefCount ?? 0}
          </div>
        </div>
      </div>

      {/* Downlines Table */}
      <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-6 border-b border-ink-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" />
            <span>Direct Downline Members ({treeData?.directReferrals.length ?? 0})</span>
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-ink-400 animate-pulse">
            Loading sponsor tree...
          </div>
        ) : !treeData?.directReferrals || treeData.directReferrals.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Users className="w-10 h-10 text-ink-300 mx-auto" />
            <h4 className="text-sm font-bold text-ink-700">No direct referrals yet</h4>
            <p className="text-xs text-ink-400 max-w-sm mx-auto">
              Share your referral link with friends. When they sign up and shop, they will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                  <th className="p-3">Member ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Joined Date</th>
                  <th className="p-3">Cumulative Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {treeData.directReferrals.map((d) => (
                  <tr key={d.memberId} className="hover:bg-ink-50/50">
                    <td className="p-3 font-mono font-bold text-ink-900">
                      {d.memberId}
                    </td>
                    <td className="p-3 font-semibold text-ink-800">{d.name}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800">
                        {d.tier}
                      </span>
                    </td>
                    <td className="p-3 text-ink-400">
                      {new Date(d.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 font-mono font-bold text-ink-900">
                      ₹{(d.directSalesPaise / 100).toFixed(2)}
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
