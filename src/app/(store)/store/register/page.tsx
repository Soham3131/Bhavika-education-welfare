"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus, ArrowRight } from "lucide-react";

function StoreRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/store";

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    email: "",
    sponsorId: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/store/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating account.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-2xl mb-1">
          <UserPlus className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Create Member Account
        </h1>
        <p className="text-xs text-slate-500">
          Join Jai Maa Durga Commerce and redeem Bhavika coupons
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
            Full Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Ramesh Kumar"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Phone Number *
          </label>
          <input
            type="tel"
            required
            placeholder="e.g. 9876543210"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Password *
          </label>
          <input
            type="password"
            required
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Email Address (Optional)
          </label>
          <input
            type="email"
            placeholder="e.g. ramesh@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label className="block text-slate-700 font-semibold mb-1">
            Sponsor ID (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. JMD-2026-000001 (or leave blank)"
            value={form.sponsorId}
            onChange={(e) =>
              setForm({ ...form, sponsorId: e.target.value.toUpperCase() })
            }
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition shadow-md text-xs mt-2"
        >
          <span>{loading ? "Creating Account..." : "Create Account"}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Already have a member account?{" "}
        <Link
          href={`/store/login?redirect=${encodeURIComponent(redirectPath)}`}
          className="text-amber-600 font-bold hover:underline"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}

export default function StoreRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto my-12 p-8 text-center text-slate-400 text-xs">
          Loading registration...
        </div>
      }
    >
      <StoreRegisterForm />
    </Suspense>
  );
}
