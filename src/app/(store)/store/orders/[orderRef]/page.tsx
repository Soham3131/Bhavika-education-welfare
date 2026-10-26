"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Truck,
  MapPin,
  Ticket,
} from "lucide-react";

interface OrderDetail {
  orderRef: string;
  status: string;
  paymentStatus: string;
  items: {
    sku: string;
    title: string;
    quantity: number;
    unitPriceRupees: number;
    totalPriceRupees: number;
  }[];
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  itemsTotalRupees: number;
  taxRupees: number;
  shippingFeeRupees: number;
  couponDiscountRupees: number;
  netPayableRupees: number;
  paidCashRupees: number;
  deficitRupees: number;
  notes?: string;
  createdAt: string;
  paidAt?: string;
}

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderRef = params.orderRef as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderRef) return;
    fetch(`/api/store/orders/${orderRef}`)
      .then((res) => {
        if (res.status === 401) {
          router.push(`/store/login?redirect=/store/orders/${orderRef}`);
          return null;
        }
        if (!res.ok) throw new Error("Order not found or unauthorized");
        return res.json();
      })
      .then((data) => {
        if (data?.order) {
          setOrder(data.order);
        } else {
          setError("Order not found.");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [orderRef, router]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="h-48 bg-slate-200 rounded-2xl" />
        <div className="h-48 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Order Not Found</h2>
        <p className="text-sm text-slate-500">
          The requested order could not be retrieved.
        </p>
        <Link
          href="/store/account/orders"
          className="inline-flex items-center space-x-2 text-amber-600 font-semibold hover:underline text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/store/account/orders"
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-amber-600 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Order History</span>
      </Link>

      {/* Deficit Alert Banner if partial coupon failure occurred */}
      {order.status === "PARTIAL_COUPON_REDEMPTION_DEFICIT" && (
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Partial Coupon Redemption Deficit</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            One of the applied Bhavika coupons could not be redeemed upstream. A
            financial deficit of <strong>₹{order.deficitRupees}</strong> is
            recorded. Goods are held safely in reservation and will be dispatched
            once the deficit is resolved or cleared via supplemental payment.
          </p>
          {order.notes && (
            <div className="text-[11px] text-amber-700 font-mono bg-amber-100/60 p-2 rounded-lg">
              {order.notes}
            </div>
          )}
        </div>
      )}

      {/* Main Order Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Order Reference
            </div>
            <h1 className="text-xl font-black text-slate-900 font-mono">
              {order.orderRef}
            </h1>
            <div className="text-xs text-slate-500">
              Placed on {new Date(order.createdAt).toLocaleString("en-IN")}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {order.status === "PAID" && (
              <span className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Payment Confirmed</span>
              </span>
            )}
            {order.status === "PROCESSING" && (
              <span className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                <Clock className="w-3.5 h-3.5" />
                <span>Processing Shipment</span>
              </span>
            )}
            {order.status === "SHIPPED" && (
              <span className="inline-flex items-center space-x-1 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                <Truck className="w-3.5 h-3.5" />
                <span>Dispatched</span>
              </span>
            )}
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Order Items
          </h2>
          <div className="space-y-2">
            {order.items.map((it, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">{it.title}</div>
                  <div className="text-slate-400 text-[11px] font-mono">
                    SKU: {it.sku} &bull; Qty: {it.quantity}
                  </div>
                </div>
                <div className="font-bold text-slate-900">
                  ₹{it.totalPriceRupees.toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping Address */}
        <div className="border-t border-slate-100 pt-5 space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>Delivery Address</span>
          </div>
          <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl">
            <div className="font-bold text-slate-900">
              {order.shippingAddress.fullName} &bull; {order.shippingAddress.phone}
            </div>
            <div>{order.shippingAddress.addressLine1}</div>
            {order.shippingAddress.addressLine2 && (
              <div>{order.shippingAddress.addressLine2}</div>
            )}
            <div>
              {order.shippingAddress.city}, {order.shippingAddress.state} -{" "}
              {order.shippingAddress.postalCode}
            </div>
            <div>{order.shippingAddress.country}</div>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="border-t border-slate-100 pt-5 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Items Subtotal</span>
            <span className="font-semibold text-slate-900">
              ₹{order.itemsTotalRupees.toLocaleString("en-IN")}
            </span>
          </div>

          {order.couponDiscountRupees > 0 && (
            <div className="flex justify-between text-emerald-700 font-semibold">
              <span className="flex items-center space-x-1">
                <Ticket className="w-3 h-3" />
                <span>Bhavika Coupon Discount</span>
              </span>
              <span>-₹{order.couponDiscountRupees.toLocaleString("en-IN")}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-600">
            <span>Delivery & Taxes</span>
            <span className="font-semibold text-emerald-600">Free</span>
          </div>

          <div className="border-t border-slate-200 pt-3 flex justify-between text-sm font-black text-slate-900">
            <span>Total Paid Cash</span>
            <span className="text-amber-600">
              ₹{order.netPayableRupees.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
