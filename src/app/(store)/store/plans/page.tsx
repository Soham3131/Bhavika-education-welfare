"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Gift,
  Wallet,
  Lock,
  Info,
} from "lucide-react";

interface PromotionalPlanView {
  planCode: string;
  name: string;
  description: string;
  priceRupees: number;
  productWalletBenefitRupees: number;
  superCouponCount: number;
  superCouponType: string;
  superCouponFaceValueRupees: number;
  isPurchaseActive: boolean;
  validityDays: number;
}

export default function PromotionalPlansPage() {
  const [plans, setPlans] = useState<PromotionalPlanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PromotionalPlanView | null>(
    null,
  );

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch("/api/store/promotional-plans");
        if (res.ok) {
          const data = await res.json();
          setPlans(data.plans || []);
        }
      } catch (err) {
        console.error("Failed to load promotional plans", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-black tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-purple-700" />
            Special Promotional Offers
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Jai Maa Durga Promotional Membership Plans
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base">
            Multiply your store spending power with guaranteed product wallet
            credits and exclusive Super Lucky Draw Vouchers.
          </p>
        </div>

        {/* Safety Gate Alert Banner */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="p-2.5 bg-amber-100 text-amber-900 rounded-xl shrink-0">
            <ShieldAlert className="w-6 h-6 text-amber-700" />
          </div>
          <div className="space-y-1 flex-1">
            <h3 className="font-black text-amber-950 text-sm sm:text-base">
              Governance & Compliance Lock Active
            </h3>
            <p className="text-amber-800 text-xs sm:text-sm leading-relaxed">
              Online purchase of promotional plans is currently locked pending
              formal client sign-off on Super Coupon prize mechanics and redemption
              valuations. The transactional infrastructure is complete and secure.
            </p>
          </div>
        </div>

        {/* Plan Cards */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 font-medium">
            Loading promotional plans...
          </div>
        ) : plans.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-medium">
            No promotional plans available at this time.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {plans.map((p) => (
              <div
                key={p.planCode}
                className="bg-white rounded-3xl border-2 border-slate-200 overflow-hidden shadow-lg hover:border-purple-300 transition flex flex-col justify-between"
              >
                <div className="p-6 sm:p-8 space-y-6">
                  {/* Card Top */}
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                      {p.planCode}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 bg-amber-100 text-amber-800">
                      <Lock className="w-3 h-3" />
                      Purchases Locked
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-slate-900">
                      {p.name}
                    </h2>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      {p.description}
                    </p>
                  </div>

                  {/* Pricing */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900">
                      ₹{p.priceRupees.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      one-time enrollment
                    </span>
                  </div>

                  {/* Benefits */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Included Plan Benefits
                    </div>

                    <div className="flex items-start gap-3 text-slate-800 text-sm">
                      <div className="p-1 rounded-md bg-emerald-100 text-emerald-700 mt-0.5">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">
                          ₹{p.productWalletBenefitRupees.toLocaleString("en-IN")}{" "}
                          Product Wallet Credit
                        </span>
                        <div className="text-xs text-slate-500">
                          Instant store credit for merchandise purchases
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-slate-800 text-sm">
                      <div className="p-1 rounded-md bg-purple-100 text-purple-700 mt-0.5">
                        <Gift className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">
                          {p.superCouponCount}x {p.superCouponType} Coupons
                        </span>
                        <div className="text-xs text-slate-500">
                          ₹{p.superCouponFaceValueRupees} face value each
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-slate-800 text-sm">
                      <div className="p-1 rounded-md bg-blue-100 text-blue-700 mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">
                          {p.validityDays} Days Benefit Validity
                        </span>
                        <div className="text-xs text-slate-500">
                          Full 12-month access to store privileges
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="p-6 bg-slate-50 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setSelectedPlan(p);
                      setModalOpen(true);
                    }}
                    className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Enroll in Plan</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back Link */}
        <div className="text-center pt-4">
          <Link
            href="/store"
            className="text-sm font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <span>&larr; Back to Jai Maa Durga Store</span>
          </Link>
        </div>
      </div>

      {/* Lock Notice Modal */}
      {modalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl w-fit">
              <ShieldAlert className="w-8 h-8 text-amber-700" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">
                Plan Purchase Locked
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                {selectedPlan.name} is configured with ₹
                {selectedPlan.productWalletBenefitRupees} product wallet credit and{" "}
                {selectedPlan.superCouponCount} Super Coupons.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-slate-900">Release Blocker:</div>
                <div>
                  Client and CA written confirmation is required before accepting
                  live member funds for this tier.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-slate-800 transition"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
