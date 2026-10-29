"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import {
  Search,
  User,
  Heart,
  ShoppingBag,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Gift,
} from "lucide-react";

interface MemberInfo {
  memberId: string;
  name: string;
  tier: string;
  phone?: string;
}

export default function StoreHeader() {
  const router = useRouter();
  const { totalItems } = useCart();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

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
    setUserDropdownOpen(false);
    router.push("/store/login");
    router.refresh();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/store/products?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  const categories = [
    { name: "Gold Jewellery", slug: "gold-jewellery", href: "/store/categories/gold-jewellery" },
    { name: "Silver Jewellery", slug: "silver-jewellery", href: "/store/categories/silver-jewellery" },
    { name: "Grocery", slug: "grocery", href: "/store/categories/grocery" },
    { name: "Fashion", slug: "fashion", href: "/store/categories/fashion" },
    { name: "Electronics", slug: "electronics", href: "/store/categories/electronics" },
    { name: "Recharge & Bills", slug: "recharge", href: "/store/recharge" },
    { name: "Offers", slug: "offers", href: "/store/products?offers=true" },
    { name: "Membership", slug: "membership", href: "/store/account/referrals" },
    { name: "Lucky Draw", slug: "lucky-draw", href: "/store/account/draws" },
  ];

  return (
    <div className="w-full flex flex-col font-sans select-none border-b border-[#EBDCB9]">
      {/* 1. Slim Deep-Maroon Top Announcement Bar */}
      <div className="bg-[#6B0B1A] text-white text-xs py-1.5 px-4 sm:px-6 lg:px-8 border-b border-[#520713]">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] sm:text-xs">
          <div className="flex items-center space-x-2 truncate">
            <span className="font-semibold text-amber-300">Free Shipping</span>
            <span className="text-white/80 hidden xs:inline">on Orders Above ₹999</span>
            <span className="text-white/40 hidden md:inline">|</span>
            <span className="hidden md:inline text-white/90">Genuine Products</span>
            <span className="text-white/40 hidden md:inline">|</span>
            <span className="hidden md:inline text-white/90">Secure Payments</span>
            <span className="text-white/40 hidden lg:inline">|</span>
            <span className="hidden lg:inline text-amber-200 font-medium">Empowering Community Through Ethical Commerce</span>
          </div>

          <div className="flex items-center space-x-4 shrink-0 text-white/90">
            <Link
              href="/store#support"
              className="hover:text-amber-200 transition-colors hidden sm:inline"
            >
              Support
            </Link>
            <span className="text-white/30 hidden sm:inline">|</span>
            <Link
              href="/store/account/orders"
              className="hover:text-amber-200 transition-colors"
            >
              Track Order
            </Link>
            <span className="text-white/30 hidden sm:inline">|</span>
            <Link
              href="/store#locator"
              className="hover:text-amber-200 transition-colors hidden sm:inline"
            >
              Store Locator
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Main Header: Warm Ivory Surface, Official Logo, Search, Account/Cart */}
      <div className="bg-[#FDFBF7] py-3.5 px-4 sm:px-6 lg:px-8 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo with strict aspect ratio and object-contain */}
          <Link
            href="/store"
            className="shrink-0 flex items-center group transition transform active:scale-98"
            aria-label="Jai Maa Durga Store Home"
          >
            <div className="relative h-12 sm:h-14 w-44 sm:w-56">
              <Image
                src="/images/jmd-logo-banner.png"
                alt="Jai Maa Durga — Divine Shopping For A Brighter Tomorrow"
                fill
                sizes="(max-width: 640px) 180px, 240px"
                priority
                className="object-contain object-left"
              />
            </div>
          </Link>

          {/* Prominent Search Bar (Desktop & Tablet) */}
          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-2xl mx-4 items-stretch relative"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for jewellery, groceries, fashion, electronics..."
              className="w-full pl-4 pr-12 py-2.5 bg-white border border-[#D9C79E] rounded-full text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6B0B1A]/20 focus:border-[#6B0B1A] transition shadow-inner"
            />
            <button
              type="submit"
              className="absolute right-1 top-1 bottom-1 px-4 bg-[#6B0B1A] hover:bg-[#831023] text-white rounded-full flex items-center justify-center transition shadow-sm"
              aria-label="Search Store"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Right Action Controls: Account, Wishlist, Cart */}
          <div className="flex items-center space-x-3 sm:space-x-5 shrink-0">
            {/* Account / Member */}
            {member ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center space-x-2 text-left p-1 rounded-lg hover:bg-[#F4ECDA] transition focus:outline-none"
                  aria-expanded={userDropdownOpen}
                >
                  <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 border border-[#6B0B1A]/20 flex items-center justify-center text-[#6B0B1A]">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="hidden lg:block leading-tight">
                    <div className="text-xs font-semibold text-gray-900 truncate max-w-[110px]">
                      {member.name}
                    </div>
                    <div className="text-[10px] text-[#A91B2E] font-medium tracking-wide">
                      {member.tier} Member
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 hidden lg:block" />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-[#EBDCB9] py-2 z-50 animate-fade-up">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-xs font-bold text-gray-900">{member.name}</p>
                      <p className="text-[10px] text-gray-500">{member.tier} Tier</p>
                    </div>
                    <Link
                      href="/store/account/orders"
                      onClick={() => setUserDropdownOpen(false)}
                      className="block px-4 py-2 text-xs text-gray-700 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      My Orders & Tracking
                    </Link>
                    <Link
                      href="/store/account/coupons"
                      onClick={() => setUserDropdownOpen(false)}
                      className="block px-4 py-2 text-xs text-gray-700 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      Coupons & Points
                    </Link>
                    <Link
                      href="/store/account/pins"
                      onClick={() => setUserDropdownOpen(false)}
                      className="block px-4 py-2 text-xs text-gray-700 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      PIN Activation
                    </Link>
                    <Link
                      href="/store/account/emi"
                      onClick={() => setUserDropdownOpen(false)}
                      className="block px-4 py-2 text-xs text-gray-700 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      EMI Schedules
                    </Link>
                    <Link
                      href="/store/account/draws"
                      onClick={() => setUserDropdownOpen(false)}
                      className="block px-4 py-2 text-xs text-gray-700 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      Lucky Draws
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center space-x-2 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/store/login"
                className="flex items-center space-x-1.5 text-gray-800 hover:text-[#6B0B1A] transition group"
              >
                <div className="w-8 h-8 rounded-full bg-white border border-[#D9C79E] flex items-center justify-center text-gray-600 group-hover:text-[#6B0B1A] group-hover:border-[#6B0B1A] transition shadow-2xs">
                  <User className="w-4 h-4" />
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-[10px] text-gray-500">Login / Register</div>
                  <div className="text-xs font-bold text-gray-900 group-hover:text-[#6B0B1A] transition">
                    My Account
                  </div>
                </div>
              </Link>
            )}

            {/* Wishlist Icon */}
            <Link
              href="/store/account/orders"
              className="flex items-center space-x-1.5 text-gray-700 hover:text-[#6B0B1A] transition group"
              title="Wishlist"
              aria-label="Wishlist"
            >
              <div className="relative w-8 h-8 rounded-full bg-white border border-[#D9C79E] flex items-center justify-center text-gray-600 group-hover:text-[#6B0B1A] group-hover:border-[#6B0B1A] transition shadow-2xs">
                <Heart className="w-4 h-4" />
              </div>
              <span className="hidden xl:inline text-xs font-semibold text-gray-800 group-hover:text-[#6B0B1A] transition">
                Wishlist
              </span>
            </Link>

            {/* Cart with Live Count */}
            <Link
              href="/store/cart"
              id="store-header-cart-btn"
              className="flex items-center space-x-1.5 text-gray-800 hover:text-[#6B0B1A] transition group"
              aria-label={`Shopping Cart with ${totalItems} items`}
            >
              <div className="relative w-8 h-8 rounded-full bg-white border border-[#D9C79E] flex items-center justify-center text-gray-700 group-hover:text-[#6B0B1A] group-hover:border-[#6B0B1A] transition shadow-2xs">
                <ShoppingBag className="w-4 h-4" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#A91B2E] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {totalItems}
                  </span>
                )}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-[10px] text-gray-500">
                  {totalItems > 0 ? `${totalItems} Items` : "0 Cart"}
                </div>
                <div className="text-xs font-bold text-gray-900 group-hover:text-[#6B0B1A] transition">
                  Cart
                </div>
              </div>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-700 hover:text-[#6B0B1A] hover:bg-[#F4ECDA] rounded-lg transition"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <form onSubmit={handleSearch} className="mt-3 md:hidden relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jewellery, groceries, fashion..."
            className="w-full pl-4 pr-11 py-2 bg-white border border-[#D9C79E] rounded-full text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6B0B1A]/20 focus:border-[#6B0B1A]"
          />
          <button
            type="submit"
            className="absolute right-1 top-1 bottom-1 px-3 bg-[#6B0B1A] text-white rounded-full flex items-center justify-center"
            aria-label="Search"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* 3. Secondary Category Navigation Row */}
      <div className="bg-[#FAF7F2] border-t border-[#EBDCB9]/70 py-1.5 px-4 sm:px-6 lg:px-8 hidden md:block">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Red "All Categories" Pill Button */}
            <div className="relative">
              <button
                onClick={() => setAllCategoriesOpen(!allCategoriesOpen)}
                className="inline-flex items-center space-x-2 bg-[#6B0B1A] hover:bg-[#831023] text-white text-xs font-bold px-3.5 py-1.5 rounded-full transition shadow-xs"
              >
                <Menu className="w-3.5 h-3.5" />
                <span>All Categories</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${allCategoriesOpen ? "rotate-180" : ""}`} />
              </button>

              {/* All Categories Dropdown */}
              {allCategoriesOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-[#EBDCB9] py-2 z-50">
                  <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Store Categories
                  </div>
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={cat.href}
                      onClick={() => setAllCategoriesOpen(false)}
                      className="block px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FDFBF7] hover:text-[#6B0B1A] transition"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Horizontal Nav Links */}
            <nav className="flex items-center space-x-5 text-xs font-medium text-gray-700">
              {categories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.slug}
                  href={cat.href}
                  className="hover:text-[#6B0B1A] hover:underline underline-offset-4 decoration-[#C5A059] transition"
                >
                  {cat.name}
                </Link>
              ))}
              <Link
                href="/store/account/draws"
                className="text-[#6B0B1A] font-semibold hover:text-[#831023] transition flex items-center space-x-1"
              >
                <Gift className="w-3 h-3 text-[#C5A059]" />
                <span>Lucky Draw</span>
              </Link>
            </nav>
          </div>

          <div className="hidden lg:flex items-center space-x-2 text-[11px] font-medium text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059]" />
            <span>Bhavika Community Commerce</span>
          </div>
        </div>
      </div>

      {/* Mobile Slide-down Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-[#EBDCB9] px-4 py-5 space-y-4 shadow-xl z-50 animate-fade-up">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Explore Categories
          </div>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={cat.href}
                onClick={() => setMobileMenuOpen(false)}
                className="p-2.5 bg-[#FAF7F2] hover:bg-[#F4ECDA] rounded-lg text-xs font-medium text-gray-800 transition"
              >
                {cat.name}
              </Link>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Member Services
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/store/account/orders"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-700 hover:text-[#6B0B1A]"
              >
                📦 Track Orders
              </Link>
              <Link
                href="/store/account/coupons"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-700 hover:text-[#6B0B1A]"
              >
                🎟️ Coupons & Points
              </Link>
              <Link
                href="/store/account/pins"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-700 hover:text-[#6B0B1A]"
              >
                🔑 PIN Activation
              </Link>
              <Link
                href="/store/account/emi"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-700 hover:text-[#6B0B1A]"
              >
                💳 EMI Schedules
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
