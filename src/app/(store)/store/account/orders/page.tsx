"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, ArrowRight, Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface OrderSummary {
  orderRef: string;
  itemCount: number;
  items: {
    sku: string;
    title: string;
    quantity: number;
    totalPriceRupees: number;
  }[];
  itemsTotalRupees: number;
  couponDiscountRupees: number;
  netPayableRupees: number;
  status: string;
  paymentStatus: string;
  deficitRupees: number;
  createdAt: string;
}

export default function OrderHistoryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/store/orders")
      .then((res) => {
        if (res.status === 401) {
          router.push("/store/login?redirect=/store/account/orders");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.orders) {
          setOrders(data.orders);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const getStatusBadge = (status: string, deficit: number) => {
    if (status === "PAID") {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
          <CheckCircle className="w-3 h-3" />
          <span>Paid</span>
        </span>
      );
    }
    if (status === "PARTIAL_COUPON_REDEMPTION_DEFICIT") {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800">
          <AlertTriangle className="w-3 h-3" />
          <span>Deficit (₹{deficit})</span>
        </span>
      );
    }
    if (status === "PENDING_PAYMENT" || status === "PROCESSING_COUPONS") {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
          <Clock className="w-3 h-3" />
          <span>Processing</span>
        </span>
      );
    }
    if (status === "CANCELLED" || status === "EXPIRED") {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
          <span>{status}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
        <span>{status}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="h-32 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          My Order History
        </h1>
        <p className="text-xs text-slate-500">
          Track previous orders, Bhavika coupon redemptions, and delivery status
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 space-y-4">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">
            No Orders Placed Yet
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            When you purchase items or redeem Bhavika coupons, your order
            history will appear here.
          </p>
          <Link
            href="/store/products"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition"
          >
            <span>Start Shopping</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.orderRef}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 hover:border-amber-300 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <div className="font-mono text-xs font-black text-slate-900">
                    {order.orderRef}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Placed on {new Date(order.createdAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {getStatusBadge(order.status, order.deficitRupees)}
                  <Link
                    href={`/store/orders/${order.orderRef}`}
                    className="inline-flex items-center space-x-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                  >
                    <span>Track</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="space-y-1.5">
                {order.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between text-xs text-slate-700"
                  >
                    <span>
                      {it.quantity}x {it.title} ({it.sku})
                    </span>
                    <span className="font-semibold">
                      ₹{it.totalPriceRupees.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
                <div className="text-slate-500">
                  {order.couponDiscountRupees > 0 && (
                    <span className="text-emerald-700 font-semibold mr-3">
                      Coupon Applied: ₹{order.couponDiscountRupees}
                    </span>
                  )}
                  <span>Payment: {order.paymentStatus}</span>
                </div>
                <div className="text-sm font-black text-slate-900">
                  Total Paid: ₹{order.netPayableRupees.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
