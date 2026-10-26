import React from "react";
import Link from "next/link";
import { CartProvider } from "@/lib/store/cart-context";
import StoreHeader from "./StoreHeader";

export const metadata = {
  title: "Jai Maa Durga Store — Commerce & Welfare Platform",
  description:
    "Official Jai Maa Durga Commerce Store. Shop jewellery, fashion, electronics, and daily essentials with verified Bhavika coupon redemption.",
};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <StoreHeader />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <div className="text-xl font-bold text-amber-400">
                जय माँ दुर्गा स्टोर
              </div>
              <p className="text-sm">
                Jai Maa Durga Commerce Platform. Built in partnership with
                Bhavika Education & Welfare Foundation.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-3">Quick Links</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/store" className="hover:text-amber-400 transition">
                    Storefront Home
                  </Link>
                </li>
                <li>
                  <Link
                    href="/store/products"
                    className="hover:text-amber-400 transition"
                  >
                    All Products
                  </Link>
                </li>
                <li>
                  <Link
                    href="/store/cart"
                    className="hover:text-amber-400 transition"
                  >
                    My Cart
                  </Link>
                </li>
                <li>
                  <Link
                    href="/store/account/orders"
                    className="hover:text-amber-400 transition"
                  >
                    My Orders
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-3">Bhavika Seam</div>
              <p className="text-sm">
                Bearer coupons earned on Bhavika Foundation quizzes can be
                directly redeemed during checkout at 100% face value.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-3">
                Security & Trust
              </div>
              <p className="text-sm">
                Razorpay 256-bit encrypted transactions. Concurrency-safe
                inventory management and verified coupon reconciliation.
              </p>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 pt-8 border-t border-slate-800 text-xs text-center">
            &copy; {new Date().getFullYear()} Jai Maa Durga. All rights reserved.
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
