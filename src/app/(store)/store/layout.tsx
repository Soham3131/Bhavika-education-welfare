import React from "react";
import { CartProvider } from "@/lib/store/cart-context";
import StoreHeader from "./StoreHeader";
import StoreFooter from "./StoreFooter";

export const metadata = {
  title: "Jai Maa Durga — Divine Marketplace | Commerce & Welfare",
  description:
    "Official Jai Maa Durga Commerce Store. Shop certified gold & silver jewellery, fashion, electronics, and daily essentials with verified Bhavika coupon redemption.",
};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-[#FDFBF7] text-[#1F2937] flex flex-col font-sans antialiased selection:bg-[#6B0B1A] selection:text-white">
        <StoreHeader />

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>

        {/* Authentic Multi-Column Marketplace Footer */}
        <StoreFooter />
      </div>
    </CartProvider>
  );
}
