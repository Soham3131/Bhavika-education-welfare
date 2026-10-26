"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCart } from "@/lib/store/cart-context";
import {
  ShoppingCart,
  ShieldCheck,
  Truck,
  ArrowLeft,
  CheckCircle,
  Plus,
  Minus,
} from "lucide-react";

interface ProductDetail {
  id: string;
  sku: string;
  title: string;
  slug: string;
  category: {
    name: string;
    slug: string;
    type: string;
  };
  description?: string;
  images: string[];
  priceRupees: number;
  availableStock: number;
  attributes?: Record<string, unknown>;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const { addItem } = useCart();

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/store/products/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Product not found");
        return res.json();
      })
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
        } else {
          setError("Product not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(
      {
        productId: product.id,
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        priceRupees: product.priceRupees,
        image: product.images[0],
      },
      quantity,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    router.push("/store/cart");
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 animate-pulse space-y-8">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="h-96 bg-slate-200 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 bg-slate-200 rounded w-3/4" />
            <div className="h-4 bg-slate-200 rounded w-1/4" />
            <div className="h-10 bg-slate-200 rounded w-1/2" />
            <div className="h-28 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">
          Product Not Available
        </h2>
        <p className="text-sm text-slate-500">
          The requested product could not be found or has been discontinued.
        </p>
        <Link
          href="/store/products"
          className="inline-flex items-center space-x-2 text-amber-600 font-semibold hover:underline text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogue</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      <Link
        href="/store/products"
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-amber-600 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Products</span>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
        {/* Product Image */}
        <div className="space-y-4">
          <div className="h-80 sm:h-96 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
            {product.images[0] ? (
              <img
                src={product.images[0]}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-slate-400 font-medium text-sm">
                Jai Maa Durga Item Photo
              </span>
            )}
          </div>
        </div>

        {/* Product Details */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full uppercase">
                {product.category.name}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                SKU: {product.sku}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              {product.title}
            </h1>

            <div className="text-2xl sm:text-3xl font-black text-slate-900 pt-1">
              ₹{product.priceRupees.toLocaleString("en-IN")}
              <span className="text-xs font-normal text-slate-400 ml-2">
                (Inclusive of all taxes)
              </span>
            </div>

            <div className="pt-2">
              {product.availableStock > 0 ? (
                <span className="inline-flex items-center space-x-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>In Stock ({product.availableStock} units available)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-xs font-medium text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md">
                  <span>Currently Out of Stock</span>
                </span>
              )}
            </div>

            <div className="pt-2">
              <p className="text-sm text-slate-600 leading-relaxed">
                {product.description ||
                  "Quality verified item with authentic purity testing and guarantee."}
              </p>
            </div>
          </div>

          {product.availableStock > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center space-x-4">
                <span className="text-xs font-semibold text-slate-700">
                  Quantity:
                </span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-4 text-xs font-bold text-slate-800">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity((q) =>
                        Math.min(product.availableStock, q + 1),
                      )
                    }
                    disabled={quantity >= product.availableStock}
                    className="p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleAddToCart}
                  className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-bold text-xs transition ${
                    added
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{added ? "Added to Cart!" : "Add to Cart"}</span>
                </button>
                <button
                  onClick={handleBuyNow}
                  className="flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white py-3 px-4 rounded-xl font-bold text-xs shadow-md transition"
                >
                  <span>Buy Now</span>
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4 text-xs text-slate-500">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>100% Genuine Certified</span>
            </div>
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-amber-600" />
              <span>Doorstep Delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
