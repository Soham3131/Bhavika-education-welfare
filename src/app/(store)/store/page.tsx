"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/store/cart-context";
import { ArrowRight, ShoppingCart, Sparkles, ShieldCheck, Ticket } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
}

interface Product {
  id: string;
  sku: string;
  title: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  priceRupees: number;
  availableStock: number;
  images: string[];
  description?: string;
}

export default function StoreHomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [addedSku, setAddedSku] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/store/categories").then((r) => r.json()),
      fetch("/api/store/products").then((r) => r.json()),
    ])
      .then(([catData, prodData]) => {
        if (catData.categories) setCategories(catData.categories);
        if (prodData.products) setProducts(prodData.products);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAddToCart = (product: Product) => {
    addItem({
      productId: product.id,
      sku: product.sku,
      title: product.title,
      slug: product.slug,
      priceRupees: product.priceRupees,
      image: product.images[0],
    });
    setAddedSku(product.sku);
    setTimeout(() => setAddedSku(null), 1500);
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-600 via-amber-700 to-rose-700 text-white p-8 md:p-14 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-amber-100">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Official Commerce Gateway</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Jai Maa Durga <br />
            <span className="text-amber-200">Commerce & Welfare Platform</span>
          </h1>
          <p className="text-amber-100 text-base sm:text-lg leading-relaxed">
            Shop certified gold & silver jewellery, fashion, and daily
            essentials. Apply Bhavika Foundation quiz coupons directly at
            checkout.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/store/products"
              className="inline-flex items-center space-x-2 bg-white text-amber-900 font-bold px-5 py-3 rounded-xl shadow-md hover:bg-amber-50 transition"
            >
              <span>Explore Catalogue</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/store/cart"
              className="inline-flex items-center space-x-2 bg-amber-800/40 border border-white/30 text-white font-medium px-5 py-3 rounded-xl hover:bg-amber-800/60 transition"
            >
              <span>Go to Cart</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              Bhavika Coupon Bridge
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Redeem Bhavika bearer coupons seamlessly against product totals.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              Concurrency-Safe Stock
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Guaranteed real-time stock reservation preventing over-allocation.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-lg">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              Server-Verified Pricing
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Integer-precision paise calculation tamper-proof against client edits.
            </p>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Browse Categories
            </h2>
            <p className="text-xs text-slate-500">
              Select a category to view specialized items
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-slate-200 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/store/categories/${cat.slug}`}
                className="group p-4 bg-white rounded-xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition text-center"
              >
                <div className="font-semibold text-slate-800 text-sm group-hover:text-amber-600 transition">
                  {cat.name}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider">
                  {cat.type.replace("JEWELLERY_", "")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured Products */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Featured Products
            </h2>
            <p className="text-xs text-slate-500">
              Available for immediate order and Bhavika coupon redemption
            </p>
          </div>
          <Link
            href="/store/products"
            className="text-sm font-semibold text-amber-600 hover:text-amber-700 flex items-center space-x-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-72 bg-slate-200 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
            <p className="text-slate-500 text-sm">
              No products available in the catalogue yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.slice(0, 8).map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
              >
                <div className="p-4 space-y-3">
                  <div className="h-40 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">
                    {product.images[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.title}
                        className="h-full w-full object-cover rounded-lg"
                      />
                    ) : (
                      <span>Jai Maa Durga Item</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full uppercase">
                      {product.categoryName}
                    </span>
                    <h3 className="font-semibold text-slate-900 text-base mt-1 line-clamp-1">
                      <Link
                        href={`/store/products/${product.slug}`}
                        className="hover:text-amber-600 transition"
                      >
                        {product.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {product.description || "Certified authentic store product."}
                    </p>
                  </div>
                </div>

                <div className="p-4 pt-0 border-t border-slate-100 flex items-center justify-between mt-3">
                  <div>
                    <div className="text-xs text-slate-400">Price</div>
                    <div className="text-lg font-bold text-slate-900">
                      ₹{product.priceRupees.toLocaleString("en-IN")}
                    </div>
                  </div>
                  {product.availableStock > 0 ? (
                    <button
                      onClick={() => handleAddToCart(product)}
                      className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                        addedSku === product.sku
                          ? "bg-emerald-600 text-white"
                          : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                      }`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>
                        {addedSku === product.sku ? "Added!" : "Add"}
                      </span>
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-rose-500 bg-rose-50 px-2 py-1 rounded">
                      Out of stock
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
