"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/store/cart-context";
import { ShoppingCart, Search, Filter } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
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

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
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

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      !selectedCategory || p.categorySlug === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Product Catalogue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified inventory available for Bhavika coupon redemption
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs w-48 sm:w-60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-slate-700 font-medium focus:outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-slate-200 animate-pulse rounded-xl"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <p className="text-slate-500 text-sm">
            No products matched your search or filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between"
            >
              <div className="p-4 space-y-3">
                <div className="h-44 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">
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
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    SKU: {product.sku}
                  </div>
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
                      {addedSku === product.sku ? "Added!" : "Add to Cart"}
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
    </div>
  );
}
