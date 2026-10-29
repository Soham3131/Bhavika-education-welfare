"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";

function StoreLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/store";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/store/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 sm:my-14 bg-white p-7 sm:p-9 rounded-2xl border border-[#EBDCB9] shadow-xs space-y-6 font-sans">
      {/* Brand Logo & Heading */}
      <div className="text-center space-y-3">
        <Link href="/store" className="inline-block">
          <div className="relative h-12 w-48 mx-auto">
            <Image
              src="/images/jmd-logo-banner.png"
              alt="Jai Maa Durga Divine Shopping"
              fill
              sizes="200px"
              priority
              className="object-contain"
            />
          </div>
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#6B0B1A] tracking-tight">
            Member Sign In
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Access your 7-wallet ledger, tracking, and Bhavika coupon redemption
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-gray-700 font-semibold mb-1">
            Phone Number or Member ID (JMD-...)
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 9876543210 or JMD-2026-000001"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EBDCB9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#6B0B1A]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-gray-700 font-semibold">
              Password
            </label>
          </div>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EBDCB9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#6B0B1A]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 bg-[#6B0B1A] hover:bg-[#831023] disabled:opacity-50 text-white font-bold py-3 px-4 rounded-md transition shadow-xs text-xs mt-2"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{loading ? "Signing In..." : "Sign In to Member Portal"}</span>
        </button>
      </form>

      <div className="pt-4 border-t border-[#EBDCB9]/60 text-center text-xs text-gray-500">
        Don&apos;t have a member account yet?{" "}
        <Link
          href={`/store/register?redirect=${encodeURIComponent(redirectPath)}`}
          className="text-[#6B0B1A] font-bold hover:underline inline-flex items-center space-x-0.5 ml-1"
        >
          <span>Register Here</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="pt-2 flex items-center justify-center space-x-1.5 text-[11px] text-gray-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>End-to-end encrypted session</span>
      </div>
    </div>
  );
}

export default function StoreLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto my-12 p-8 text-center text-gray-400 text-xs">
          Loading sign in...
        </div>
      }
    >
      <StoreLoginForm />
    </Suspense>
  );
}
