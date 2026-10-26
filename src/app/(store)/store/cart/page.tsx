"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, ShieldCheck } from "lucide-react";

interface ServerCartResponse {
  items: {
    productId: string;
    sku: string;
    title: string;
    quantity: number;
    unitPriceRupees: number;
    totalPriceRupees: number;
  }[];
  itemsTotalRupees: number;
  shippingFeeRupees: number;
  totalPayableRupees: number;
}

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const [serverCart, setServerCart] = useState<ServerCartResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Recalculate with server when items change
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
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Cart recalculation failed");
        }
        if (isMounted) {
          setServerCart(data);
          setValidating(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setValidationError(err.message);
          setValidating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto my-16 bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">
          Your Shopping Cart is Empty
        </h1>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Explore our certified jewellery and lifestyle catalogue to add items
          to your bag.
        </p>
        <div className="pt-2">
          <Link
            href="/store/products"
            className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-md"
          >
            <span>Explore Catalogue</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Shopping Cart ({items.reduce((acc, it) => acc + it.quantity, 0)} items)
          </h1>
          <p className="text-xs text-slate-500">
            Server-verified pricing in integer paise with live stock check
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs text-rose-600 hover:underline font-medium"
        >
          Clear Cart
        </button>
      </div>

      {validationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Item List */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold">
                      Item
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    <Link
                      href={`/store/products/${item.slug}`}
                      className="hover:text-amber-600 transition"
                    >
                      {item.title}
                    </Link>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    SKU: {item.sku}
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-1">
                    ₹{item.priceRupees.toLocaleString("en-IN")} each
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 transition"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="px-3 text-xs font-bold text-slate-800">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 transition"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-20 text-right font-black text-slate-900 text-sm">
                  ₹{(item.priceRupees * item.quantity).toLocaleString("en-IN")}
                </div>

                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-lg hover:bg-slate-100"
                  title="Remove Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 h-fit">
          <h2 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3">
            Order Summary
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Total</span>
              <span className="font-semibold text-slate-900">
                ₹
                {(
                  serverCart?.itemsTotalRupees ??
                  items.reduce((acc, it) => acc + it.priceRupees * it.quantity, 0)
                ).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee</span>
              <span className="font-semibold text-emerald-600">Free</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Taxes (GST Included)</span>
              <span className="font-semibold text-slate-900">₹0.00</span>
            </div>

            <div className="border-t border-slate-200 pt-3 flex justify-between text-sm font-black text-slate-900">
              <span>Grand Total</span>
              <span className="text-amber-600">
                ₹
                {(
                  serverCart?.totalPayableRupees ??
                  items.reduce((acc, it) => acc + it.priceRupees * it.quantity, 0)
                ).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => router.push("/store/checkout")}
              disabled={validating || Boolean(validationError)}
              className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl text-xs shadow-md transition"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center space-x-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bhavika coupons can be applied on the next step</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
