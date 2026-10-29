"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function StoreFooter() {
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="bg-white border-t border-[#EBDCB9] pt-12 pb-8 mt-12 text-sm text-gray-600 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-[#EBDCB9]/60">
          {/* Col 1: Brand & Tagline */}
          <div className="space-y-4 lg:col-span-1">
            <Link href="/store" className="inline-block">
              <div className="relative h-12 w-48">
                <Image
                  src="/images/jmd-logo-banner.png"
                  alt="Jai Maa Durga Divine Shopping"
                  fill
                  sizes="200px"
                  className="object-contain object-left"
                />
              </div>
            </Link>
            <p className="text-xs text-gray-500 leading-relaxed">
              Quality products, trusted services and social impact — together for a brighter tomorrow.
            </p>
            <div className="flex items-center space-x-3 text-[#6B0B1A]">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#EBDCB9] flex items-center justify-center hover:bg-[#6B0B1A] hover:text-white transition"
                aria-label="Facebook"
              >
                <span className="font-bold text-xs">f</span>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#EBDCB9] flex items-center justify-center hover:bg-[#6B0B1A] hover:text-white transition"
                aria-label="Instagram"
              >
                <span className="font-bold text-xs">ig</span>
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#EBDCB9] flex items-center justify-center hover:bg-[#6B0B1A] hover:text-white transition"
                aria-label="YouTube"
              >
                <span className="font-bold text-xs">yt</span>
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#EBDCB9] flex items-center justify-center hover:bg-[#6B0B1A] hover:text-white transition"
                aria-label="LinkedIn"
              >
                <span className="font-bold text-xs">in</span>
              </a>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
              Quick Links
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/about" className="hover:text-[#6B0B1A] transition">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/store/products" className="hover:text-[#6B0B1A] transition">
                  Shop All Products
                </Link>
              </li>
              <li>
                <Link href="/store/account/referrals" className="hover:text-[#6B0B1A] transition">
                  Membership
                </Link>
              </li>
              <li>
                <Link href="/store/products?offers=true" className="hover:text-[#6B0B1A] transition">
                  Offers
                </Link>
              </li>
              <li>
                <Link href="/store/account/orders" className="hover:text-[#6B0B1A] transition">
                  Track Order
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#6B0B1A] transition">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Customer Service */}
          <div>
            <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
              Customer Service
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/store#support" className="hover:text-[#6B0B1A] transition">
                  Help & Support
                </Link>
              </li>
              <li>
                <Link href="/store#returns" className="hover:text-[#6B0B1A] transition">
                  Returns & Refunds
                </Link>
              </li>
              <li>
                <Link href="/store#shipping" className="hover:text-[#6B0B1A] transition">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[#6B0B1A] transition">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#6B0B1A] transition">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-[#6B0B1A] transition">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Our Categories */}
          <div>
            <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
              Our Categories
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/store/categories/gold-jewellery" className="hover:text-[#6B0B1A] transition">
                  Gold Jewellery
                </Link>
              </li>
              <li>
                <Link href="/store/categories/silver-jewellery" className="hover:text-[#6B0B1A] transition">
                  Silver Jewellery
                </Link>
              </li>
              <li>
                <Link href="/store/categories/grocery" className="hover:text-[#6B0B1A] transition">
                  Grocery & Daily Needs
                </Link>
              </li>
              <li>
                <Link href="/store/categories/fashion" className="hover:text-[#6B0B1A] transition">
                  Fashion & Lifestyle
                </Link>
              </li>
              <li>
                <Link href="/store/categories/electronics" className="hover:text-[#6B0B1A] transition">
                  Electronics
                </Link>
              </li>
              <li>
                <Link href="/store/recharge" className="hover:text-[#6B0B1A] transition">
                  Recharge & Bills
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 5: Newsletter Subscribe */}
          <div className="space-y-3">
            <div className="font-bold text-xs text-gray-900 uppercase tracking-wider">
              Subscribe to Updates
            </div>
            <p className="text-xs text-gray-500">
              Get latest offers, new arrivals and festive updates.
            </p>
            {subscribed ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md font-semibold">
                ✓ Thank you for subscribing to Jai Maa Durga updates!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2">
                <div className="flex">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full px-3 py-2 bg-[#FAF7F2] border border-[#EBDCB9] rounded-l-md text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#6B0B1A]"
                  />
                  <button
                    type="submit"
                    className="bg-[#6B0B1A] hover:bg-[#831023] text-white text-xs font-semibold px-4 py-2 rounded-r-md transition shrink-0"
                  >
                    Subscribe
                  </button>
                </div>
                <label className="flex items-center space-x-2 text-[11px] text-gray-500 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-[#6B0B1A] focus:ring-[#6B0B1A]" />
                  <span>I agree to receive updates via email.</span>
                </label>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Copyright and Payment Badges */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div>
            &copy; {new Date().getFullYear()} Jai Maa Durga. All rights reserved. | A Brand by{" "}
            <Link href="/" className="font-medium text-[#6B0B1A] hover:underline">
              Bhavika Education & Welfare Foundation
            </Link>
          </div>
          <div className="flex items-center space-x-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">Razorpay</span>
            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">VISA</span>
            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">Mastercard</span>
            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">RuPay</span>
            <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">UPI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
