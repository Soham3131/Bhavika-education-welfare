"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ShoppingCart, ArrowLeft, ChevronRight } from "lucide-react";
import { useCart } from "@/lib/store/cart-context";

interface Product {
  id: string;
  sku: string;
  title: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  priceRupees: number;
  originalPriceRupees?: number;
  availableStock: number;
  images: string[];
  description?: string;
  rating?: number;
}

const CATEGORY_FALLBACKS: Record<string, Product[]> = {
  "gold-jewellery": [
    {
      id: "6adf9f0ceac7435409988963",
      sku: "JMD-GOLD-MANGAL-01",
      title: "Gold Mangalsutra",
      slug: "gold-mangalsutra",
      categoryName: "Gold Jewellery",
      categorySlug: "gold-jewellery",
      priceRupees: 48999,
      originalPriceRupees: 52999,
      availableStock: 5,
      images: ["/images/prod-gold-mangalsutra-v2.png"],
      description: "18K Gold traditional mangalsutra with diamond accents.",
    },
    {
      id: "6adf9f0ceac7435409988964",
      sku: "JMD-GOLD-BRAC-06",
      title: "Gold Bracelet",
      slug: "gold-bracelet",
      categoryName: "Gold Jewellery",
      categorySlug: "gold-jewellery",
      priceRupees: 32569,
      originalPriceRupees: 34999,
      availableStock: 4,
      images: ["/images/prod-gold-bracelet-v2.png"],
      description: "22K lightweight daily wear floral design gold bracelet.",
    },
  ],
  "silver-jewellery": [
    {
      id: "6adf9f0ceac7435409988965",
      sku: "JMD-SLVR-EAR-02",
      title: "Silver Earrings",
      slug: "silver-earrings",
      categoryName: "Silver Jewellery",
      categorySlug: "silver-jewellery",
      priceRupees: 2999,
      originalPriceRupees: 3499,
      availableStock: 12,
      images: ["/images/prod-silver-earrings-v2.png"],
      description: "Pure 925 Sterling Silver handcrafted jhumka earrings with freshwater pearls.",
    },
  ],
  grocery: [
    {
      id: "6adf9f0ceac7435409988966",
      sku: "JMD-GROC-RICE-03",
      title: "Premium Basmati Rice",
      slug: "premium-basmati-rice",
      categoryName: "Grocery",
      categorySlug: "grocery",
      priceRupees: 549,
      originalPriceRupees: 600,
      availableStock: 50,
      images: ["/images/prod-basmati-rice-v2.png"],
      description: "5kg Royal aged long grain aromatic basmati rice for festive meals.",
    },
  ],
  fashion: [
    {
      id: "6adf9f0ceac7435409988967",
      sku: "JMD-FASH-SAREE-04",
      title: "Women's Ethnic Saree",
      slug: "womens-ethnic-saree",
      categoryName: "Fashion",
      categorySlug: "fashion",
      priceRupees: 1899,
      originalPriceRupees: 2299,
      availableStock: 15,
      images: ["/images/prod-ethnic-saree-v2.png"],
      description: "Banarasi silk blend festive saree with rich zari border and pallu.",
    },
  ],
  electronics: [
    {
      id: "6adf9f0ceac7435409988968",
      sku: "JMD-ELEC-HEAD-05",
      title: "Wireless Headphones",
      slug: "wireless-headphones",
      categoryName: "Electronics",
      categorySlug: "electronics",
      priceRupees: 2999,
      originalPriceRupees: 3499,
      availableStock: 20,
      images: ["/images/prod-headphones-v2.png"],
      description: "Active noise cancelling bluetooth over-ear headphones with 30-hour battery life.",
    },
  ],
};

export default function CategoryBrowsePage() {
  const params = useParams();
  const slug = (params.slug as string) || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [addedSku, setAddedSku] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/store/products?category=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.products && data.products.length > 0) {
          setProducts(data.products);
        } else if (CATEGORY_FALLBACKS[slug]) {
          setProducts(CATEGORY_FALLBACKS[slug]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (CATEGORY_FALLBACKS[slug]) {
          setProducts(CATEGORY_FALLBACKS[slug]);
        }
        setLoading(false);
      });
  }, [slug]);

  const handleAddToCart = (product: Product) => {
    addItem({
      productId: product.id,
      sku: product.sku,
      title: product.title,
      slug: product.slug,
      priceRupees: product.priceRupees,
      image: product.images[0] || "/images/prod-gold-mangalsutra.png",
    });
    setAddedSku(product.sku);
    setTimeout(() => setAddedSku(null), 1500);
  };

  const formattedTitle =
    products[0]?.categoryName ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-8 font-sans">
      {/* Header and Breadcrumbs */}
      <div className="space-y-2 border-b border-[#EBDCB9]/70 pb-6">
        <div className="flex items-center space-x-1.5 text-xs text-gray-500">
          <Link href="/store" className="hover:text-[#6B0B1A]">
            Store
          </Link>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <Link href="/store/products" className="hover:text-[#6B0B1A]">
            Catalogue
          </Link>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="font-semibold text-[#6B0B1A]">{formattedTitle}</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#6B0B1A] tracking-tight">
              {formattedTitle}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Browse authentic certified items in {formattedTitle}
            </p>
          </div>

          <Link
            href="/store/products"
            className="inline-flex items-center space-x-1 text-xs font-semibold text-[#6B0B1A] hover:text-[#831023]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Products</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-white border border-[#EBDCB9] animate-pulse rounded-xl"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-[#EBDCB9] shadow-xs space-y-3">
          <p className="font-serif text-lg font-bold text-gray-800">
            No Products in {formattedTitle}
          </p>
          <p className="text-xs text-gray-500">
            Items for this category are being updated. Check back soon or explore our other collections.
          </p>
          <Link
            href="/store/products"
            className="inline-block mt-2 text-xs font-semibold bg-[#6B0B1A] text-white px-4 py-2 rounded-sm hover:bg-[#831023] transition"
          >
            Browse All Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <div
              key={product.id || product.sku}
              className="bg-white rounded-xl border border-[#EBDCB9] shadow-2xs hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between group"
            >
              <div className="p-4 space-y-3">
                <div className="relative h-44 w-full bg-[#FAF7F2] rounded-lg overflow-hidden flex items-center justify-center p-3">
                  <Image
                    src={product.images[0] || "/images/prod-gold-mangalsutra.png"}
                    alt={product.title}
                    fill
                    sizes="(max-width: 640px) 45vw, 25vw"
                    className="object-contain p-2 group-hover:scale-105 transition duration-300"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[#6B0B1A] bg-[#6B0B1A]/5 px-2 py-0.5 rounded-sm uppercase tracking-wide">
                    {product.categoryName}
                  </span>
                  <h3 className="font-semibold text-gray-900 text-sm mt-1.5 line-clamp-1 group-hover:text-[#6B0B1A] transition">
                    <Link href={`/store/products/${product.slug}`}>
                      {product.title}
                    </Link>
                  </h3>
                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                    SKU: {product.sku}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                    {product.description || ""}
                  </p>
                </div>
              </div>

              <div className="p-4 pt-0 border-t border-[#EBDCB9]/40 flex flex-col space-y-2 mt-2">
                <div className="flex items-baseline justify-between pt-2">
                  <div className="text-base sm:text-lg font-bold text-[#6B0B1A]">
                    ₹{product.priceRupees.toLocaleString("en-IN")}
                  </div>
                </div>

                {product.availableStock > 0 ? (
                  <button
                    onClick={() => handleAddToCart(product)}
                    className={`w-full py-2.5 rounded-sm text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                      addedSku === product.sku
                        ? "bg-emerald-700 text-white"
                        : "bg-[#6B0B1A] hover:bg-[#831023] text-white shadow-xs"
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{addedSku === product.sku ? "Added!" : "Add to Cart"}</span>
                  </button>
                ) : (
                  <div className="text-center text-xs font-medium text-rose-600 bg-rose-50 py-2 rounded">
                    Out of stock
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
