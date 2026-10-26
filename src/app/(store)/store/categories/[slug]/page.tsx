"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import { ShoppingCart, ArrowLeft } from "lucide-react";

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

export default function CategoryBrowsePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [addedSku, setAddedSku] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/store/products?category=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.products) setProducts(data.products);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

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

  const categoryTitle =
    products[0]?.categoryName ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <Link
            href="/store"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-amber-600 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Store</span>
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {categoryTitle}
          </h1>
          <p className="text-xs text-slate-500">
            Browse items in {categoryTitle} category
          </p>
        </div>
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
            No products found in this category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
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
