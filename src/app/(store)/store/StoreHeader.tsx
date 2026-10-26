"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import { ShoppingBag, User, LogOut } from "lucide-react";

interface MemberInfo {
  memberId: string;
  name: string;
  tier: string;
}

export default function StoreHeader() {
  const router = useRouter();
  const { totalItems } = useCart();
  const [member, setMember] = useState<MemberInfo | null>(null);

  useEffect(() => {
    fetch("/api/store/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.member) {
          setMember(data.member);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/store/auth/logout", { method: "POST" });
    setMember(null);
    router.push("/store/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/store" className="flex items-center space-x-2">
            <span className="text-2xl font-black text-amber-600 tracking-tight">
              जय माँ दुर्गा
            </span>
            <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full uppercase">
              Store
            </span>
          </Link>
          <nav className="hidden md:flex space-x-5 text-sm font-medium text-slate-700">
            <Link href="/store" className="hover:text-amber-600 transition">
              Home
            </Link>
            <Link
              href="/store/products"
              className="hover:text-amber-600 transition"
            >
              All Products
            </Link>
            <Link
              href="/store/account/orders"
              className="hover:text-amber-600 transition"
            >
              My Orders
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <Link
            href="/store/cart"
            id="store-header-cart-btn"
            className="relative p-2 text-slate-700 hover:text-amber-600 transition rounded-full hover:bg-slate-100"
            aria-label="Shopping Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>

          {member ? (
            <div className="flex items-center space-x-3 text-sm">
              <Link
                href="/store/account/orders"
                className="flex items-center space-x-1 font-medium text-slate-700 hover:text-amber-600"
              >
                <User className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">{member.name}</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  {member.tier}
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-full hover:bg-slate-100"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-sm">
              <Link
                href="/store/login"
                className="px-3 py-1.5 text-slate-700 font-medium hover:text-amber-600 transition"
              >
                Log In
              </Link>
              <Link
                href="/store/register"
                className="px-3 py-1.5 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition text-xs shadow-sm"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
