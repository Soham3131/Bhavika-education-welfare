"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import {
  ShieldCheck,
  Ticket,
  ArrowLeft,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";

interface AppliedCoupon {
  code: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCart();

  const [address, setAddress] = useState({
    fullName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  });

  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCoupon[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);

  // Check login status
  useEffect(() => {
    fetch("/api/store/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/store/login?redirect=/store/checkout");
        } else {
          setMemberLoading(false);
          if (data.member?.name) {
            setAddress((prev) => ({
              ...prev,
              fullName: data.member.name,
              phone: data.member.phone,
            }));
          }
        }
      })
      .catch(() => router.push("/store/login?redirect=/store/checkout"));
  }, [router]);

  interface ServerQuote {
    itemsTotalRupees: number;
    shippingFeeRupees: number;
    couponDiscountRupees: number;
    totalPayableRupees: number;
    qualifiesForFreeShipping: boolean;
    appliedCoupons?: {
      code: string;
      valueRupees: number;
      valuePaise: number;
      source: string;
    }[];
  }

  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Fetch authoritative server quote whenever items or appliedCoupons change
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let isMounted = true;

    fetch("/api/store/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        couponCodes: appliedCoupons.map((c) => c.code),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to calculate authoritative order quote.");
        }
        if (isMounted) {
          setServerQuote({
            itemsTotalRupees: data.itemsTotalRupees,
            shippingFeeRupees: data.shippingFeeRupees,
            couponDiscountRupees: data.couponDiscountRupees,
            totalPayableRupees: data.totalPayableRupees,
            qualifiesForFreeShipping: data.qualifiesForFreeShipping,
            appliedCoupons: data.appliedCoupons,
          });
          setQuoteError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setQuoteError(err.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [items, appliedCoupons]);

  // When cart has no items, quote is null
  const activeQuote = items.length === 0 ? null : serverQuote;

  // Fallback estimates only while server quote is calculating initially
  const fallbackItemsTotal = items.reduce((acc, it) => acc + it.priceRupees * it.quantity, 0);
  const fallbackShipping = fallbackItemsTotal >= 999 || fallbackItemsTotal === 0 ? 0 : 99;
  const fallbackDiscount = activeQuote ? activeQuote.couponDiscountRupees : 0;

  const itemsTotalRupees = activeQuote ? activeQuote.itemsTotalRupees : fallbackItemsTotal;
  const shippingFeeRupees = activeQuote ? activeQuote.shippingFeeRupees : fallbackShipping;
  const totalCouponDiscountRupees = activeQuote ? activeQuote.couponDiscountRupees : fallbackDiscount;
  const netPayableRupees = activeQuote
    ? activeQuote.totalPayableRupees
    : Math.max(0, fallbackItemsTotal + fallbackShipping - fallbackDiscount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = couponCodeInput.trim().toUpperCase();
    if (!cleanCode) return;

    if (appliedCoupons.some((c) => c.code === cleanCode)) {
      setErrorMessage(`Coupon ${cleanCode} is already applied.`);
      return;
    }

    setAppliedCoupons((prev) => [...prev, { code: cleanCode }]);
    setCouponCodeInput("");
    setErrorMessage(null);
  };

  const handleRemoveCoupon = (code: string) => {
    setAppliedCoupons((prev) => prev.filter((c) => c.code !== code));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setErrorMessage("Cart is empty.");
      return;
    }
    if (
      !address.fullName ||
      !address.phone ||
      !address.addressLine1 ||
      !address.city ||
      !address.state ||
      !address.postalCode
    ) {
      setErrorMessage("Please complete all required delivery address fields.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Create order
      const orderRes = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          shippingAddress: address,
          couponCodes: appliedCoupons.map((c) => c.code),
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error || "Failed to create order.");
      }

      const orderRef = orderData.orderRef;

      // 2. If net payable is 0 (100% coupon covered), complete checkout directly
      if (orderData.netPayablePaise === 0) {
        clearCart();
        router.push(`/store/orders/${orderRef}`);
        return;
      }

      // 3. Initiate payment attempt
      const paymentRes = await fetch("/api/store/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRef }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) {
        throw new Error(paymentData.error || "Failed to initiate payment.");
      }

      // 4. Complete verification call
      const verifyRes = await fetch("/api/store/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentAttemptId: paymentData.paymentAttemptId,
          orderRef,
          razorpayPaymentId: `pay_test_${Date.now()}`,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Payment verification failed.");
      }

      clearCart();
      router.push(`/store/orders/${orderRef}`);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error completing checkout.",
      );
      setSubmitting(false);
    }
  };

  if (memberLoading) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 text-center text-slate-500 animate-pulse">
        Verifying member session...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Your Cart is Empty</h2>
        <Link
          href="/store/products"
          className="inline-flex items-center space-x-2 text-amber-600 font-semibold hover:underline text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Browse Products</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans">
      <div className="border-b border-[#EBDCB9]/70 pb-4">
        <Link
          href="/store/cart"
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-gray-500 hover:text-[#6B0B1A] transition mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Cart</span>
        </Link>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A] tracking-tight">
          Checkout & Order Confirmation
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Enter delivery address and apply verified Bhavika bearer coupons
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Address and Coupon Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Shipping Address */}
          <div className="bg-white p-6 rounded-xl border border-[#EBDCB9] shadow-2xs space-y-4">
            <h2 className="font-serif text-base font-bold text-[#6B0B1A] border-b border-[#EBDCB9]/60 pb-2.5">
              1. Delivery Address
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={address.fullName}
                  onChange={(e) =>
                    setAddress({ ...address, fullName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={address.phone}
                  onChange={(e) =>
                    setAddress({ ...address, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  required
                  value={address.addressLine1}
                  onChange={(e) =>
                    setAddress({ ...address, addressLine1: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-medium mb-1">
                  Address Line 2 (Optional)
                </label>
                <input
                  type="text"
                  value={address.addressLine2}
                  onChange={(e) =>
                    setAddress({ ...address, addressLine2: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={address.city}
                  onChange={(e) =>
                    setAddress({ ...address, city: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  State *
                </label>
                <input
                  type="text"
                  required
                  value={address.state}
                  onChange={(e) =>
                    setAddress({ ...address, state: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Postal Code *
                </label>
                <input
                  type="text"
                  required
                  value={address.postalCode}
                  onChange={(e) =>
                    setAddress({ ...address, postalCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Country
                </label>
                <input
                  type="text"
                  disabled
                  value={address.country}
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Bhavika Coupon Redemption */}
          <div className="bg-white p-6 rounded-xl border border-[#EBDCB9] shadow-2xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-[#EBDCB9]/60 pb-3">
              <Ticket className="w-4 h-4 text-[#C5A059]" />
              <h2 className="font-serif text-base font-bold text-[#6B0B1A]">
                2. Apply Bhavika Foundation Coupons
              </h2>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                You can apply multiple Bhavika bearer coupons on a single order.
                Each coupon is independently verified and redeemed at 100% face value.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="e.g. BHAV-7K2X-9QM4-P8RT"
                  value={couponCodeInput}
                  onChange={(e) => setCouponCodeInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#FAF7F2] border border-[#EBDCB9] rounded-md text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#6B0B1A]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-[#6B0B1A] hover:bg-[#831023] text-white rounded-md text-xs font-semibold transition shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Coupon</span>
                </button>
              </div>

              {appliedCoupons.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-gray-700">
                    Applied Coupons:
                  </span>
                  <div className="space-y-1.5">
                    {appliedCoupons.map((c) => {
                      const verified = serverQuote?.appliedCoupons?.find(
                        (ac) => ac.code === c.code,
                      );
                      return (
                        <div
                          key={c.code}
                          className="flex items-center justify-between p-2.5 bg-[#FAF7F2] border border-[#EBDCB9] rounded-md text-xs"
                        >
                          <div className="flex items-center space-x-2">
                            <Ticket className="w-3.5 h-3.5 text-[#C5A059]" />
                            <span className="font-mono font-bold text-[#6B0B1A]">
                              {c.code}
                            </span>
                            {verified ? (
                              <span className="text-emerald-700 font-semibold">
                                (₹{verified.valueRupees} discount)
                              </span>
                            ) : quoteError ? (
                              <span className="text-rose-600 text-xs">
                                Verification failed
                              </span>
                            ) : (
                              <span className="text-amber-700 text-xs">
                                Verifying discount...
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCoupon(c.code)}
                            className="text-gray-400 hover:text-rose-600 transition p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order Review & Pay Card */}
        <div className="bg-white p-6 rounded-xl border border-[#EBDCB9] shadow-2xs space-y-6 h-fit">
          <h2 className="font-serif text-lg font-bold text-[#6B0B1A] border-b border-[#EBDCB9]/60 pb-3">
            Payment Summary
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Items Total ({items.reduce((acc, it) => acc + it.quantity, 0)} units)</span>
              <span className="font-semibold text-gray-900">
                ₹{itemsTotalRupees.toLocaleString("en-IN")}
              </span>
            </div>

            {totalCouponDiscountRupees > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Coupon Discount ({appliedCoupons.length})</span>
                <span>-₹{totalCouponDiscountRupees.toLocaleString("en-IN")}</span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span className={`font-semibold ${shippingFeeRupees === 0 ? "text-emerald-700" : "text-gray-900"}`}>
                {shippingFeeRupees === 0 ? "FREE" : `₹${shippingFeeRupees}`}
              </span>
            </div>

            <div className="border-t border-[#EBDCB9]/60 pt-3 flex justify-between text-sm font-bold text-gray-900">
              <span>Net Payable</span>
              <span className="text-base text-[#6B0B1A]">
                ₹{netPayableRupees.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {quoteError && (
              <div className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                {quoteError}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center space-x-2 bg-[#6B0B1A] hover:bg-[#831023] disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-md text-xs shadow-xs transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {submitting
                  ? "Processing Order..."
                  : netPayableRupees === 0
                  ? "Place Order (Free via Coupons)"
                  : `Pay ₹${netPayableRupees.toLocaleString("en-IN")} & Place Order`}
              </span>
            </button>
            <div className="flex items-center justify-center space-x-1.5 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Secured 256-bit encrypted checkout</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
