"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, LogIn, ArrowRight } from "lucide-react";

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
    <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-2xl mb-1">
          <LogIn className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Member Sign In
        </h1>
        <p className="text-xs text-slate-500">
          Enter your Jai Maa Durga Member ID or registered phone number
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Phone Number or Member ID (JMD-...)
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 9876543210 or JMD-2026-000001"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Password
          </label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition shadow-md text-xs mt-2"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{loading ? "Signing In..." : "Sign In"}</span>
        </button>
      </form>

      <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Don&apos;t have a member account yet?{" "}
        <Link
          href={`/store/register?redirect=${encodeURIComponent(redirectPath)}`}
          className="text-amber-600 font-bold hover:underline inline-flex items-center space-x-0.5"
        >
          <span>Register Here</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

export default function StoreLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto my-12 p-8 text-center text-slate-400 text-xs">
          Loading sign in...
        </div>
      }
    >
      <StoreLoginForm />
    </Suspense>
  );
}
