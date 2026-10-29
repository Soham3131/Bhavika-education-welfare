"use client";

import React, { useEffect, useState } from "react";
import {
  Package,
  Layers,
  ShoppingBag,
  Sliders,
  Plus,
  RefreshCw,
  Award,
  Coins,
  Ticket,
  Users,
  Zap,
  Trophy,
} from "lucide-react";

interface AdminProduct {
  id: string;
  sku: string;
  title: string;
  slug: string;
  category: string;
  priceRupees: number;
  stock: number;
  reservedStock: number;
  availableStock: number;
  isActive: boolean;
}

interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
}

interface AdminOrder {
  orderRef: string;
  memberId: string;
  itemsTotalRupees: number;
  couponDiscountRupees: number;
  netPayableRupees: number;
  paidCashRupees: number;
  deficitRupees: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

interface AdminMembershipPlan {
  tier: "FREE" | "AREA" | "CHIEF";
  name: string;
  description: string;
  qualificationThresholdRupees: number;
  productDiscountPercentage: number;
  directReferralCommissionPercentage: number;
  status: string;
  isFeeRequired: boolean;
  isActive: boolean;
}

interface AdminCommissionEntry {
  id: string;
  orderRef: string;
  memberId: string;
  sourceMemberId: string;
  type: string;
  status: string;
  level: number;
  eligibleBaseRupees: number;
  commissionRatePercentage: number;
  commissionAmountRupees: number;
  reversalReason: string | null;
  createdAt: string;
  settledAt: string | null;
}

interface AdminCoupon {
  _id: string;
  couponCode: string;
  faceValuePaise: number;
  source: string;
  status: string;
  expiresAt: string;
  member?: {
    name: string;
    phone: string;
    memberId: string;
  };
}

interface AdminReferralsData {
  stats?: {
    totalMembers: number;
    sponsoredMembers: number;
    organicMembers: number;
  };
  topReferrers?: Array<{
    memberId: string;
    name: string;
    phone: string;
    tier: string;
    directReferralCount: number;
    totalDirectSalesPaise: number;
  }>;
}

interface AdminRecharge {
  _id: string;
  rechargeRef: string;
  serviceType: string;
  operator: string;
  consumerNumber: string;
  amountPaise: number;
  status: string;
  providerName: string;
  providerPayoutPaise: number;
  memberCommissionPaise: number;
  commissionStatus: string;
  createdAt: string;
  reconciledAt: string | null;
  member?: {
    name: string;
    phone: string;
    memberId: string;
  };
}

interface AdminDraw {
  _id: string;
  drawCode: string;
  title: string;
  description: string;
  status: string;
  minOrderAmountPaise: number;
  startDate: string;
  endDate: string;
  scheduledDrawDate: string;
  prizes: Array<{
    rank: number;
    prizeTitle: string;
    winnerCount: number;
    prizeValueRupees?: number;
  }>;
  snapshot?: {
    takenAt: string | null;
    totalEligibleTickets: number;
    snapshotHash: string | null;
  };
  winners: Array<{
    rank: number;
    prizeTitle: string;
    ticketNumber: string;
    memberName?: string;
  }>;
  randomSeed?: string | null;
}

export default function AdminStorePage() {
  const [activeTab, setActiveTab] = useState<
    | "products"
    | "categories"
    | "orders"
    | "inventory"
    | "membership"
    | "commissions"
    | "coupons"
    | "referrals"
    | "recharges"
    | "draws"
  >("products");

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [plans, setPlans] = useState<AdminMembershipPlan[]>([]);
  const [commissions, setCommissions] = useState<AdminCommissionEntry[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [referralsData, setReferralsData] = useState<AdminReferralsData | null>(null);
  const [recharges, setRecharges] = useState<AdminRecharge[]>([]);
  const [draws, setDraws] = useState<AdminDraw[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Draw form state
  const [newDraw, setNewDraw] = useState({
    title: "",
    description: "",
    minOrderAmountRupees: 999,
    startDate: "2026-10-26",
    endDate: "2026-11-26",
    scheduledDrawDate: "2026-11-27",
    prizesText: "Rank 1: 10g 24K Gold Coin (₹75000) x1\nRank 2: Silver Pooja Thali (₹15000) x3\nRank 3: Smart LED TV (₹25000) x2",
  });

  // New product form
  const [newProd, setNewProd] = useState({
    sku: "",
    title: "",
    slug: "",
    categoryId: "",
    basePriceRupees: 500,
    stock: 20,
    description: "",
  });

  // New category form
  const [newCat, setNewCat] = useState({
    name: "",
    slug: "",
    type: "JEWELLERY_GOLD",
    description: "",
  });

  // Inventory adjustment form
  const [invAdj, setInvAdj] = useState({
    productId: "",
    adjustmentDelta: 10,
    reason: "Restock from vendor",
  });

  // Plan edit form
  const [editPlan, setEditPlan] = useState({
    tier: "AREA" as "FREE" | "AREA" | "CHIEF",
    qualificationThresholdRupees: 2000,
    directReferralCommissionPercentage: 5,
  });

  // Grant coupon form
  const [grantForm, setGrantForm] = useState({
    memberId: "",
    faceValueRupees: 500,
    reason: "Administrative promotional grant",
  });

  const [msg, setMsg] = useState<string | null>(null);

  const refreshData = () => {
    Promise.all([
      fetch("/api/admin/store/products").then((r) => r.json()),
      fetch("/api/admin/store/categories").then((r) => r.json()),
      fetch("/api/admin/store/orders").then((r) => r.json()),
      fetch("/api/admin/store/membership").then((r) => r.json()),
      fetch("/api/admin/store/commissions").then((r) => r.json()),
      fetch("/api/admin/store/coupons").then((r) => r.json()),
      fetch("/api/admin/store/referrals").then((r) => r.json()),
      fetch("/api/admin/store/recharge").then((r) => r.json()),
      fetch("/api/admin/store/draws").then((r) => r.json()),
    ])
      .then(([pRes, cRes, oRes, mRes, commRes, cpnRes, refRes, rchRes, drwRes]) => {
        if (pRes.products) setProducts(pRes.products);
        if (cRes.categories) setCategories(cRes.categories);
        if (oRes.orders) setOrders(oRes.orders);
        if (mRes.plans) setPlans(mRes.plans);
        if (commRes.entries) setCommissions(commRes.entries);
        if (cpnRes.coupons) setCoupons(cpnRes.coupons);
        if (refRes) setReferralsData(refRes);
        if (rchRes.recharges) setRecharges(rchRes.recharges);
        if (drwRes.draws) setDraws(drwRes.draws);
      })
      .catch(() => {});
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/store/products").then((r) => r.json()),
      fetch("/api/admin/store/categories").then((r) => r.json()),
      fetch("/api/admin/store/orders").then((r) => r.json()),
      fetch("/api/admin/store/membership").then((r) => r.json()),
      fetch("/api/admin/store/commissions").then((r) => r.json()),
      fetch("/api/admin/store/coupons").then((r) => r.json()),
      fetch("/api/admin/store/referrals").then((r) => r.json()),
      fetch("/api/admin/store/recharge").then((r) => r.json()),
      fetch("/api/admin/store/draws").then((r) => r.json()),
    ])
      .then(([pRes, cRes, oRes, mRes, commRes, cpnRes, refRes, rchRes, drwRes]) => {
        if (!active) return;
        if (pRes.products) setProducts(pRes.products);
        if (cRes.categories) setCategories(cRes.categories);
        if (oRes.orders) setOrders(oRes.orders);
        if (mRes.plans) setPlans(mRes.plans);
        if (commRes.entries) setCommissions(commRes.entries);
        if (cpnRes.coupons) setCoupons(cpnRes.coupons);
        if (refRes) setReferralsData(refRes);
        if (rchRes.recharges) setRecharges(rchRes.recharges);
        if (drwRes.draws) setDraws(drwRes.draws);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProd),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create product");
      setMsg("Product created successfully!");
      setNewProd({
        sku: "",
        title: "",
        slug: "",
        categoryId: categories[0]?.id || "",
        basePriceRupees: 500,
        stock: 20,
        description: "",
      });
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error creating product");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCat),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create category");
      setMsg("Category created successfully!");
      setNewCat({
        name: "",
        slug: "",
        type: "JEWELLERY_GOLD",
        description: "",
      });
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error creating category");
    }
  };

  const handleAdjustInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invAdj),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to adjust stock");
      setMsg("Stock adjusted successfully!");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error adjusting stock");
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPlan),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to update membership plan");
      setMsg("Membership plan updated successfully!");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error updating plan");
    }
  };

  const handleGrantCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(grantForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to grant coupon");
      setMsg(data.message || "Coupon granted successfully!");
      setGrantForm({
        memberId: "",
        faceValueRupees: 500,
        reason: "Administrative promotional grant",
      });
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error granting coupon");
    }
  };

  const handleTriggerReconciliation = async () => {
    setReconciling(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RECONCILE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconciliation failed");
      setMsg(data.message || "Reconciliation sweep completed!");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error running reconciliation");
    } finally {
      setReconciling(false);
    }
  };

  const handleCreateDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const lines = newDraw.prizesText.split("\n").map((l) => l.trim()).filter(Boolean);
      const prizes = lines.map((line, idx) => {
        const xMatch = line.match(/x(\d+)/i);
        const count = xMatch ? parseInt(xMatch[1], 10) : 1;
        const valMatch = line.match(/₹(\d+)/);
        const val = valMatch ? parseInt(valMatch[1], 10) : 0;
        const cleanTitle = line.replace(/Rank \d+:\s*/i, "").replace(/x\d+/i, "").replace(/\(₹\d+\)/, "").trim();
        return {
          rank: idx + 1,
          prizeTitle: cleanTitle || `Prize #${idx + 1}`,
          winnerCount: count,
          prizeValueRupees: val,
        };
      });

      const res = await fetch("/api/admin/store/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          title: newDraw.title,
          description: newDraw.description,
          minOrderAmountRupees: newDraw.minOrderAmountRupees,
          startDate: newDraw.startDate,
          endDate: newDraw.endDate,
          scheduledDrawDate: newDraw.scheduledDrawDate,
          prizes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create draw");
      setMsg(data.message || "Lucky draw created successfully!");
      setNewDraw({
        title: "",
        description: "",
        minOrderAmountRupees: 999,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
        scheduledDrawDate: new Date(Date.now() + 31 * 86400000).toISOString().split("T")[0],
        prizesText: "Rank 1: 10g 24K Gold Coin (₹75000) x1\nRank 2: Silver Pooja Thali (₹15000) x3\nRank 3: Smart LED TV (₹25000) x2",
      });
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error creating lucky draw");
    }
  };

  const handleSnapshotDraw = async (drawId: string) => {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SNAPSHOT", drawId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Snapshot failed");
      setMsg(data.message || "Draw pool snapshot taken and locked!");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error snapshotting draw");
    }
  };

  const handleExecuteDraw = async (drawId: string) => {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EXECUTE_DRAW", drawId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draw execution failed");
      setMsg(data.message || "Draw executed and winners announced!");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error executing draw");
    }
  };

  const handleCancelDraw = async (drawId: string) => {
    const reason = window.prompt("Enter cancellation reason for audit log:");
    if (!reason) return;
    setMsg(null);
    try {
      const res = await fetch("/api/admin/store/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL", drawId, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draw cancellation failed");
      setMsg(data.message || "Lucky draw cancelled.");
      refreshData();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error cancelling draw");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#EBDCB9]/70 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#6B0B1A]">
            Jai Maa Durga Store Administration
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage catalogue, stock reservations, orders, and deficit reconciliation
          </p>
        </div>
        <button
          onClick={refreshData}
          className="p-2 border border-[#EBDCB9] text-gray-700 hover:bg-[#FAF7F2] rounded-lg text-xs font-semibold flex items-center space-x-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {msg && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900">
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#EBDCB9] space-x-6 text-xs font-bold overflow-x-auto pb-0.5">
        <button
          onClick={() => setActiveTab("products")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "products"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("categories")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "categories"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Categories ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "orders"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "inventory"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Stock Adjustment</span>
        </button>

        <button
          onClick={() => setActiveTab("membership")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "membership"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Membership Plans ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("commissions")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "commissions"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Commissions ({commissions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("coupons")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "coupons"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Coupons ({coupons.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("referrals")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "referrals"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Referrals & Trees</span>
        </button>

        <button
          onClick={() => setActiveTab("recharges")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "recharges"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Recharges ({recharges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("draws")}
          className={`pb-3 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "draws"
              ? "border-b-2 border-[#6B0B1A] text-[#6B0B1A]"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Lucky Draws ({draws.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-ink-400 animate-pulse">
          Loading store data...
        </div>
      ) : (
        <>
          {/* Products Tab */}
          {activeTab === "products" && (
            <div className="space-y-6">
              {/* Product Creation Form */}
              <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-brand-600" />
                  <span>Add New Product</span>
                </h3>
                <form
                  onSubmit={handleCreateProduct}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
                >
                  <input
                    type="text"
                    required
                    placeholder="SKU (e.g. JMD-JEW-001)"
                    value={newProd.sku}
                    onChange={(e) =>
                      setNewProd({ ...newProd, sku: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg uppercase"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Product Title"
                    value={newProd.title}
                    onChange={(e) =>
                      setNewProd({ ...newProd, title: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    placeholder="URL Slug (e.g. gold-ring)"
                    value={newProd.slug}
                    onChange={(e) =>
                      setNewProd({ ...newProd, slug: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg lowercase"
                  />
                  <select
                    required
                    value={newProd.categoryId}
                    onChange={(e) =>
                      setNewProd({ ...newProd, categoryId: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg bg-white"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    placeholder="Price in ₹"
                    value={newProd.basePriceRupees}
                    onChange={(e) =>
                      setNewProd({
                        ...newProd,
                        basePriceRupees: Number(e.target.value),
                      })
                    }
                    className="p-2 border border-ink-200 rounded-lg"
                  />
                  <input
                    type="number"
                    required
                    placeholder="Initial Stock"
                    value={newProd.stock}
                    onChange={(e) =>
                      setNewProd({ ...newProd, stock: Number(e.target.value) })
                    }
                    className="p-2 border border-ink-200 rounded-lg"
                  />
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Product Description"
                      value={newProd.description}
                      onChange={(e) =>
                        setNewProd({ ...newProd, description: e.target.value })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm transition"
                    >
                      Save Product
                    </button>
                  </div>
                </form>
              </div>

              {/* Products Table */}
              <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-ink-50 border-b border-ink-100 text-ink-500 font-bold uppercase">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Physical Stock</th>
                      <th className="p-3">Reserved</th>
                      <th className="p-3">Available</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-ink-50/50">
                        <td className="p-3 font-mono font-bold text-ink-900">
                          {p.sku}
                        </td>
                        <td className="p-3 font-semibold text-ink-800">
                          {p.title}
                        </td>
                        <td className="p-3 text-ink-600">{p.category}</td>
                        <td className="p-3 font-bold text-ink-900">
                          ₹{p.priceRupees.toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-ink-700">{p.stock}</td>
                        <td className="p-3 text-amber-700 font-semibold">
                          {p.reservedStock}
                        </td>
                        <td className="p-3 text-emerald-700 font-bold">
                          {p.availableStock}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-ink-100 text-ink-500"
                            }`}
                          >
                            {p.isActive ? "Active" : "Archived"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === "categories" && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-brand-600" />
                  <span>Add New Category</span>
                </h3>
                <form
                  onSubmit={handleCreateCategory}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
                >
                  <input
                    type="text"
                    required
                    placeholder="Category Name"
                    value={newCat.name}
                    onChange={(e) =>
                      setNewCat({ ...newCat, name: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Slug (e.g. gold-jewellery)"
                    value={newCat.slug}
                    onChange={(e) =>
                      setNewCat({ ...newCat, slug: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg lowercase"
                  />
                  <select
                    value={newCat.type}
                    onChange={(e) =>
                      setNewCat({ ...newCat, type: e.target.value })
                    }
                    className="p-2 border border-ink-200 rounded-lg bg-white"
                  >
                    <option value="JEWELLERY_GOLD">Gold Jewellery</option>
                    <option value="JEWELLERY_SILVER">Silver Jewellery</option>
                    <option value="FASHION">Fashion & Apparel</option>
                    <option value="ELECTRONICS">Electronics</option>
                    <option value="GROCERY">Grocery</option>
                    <option value="RECHARGE">Recharge</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold shadow-sm"
                  >
                    Save Category
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-ink-50 border-b border-ink-100 text-ink-500 font-bold uppercase">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Slug</th>
                      <th className="p-3">Domain Type</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td className="p-3 font-semibold text-ink-900">
                          {c.name}
                        </td>
                        <td className="p-3 font-mono text-ink-600">{c.slug}</td>
                        <td className="p-3 text-ink-600">{c.type}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === "orders" && (
            <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-ink-50 border-b border-ink-100 text-ink-500 font-bold uppercase">
                  <tr>
                    <th className="p-3">Order Ref</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Items Total</th>
                    <th className="p-3">Coupon Discount</th>
                    <th className="p-3">Paid Cash</th>
                    <th className="p-3">Deficit</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {orders.map((o) => (
                    <tr key={o.orderRef} className="hover:bg-ink-50/50">
                      <td className="p-3 font-mono font-bold text-ink-900">
                        {o.orderRef}
                      </td>
                      <td className="p-3 text-ink-500">
                        {new Date(o.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="p-3 text-ink-800">
                        ₹{o.itemsTotalRupees.toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 text-emerald-700 font-semibold">
                        ₹{o.couponDiscountRupees.toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-bold text-ink-900">
                        ₹{o.paidCashRupees.toLocaleString("en-IN")}
                      </td>
                      <td className="p-3">
                        {o.deficitRupees > 0 ? (
                          <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded">
                            ₹{o.deficitRupees}
                          </span>
                        ) : (
                          <span className="text-ink-400">₹0</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ink-100 text-ink-700">
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-ink-600 font-medium">
                        {o.paymentStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Inventory Adjustment Tab */}
          {activeTab === "inventory" && (
            <div className="max-w-xl bg-white p-6 rounded-2xl border border-ink-100 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                <Sliders className="w-4 h-4 text-brand-600" />
                <span>Adjust Product Inventory Stock</span>
              </h3>
              <p className="text-xs text-ink-500">
                Directly increment or decrement physical stock. The resulting
                stock cannot be set lower than currently reserved stock.
              </p>

              <form onSubmit={handleAdjustInventory} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-ink-700 mb-1">
                    Select Product
                  </label>
                  <select
                    required
                    value={invAdj.productId}
                    onChange={(e) =>
                      setInvAdj({ ...invAdj, productId: e.target.value })
                    }
                    className="w-full p-2 border border-ink-200 rounded-lg bg-white"
                  >
                    <option value="">Choose product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} - {p.title} (Stock: {p.stock}, Reserved:{" "}
                        {p.reservedStock})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-ink-700 mb-1">
                    Adjustment Quantity Delta (+ / -)
                  </label>
                  <input
                    type="number"
                    required
                    value={invAdj.adjustmentDelta}
                    onChange={(e) =>
                      setInvAdj({
                        ...invAdj,
                        adjustmentDelta: Number(e.target.value),
                      })
                    }
                    className="w-full p-2 border border-ink-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink-700 mb-1">
                    Reason for Adjustment
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vendor delivery batch #123"
                    value={invAdj.reason}
                    onChange={(e) =>
                      setInvAdj({ ...invAdj, reason: e.target.value })
                    }
                    className="w-full p-2 border border-ink-200 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm transition"
                >
                  Apply Stock Adjustment
                </button>
              </form>
            </div>
          )}

          {/* Membership Plans Tab */}
          {activeTab === "membership" && (
            <div className="space-y-6">
              {/* Plan Update Form */}
              <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                  <Award className="w-4 h-4 text-brand-600" />
                  <span>Configure Membership Tier Parameters</span>
                </h3>
                <form
                  onSubmit={handleUpdatePlan}
                  className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs"
                >
                  <div>
                    <label className="block font-semibold text-ink-700 mb-1">
                      Target Tier
                    </label>
                    <select
                      value={editPlan.tier}
                      onChange={(e) =>
                        setEditPlan({
                          ...editPlan,
                          tier: e.target.value as "FREE" | "AREA" | "CHIEF",
                        })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg bg-white"
                    >
                      <option value="AREA">AREA</option>
                      <option value="CHIEF">CHIEF</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-ink-700 mb-1">
                      Qualification Threshold (₹)
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editPlan.qualificationThresholdRupees}
                      onChange={(e) =>
                        setEditPlan({
                          ...editPlan,
                          qualificationThresholdRupees: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-ink-700 mb-1">
                      Direct Referral Commission (%)
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      value={editPlan.directReferralCommissionPercentage}
                      onChange={(e) =>
                        setEditPlan({
                          ...editPlan,
                          directReferralCommissionPercentage: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm transition"
                    >
                      Save Tier Settings
                    </button>
                  </div>
                </form>
              </div>

              {/* Plans Table */}
              <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-ink-100 bg-ink-50/50">
                  <h3 className="font-bold text-sm text-ink-900">
                    Tier Definitions & Safeguards
                  </h3>
                  <p className="text-xs text-ink-500">
                    Membership fees and automatic recurring charges remain disabled pending client approval.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-50 border-b border-ink-100 text-ink-600 font-semibold">
                      <tr>
                        <th className="p-3">Tier</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Qualification Spend</th>
                        <th className="p-3">Product Discount</th>
                        <th className="p-3">Referral Commission</th>
                        <th className="p-3">Fee Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {plans.map((p) => (
                        <tr key={p.tier} className="hover:bg-ink-50/50">
                          <td className="p-3 font-mono font-bold text-ink-900">
                            {p.tier}
                          </td>
                          <td className="p-3 text-ink-800">{p.name}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.status === "FINAL"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : p.status === "DEV-CONFIRMED"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-ink-900">
                            ₹{p.qualificationThresholdRupees.toLocaleString("en-IN")}
                          </td>
                          <td className="p-3">{p.productDiscountPercentage}%</td>
                          <td className="p-3 font-bold text-brand-600">
                            {p.directReferralCommissionPercentage}%
                          </td>
                          <td className="p-3 text-slate-500">
                            {p.isFeeRequired ? "Active" : "Disabled (Protected)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Commissions Tab */}
          {activeTab === "commissions" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <Coins className="w-4 h-4 text-amber-700" />
                  <span>Direct-Sponsor Product Sales Commissions (Single-Level Only)</span>
                </div>
                <p>
                  Per regulatory and project safeguards, referral income is strictly restricted to immediate direct sponsors (depth = 1) on genuine product sales. Live payouts are held in audit mode pending legal sign-off.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-ink-50 border-b border-ink-100 text-ink-600 font-semibold">
                      <tr>
                        <th className="p-3">Order Ref</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Level</th>
                        <th className="p-3">Eligible Base</th>
                        <th className="p-3">Rate</th>
                        <th className="p-3">Commission</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {commissions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-ink-400">
                            No commission records found.
                          </td>
                        </tr>
                      ) : (
                        commissions.map((c) => (
                          <tr key={c.id} className="hover:bg-ink-50/50">
                            <td className="p-3 font-mono font-bold text-ink-900">
                              {c.orderRef}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  c.type === "SALE_DIRECT"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                {c.type}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-semibold text-ink-700">
                              L{c.level}
                            </td>
                            <td className="p-3">₹{c.eligibleBaseRupees.toFixed(2)}</td>
                            <td className="p-3">{c.commissionRatePercentage}%</td>
                            <td className="p-3 font-bold text-brand-600">
                              ₹{c.commissionAmountRupees.toFixed(2)}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.status === "PAID"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : c.status === "PAYABLE"
                                    ? "bg-blue-50 text-blue-700"
                                    : c.status === "PENDING"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-ink-400">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Coupons Tab */}
          {activeTab === "coupons" && (
            <div className="space-y-6">
              {/* Grant Coupon Form */}
              <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs space-y-4">
                <div className="flex items-center space-x-2 border-b border-ink-100 pb-2">
                  <Ticket className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-ink-900">
                    Grant Promotional / Compensation Store Coupon
                  </h3>
                </div>
                <form
                  onSubmit={handleGrantCoupon}
                  className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
                >
                  <div>
                    <label className="block text-ink-600 font-semibold mb-1">
                      Target Member ID (Database Hex or Ref)
                    </label>
                    <input
                      type="text"
                      required
                      value={grantForm.memberId}
                      onChange={(e) =>
                        setGrantForm({ ...grantForm, memberId: e.target.value })
                      }
                      placeholder="e.g. 65a... or JMD-2026-..."
                      className="w-full p-2 border border-ink-200 rounded-lg text-ink-900 focus:outline-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-ink-600 font-semibold mb-1">
                      Face Value (₹)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={grantForm.faceValueRupees}
                      onChange={(e) =>
                        setGrantForm({
                          ...grantForm,
                          faceValueRupees: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg text-ink-900 focus:outline-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-ink-600 font-semibold mb-1">
                      Audit Grant Reason
                    </label>
                    <input
                      type="text"
                      required
                      value={grantForm.reason}
                      onChange={(e) =>
                        setGrantForm({ ...grantForm, reason: e.target.value })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg text-ink-900 focus:outline-brand-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg transition"
                    >
                      Issue Admin Coupon
                    </button>
                  </div>
                </form>
              </div>

              {/* Coupons List Table */}
              <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    Store Coupons Registry ({coupons.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                        <th className="p-3">Coupon Code</th>
                        <th className="p-3">Source</th>
                        <th className="p-3">Member</th>
                        <th className="p-3">Face Value</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Expires At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {coupons.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-ink-400">
                            No native coupons issued yet.
                          </td>
                        </tr>
                      ) : (
                        coupons.map((c) => (
                          <tr key={c._id} className="hover:bg-ink-50/50">
                            <td className="p-3 font-mono font-bold text-ink-900">
                              {c.couponCode}
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800">
                                {c.source}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-ink-800">
                                {c.member?.name || "Member"}
                              </div>
                              <div className="text-[10px] text-ink-400 font-mono">
                                {c.member?.memberId || c.member?.phone}
                              </div>
                            </td>
                            <td className="p-3 font-bold text-brand-600">
                              ₹{(c.faceValuePaise / 100).toFixed(0)}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : c.status === "REDEEMED"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-ink-400">
                              {new Date(c.expiresAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Referrals & Sponsor Trees Tab */}
          {activeTab === "referrals" && (
            <div className="space-y-6">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Total Registered Members
                  </div>
                  <div className="text-2xl font-black text-ink-900 mt-1">
                    {referralsData?.stats?.totalMembers ?? 0}
                  </div>
                </div>
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Sponsored Network Members
                  </div>
                  <div className="text-2xl font-black text-brand-600 mt-1">
                    {referralsData?.stats?.sponsoredMembers ?? 0}
                  </div>
                </div>
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Organic Signups (No Sponsor)
                  </div>
                  <div className="text-2xl font-black text-ink-600 mt-1">
                    {referralsData?.stats?.organicMembers ?? 0}
                  </div>
                </div>
              </div>

              {/* Top Referrers Table */}
              <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    Top Direct Referrers & Network Builders
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                        <th className="p-3">Member ID</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Tier</th>
                        <th className="p-3">Direct Referrals</th>
                        <th className="p-3">Total Downline Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {!referralsData?.topReferrers ||
                      referralsData.topReferrers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-ink-400">
                            No referral activity recorded yet.
                          </td>
                        </tr>
                      ) : (
                        referralsData.topReferrers.map((r) => (
                          <tr key={r.memberId} className="hover:bg-ink-50/50">
                            <td className="p-3 font-mono font-bold text-ink-900">
                              {r.memberId}
                            </td>
                            <td className="p-3 font-semibold text-ink-800">{r.name}</td>
                            <td className="p-3 font-mono text-ink-600">{r.phone}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                                {r.tier}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-brand-600">
                              {r.directReferralCount}
                            </td>
                            <td className="p-3 font-mono font-semibold text-ink-900">
                              ₹{((r.totalDirectSalesPaise || 0) / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Recharges Tab */}
          {activeTab === "recharges" && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                    <Zap className="w-4 h-4 text-brand-600" />
                    <span>Recharge & Bill Pay Audit</span>
                  </h3>
                  <p className="text-xs text-ink-500 mt-1">
                    Async reconciliation, provider payout tracking, and member commission safeguards across 6 utilities.
                  </p>
                </div>
                <button
                  onClick={handleTriggerReconciliation}
                  disabled={reconciling}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-sm flex items-center justify-center space-x-2"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`}
                  />
                  <span>
                    {reconciling ? "Reconciling Sweep..." : "Run Reconciliation Sweep"}
                  </span>
                </button>
              </div>

              {/* Recharge Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Total Transactions
                  </div>
                  <div className="text-2xl font-black text-ink-900 mt-1">
                    {recharges.length}
                  </div>
                </div>
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Total Volume
                  </div>
                  <div className="text-2xl font-black text-brand-600 mt-1">
                    ₹
                    {(
                      recharges.reduce((acc, r) => acc + (r.amountPaise || 0), 0) /
                      100
                    ).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Total Member Commission
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    ₹
                    {(
                      recharges
                        .filter((r) => r.commissionStatus === "CREDITED")
                        .reduce(
                          (acc, r) => acc + (r.memberCommissionPaise || 0),
                          0
                        ) / 100
                    ).toFixed(2)}
                  </div>
                </div>
                <div className="p-4 bg-white border border-ink-200 rounded-xl shadow-xs">
                  <div className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    Pending Confirmation
                  </div>
                  <div className="text-2xl font-black text-amber-600 mt-1">
                    {
                      recharges.filter(
                        (r) => r.status === "PENDING_CONFIRMATION"
                      ).length
                    }
                  </div>
                </div>
              </div>

              {/* Recharges Audit Table */}
              <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    Recharge Orders & Provider Status
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                        <th className="p-3">Reference / Date</th>
                        <th className="p-3">Member</th>
                        <th className="p-3">Service / Operator</th>
                        <th className="p-3">Consumer ID</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-right">Provider Payout</th>
                        <th className="p-3 text-right">Commission</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {recharges.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="p-8 text-center text-ink-400"
                          >
                            No recharge orders placed yet.
                          </td>
                        </tr>
                      ) : (
                        recharges.map((r) => (
                          <tr key={r._id} className="hover:bg-ink-50/50">
                            <td className="p-3 font-mono">
                              <div className="font-bold text-ink-900">
                                {r.rechargeRef}
                              </div>
                              <div className="text-[10px] text-ink-400">
                                {new Date(r.createdAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-ink-800">
                                {r.member?.name || "Member"}
                              </div>
                              <div className="text-[10px] font-mono text-ink-400">
                                {r.member?.phone || r.member?.memberId || "—"}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-ink-800">
                                {r.serviceType.replace("_", " ")}
                              </div>
                              <div className="text-[10px] text-ink-500">
                                {r.operator}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-ink-700">
                              {r.consumerNumber}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-ink-900">
                              ₹{(r.amountPaise / 100).toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono text-ink-600">
                              ₹{((r.providerPayoutPaise || 0) / 100).toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono">
                              <div className="font-bold text-emerald-600">
                                ₹
                                {(
                                  (r.memberCommissionPaise || 0) / 100
                                ).toFixed(2)}
                              </div>
                              <div className="text-[9px] uppercase font-bold text-ink-400">
                                {r.commissionStatus}
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === "SUCCESS"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : r.status === "PENDING_CONFIRMATION"
                                    ? "bg-amber-50 text-amber-700"
                                    : r.status === "FAILED"
                                    ? "bg-rose-50 text-rose-700"
                                    : "bg-ink-100 text-ink-700"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Lucky Draws Tab */}
          {activeTab === "draws" && (
            <div className="space-y-6">
              {/* Draw Creation Form */}
              <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-ink-900 flex items-center space-x-1.5">
                  <Trophy className="w-4 h-4 text-brand-600" />
                  <span>Create & Schedule New Bumper Lucky Draw</span>
                </h3>
                <form onSubmit={handleCreateDraw} className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Draw Title (e.g. Diwali Bumper Gold Draw)"
                      value={newDraw.title}
                      onChange={(e) =>
                        setNewDraw({ ...newDraw, title: e.target.value })
                      }
                      className="p-2 border border-ink-200 rounded-lg"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Description"
                      value={newDraw.description}
                      onChange={(e) =>
                        setNewDraw({ ...newDraw, description: e.target.value })
                      }
                      className="p-2 border border-ink-200 rounded-lg sm:col-span-2"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-ink-500 uppercase">
                        Min Order Amount (₹)
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={newDraw.minOrderAmountRupees}
                        onChange={(e) =>
                          setNewDraw({
                            ...newDraw,
                            minOrderAmountRupees: Number(e.target.value),
                          })
                        }
                        className="w-full p-2 border border-ink-200 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-500 uppercase">
                        Start Date
                      </label>
                      <input
                        type="date"
                        required
                        value={newDraw.startDate}
                        onChange={(e) =>
                          setNewDraw({ ...newDraw, startDate: e.target.value })
                        }
                        className="w-full p-2 border border-ink-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-500 uppercase">
                        End Date
                      </label>
                      <input
                        type="date"
                        required
                        value={newDraw.endDate}
                        onChange={(e) =>
                          setNewDraw({ ...newDraw, endDate: e.target.value })
                        }
                        className="w-full p-2 border border-ink-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-500 uppercase">
                        Scheduled Draw Date
                      </label>
                      <input
                        type="date"
                        required
                        value={newDraw.scheduledDrawDate}
                        onChange={(e) =>
                          setNewDraw({
                            ...newDraw,
                            scheduledDrawDate: e.target.value,
                          })
                        }
                        className="w-full p-2 border border-ink-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-ink-500 uppercase">
                      Prizes Specification (Format: Rank N: Title (₹Value) xCount)
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={newDraw.prizesText}
                      onChange={(e) =>
                        setNewDraw({ ...newDraw, prizesText: e.target.value })
                      }
                      className="w-full p-2 border border-ink-200 rounded-lg font-mono text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold shadow-sm flex items-center space-x-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Launch & Schedule Draw</span>
                  </button>
                </form>
              </div>

              {/* Draws Table */}
              <div className="bg-white border border-ink-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-ink-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    Lucky Draws Management & Auditable Roster
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                        <th className="p-3">Draw Code / Title</th>
                        <th className="p-3">Schedule</th>
                        <th className="p-3">Qualifying Spend</th>
                        <th className="p-3">Prizes</th>
                        <th className="p-3">Status / Pool</th>
                        <th className="p-3">Auditable Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {draws.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-ink-400">
                            No lucky draws configured yet.
                          </td>
                        </tr>
                      ) : (
                        draws.map((d) => (
                          <tr key={d._id} className="hover:bg-ink-50/50">
                            <td className="p-3">
                              <div className="font-bold text-ink-900">
                                {d.title}
                              </div>
                              <div className="font-mono text-[10px] text-ink-400">
                                {d.drawCode}
                              </div>
                            </td>
                            <td className="p-3 text-[11px]">
                              <div>
                                {new Date(d.startDate).toLocaleDateString()} –{" "}
                                {new Date(d.endDate).toLocaleDateString()}
                              </div>
                              <div className="text-brand-600 font-semibold">
                                Draw:{" "}
                                {new Date(
                                  d.scheduledDrawDate
                                ).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="p-3 font-mono font-bold text-ink-800">
                              ₹{(d.minOrderAmountPaise / 100).toFixed(2)}+
                            </td>
                            <td className="p-3">
                              <div className="space-y-0.5">
                                {d.prizes.map((p, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="text-[11px] text-ink-700"
                                  >
                                    <span className="font-semibold text-amber-700">
                                      #{p.rank}:
                                    </span>{" "}
                                    {p.prizeTitle} (×{p.winnerCount})
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-1">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    d.status === "ACTIVE"
                                      ? "bg-emerald-50 text-emerald-700"
                                      : d.status === "LOCKED"
                                      ? "bg-amber-50 text-amber-700"
                                      : d.status === "COMPLETED"
                                      ? "bg-brand-50 text-brand-700"
                                      : "bg-ink-100 text-ink-600"
                                  }`}
                                >
                                  {d.status}
                                </span>
                                {d.snapshot?.totalEligibleTickets !==
                                  undefined && (
                                  <div className="text-[10px] text-ink-500 font-mono">
                                    {d.snapshot.totalEligibleTickets} tickets
                                    locked
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center space-x-2">
                                {d.status === "ACTIVE" && (
                                  <>
                                    <button
                                      onClick={() => handleSnapshotDraw(d._id)}
                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold"
                                    >
                                      Lock Snapshot
                                    </button>
                                    <button
                                      onClick={() => handleCancelDraw(d._id)}
                                      className="px-2 py-1 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-[11px] font-semibold"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {d.status === "LOCKED" && (
                                  <>
                                    <button
                                      onClick={() => handleExecuteDraw(d._id)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-xs"
                                    >
                                      Execute Draw
                                    </button>
                                    <button
                                      onClick={() => handleCancelDraw(d._id)}
                                      className="px-2 py-1 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-[11px] font-semibold"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {d.status === "COMPLETED" && (
                                  <div className="text-[11px] font-mono text-emerald-700 font-bold">
                                    {d.winners?.length || 0} Winners Announced
                                  </div>
                                )}
                                {d.status === "CANCELLED" && (
                                  <div className="text-[10px] text-ink-400 italic">
                                    Cancelled
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
