"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import {
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  ChevronRight,
  Sparkles,
} from "lucide-react";

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
          setValidationError(null);
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
      <div className="max-w-2xl mx-auto my-16 bg-white p-10 rounded-2xl border border-[#EBDCB9] text-center space-y-5 shadow-xs">
        <div className="w-16 h-16 bg-[#FAF7F2] border border-[#EBDCB9] text-[#6B0B1A] rounded-full flex items-center justify-center mx-auto shadow-2xs">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A]">
          Your Shopping Cart is Empty
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
          Discover certified jewellery, everyday groceries, and festive collections. Apply Bhavika quiz coupons during checkout.
        </p>
        <div className="pt-2">
          <Link
            href="/store/products"
            className="inline-flex items-center space-x-2 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold px-6 py-3 rounded-md text-xs transition shadow-xs"
          >
            <span>Explore Catalogue</span>
            <ArrowRight className="w-4 h-4 text-amber-200" />
          </Link>
        </div>
      </div>
    );
  }

  const itemsTotal =
    serverCart?.itemsTotalRupees ??
    items.reduce((acc, it) => acc + it.priceRupees * it.quantity, 0);
  const shippingFee = serverCart?.shippingFeeRupees ?? (itemsTotal >= 999 ? 0 : 99);
  const grandTotal = serverCart?.totalPayableRupees ?? itemsTotal + shippingFee;

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-1.5 text-xs text-gray-500 border-b border-[#EBDCB9]/70 pb-4">
        <Link href="/store" className="hover:text-[#6B0B1A]">
          Store
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <span className="font-semibold text-[#6B0B1A]">Shopping Cart</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#EBDCB9]/70 pb-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A]">
            Shopping Cart ({items.reduce((acc, it) => acc + it.quantity, 0)} items)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Certified items reserved with server-validated pricing
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
        >
          Clear All Items
        </button>
      </div>

      {validationError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Item List */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="bg-white p-4 sm:p-5 rounded-xl border border-[#EBDCB9] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-4">
                <div className="relative w-16 h-16 bg-[#FAF7F2] rounded-lg border border-[#EBDCB9]/60 flex items-center justify-center overflow-hidden shrink-0">
                  <Image
                    src={item.image || "/images/prod-gold-mangalsutra.png"}
                    alt={item.title}
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm hover:text-[#6B0B1A] transition">
                    <Link href={`/store/products/${item.slug}`}>
                      {item.title}
                    </Link>
                  </h3>
                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                    SKU: {item.sku}
                  </div>
                  <div className="text-xs font-bold text-[#6B0B1A] mt-1">
                    ₹{item.priceRupees.toLocaleString("en-IN")} each
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end space-x-4 border-t sm:border-t-0 pt-2 sm:pt-0">
                <div className="flex items-center border border-[#EBDCB9] rounded-md bg-[#FAF7F2]">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-gray-600 hover:text-[#6B0B1A] transition"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="px-3 text-xs font-bold text-gray-900">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="p-1.5 text-gray-600 hover:text-[#6B0B1A] transition"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-24 text-right font-bold text-gray-900 text-sm">
                  ₹{(item.priceRupees * item.quantity).toLocaleString("en-IN")}
                </div>

                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 transition"
                  title="Remove item"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary Sidebar */}
        <div className="bg-white p-6 rounded-xl border border-[#EBDCB9] shadow-2xs space-y-5 h-fit">
          <h2 className="font-serif text-lg font-bold text-[#6B0B1A] border-b border-[#EBDCB9]/60 pb-3 flex items-center justify-between">
            <span>Order Summary</span>
            {validating && (
              <span className="text-[10px] text-gray-400 font-normal animate-pulse">
                Updating...
              </span>
            )}
          </h2>

          <div className="space-y-2.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Items Subtotal</span>
              <span className="font-semibold text-gray-900">
                ₹{itemsTotal.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Delivery Charges</span>
              <span className={`font-semibold ${shippingFee === 0 ? "text-emerald-700" : "text-gray-900"}`}>
                {shippingFee === 0 ? "FREE" : `₹${shippingFee}`}
              </span>
            </div>
            {itemsTotal >= 999 ? (
              <div className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                ✓ Free shipping applied on orders above ₹999.
              </div>
            ) : (
              <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                Add ₹{(999 - itemsTotal).toLocaleString("en-IN")} more to qualify for FREE delivery (Standard delivery: ₹{shippingFee}).
              </div>
            )}
            <div className="border-t border-[#EBDCB9]/60 pt-3 flex justify-between text-sm font-bold text-gray-900">
              <span>Total Payable</span>
              <span className="text-base text-[#6B0B1A]">
                ₹{grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => router.push("/store/checkout")}
              className="w-full py-3 bg-[#6B0B1A] hover:bg-[#831023] text-white font-bold rounded-md text-xs transition flex items-center justify-center space-x-2 shadow-xs"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4 text-amber-200" />
            </button>
          </div>

          <div className="pt-2 border-t border-[#EBDCB9]/40 space-y-2 text-[11px] text-gray-500">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              <span>Razorpay 256-Bit Encrypted Payment</span>
            </div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              <span>Apply Bhavika Quiz Coupons on Next Step</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
