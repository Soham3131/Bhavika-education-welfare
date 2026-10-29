"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/store/cart-context";
import {
  ShoppingCart,
  Search,
  Filter,
  ArrowUpDown,
  Heart,
  ChevronRight,
} from "lucide-react";

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
  originalPriceRupees?: number;
  availableStock: number;
  images: string[];
  badge?: string;
  rating?: number;
  reviewsCount?: number;
  description?: string;
}

const FALLBACK_PRODUCTS: Product[] = [
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
    badge: "Bestseller",
    description: "18K Gold traditional mangalsutra with diamond accents.",
  },
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
    badge: "10% OFF",
    description: "5kg Royal aged long grain aromatic basmati rice for festive meals.",
  },
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
    badge: "Popular",
    description: "Banarasi silk blend festive saree with rich zari border and pallu.",
  },
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
    badge: "5% OFF",
    description: "Active noise cancelling bluetooth over-ear headphones with 30-hour battery life.",
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
];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("featured");
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [addedSku, setAddedSku] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/store/categories").then((r) => r.json()).catch(() => ({ categories: [] })),
      fetch("/api/store/products").then((r) => r.json()).catch(() => ({ products: [] })),
    ])
      .then(([catData, prodData]) => {
        if (catData.categories && catData.categories.length > 0) {
          setCategories(catData.categories);
        }
        if (prodData.products && prodData.products.length > 0) {
          const merged = prodData.products.map((p: Product, idx: number) => {
            const fallback = FALLBACK_PRODUCTS[idx % FALLBACK_PRODUCTS.length];
            return {
              ...p,
              images: p.images && p.images.length > 0 ? p.images : fallback.images,
              badge: p.badge || fallback.badge,
              rating: p.rating || fallback.rating,
              reviewsCount: p.reviewsCount || fallback.reviewsCount,
              originalPriceRupees: fallback.originalPriceRupees,
            };
          });
          setProducts(merged);
        }
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
      image: product.images[0] || "/images/prod-gold-mangalsutra.png",
    });
    setAddedSku(product.sku);
    setTimeout(() => setAddedSku(null), 1500);
  };

  const toggleWishlist = (sku: string) => {
    setWishlist((prev) => ({ ...prev, [sku]: !prev[sku] }));
  };

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      const matchesCategory =
        !selectedCategory || p.categorySlug === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.categoryName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    if (sortBy === "price-low") {
      list = [...list].sort((a, b) => a.priceRupees - b.priceRupees);
    } else if (sortBy === "price-high") {
      list = [...list].sort((a, b) => b.priceRupees - a.priceRupees);
    }
    return list;
  }, [products, selectedCategory, searchQuery, sortBy]);

  return (
    <div className="space-y-8 font-sans">
      {/* Page Breadcrumbs & Header */}
      <div className="space-y-2 border-b border-[#EBDCB9]/70 pb-6">
        <div className="flex items-center space-x-1.5 text-xs text-gray-500">
          <Link href="/store" className="hover:text-[#6B0B1A]">
            Store
          </Link>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="font-semibold text-[#6B0B1A]">Catalogue</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#6B0B1A] tracking-tight">
              Product Catalogue
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Fine Jewellery, Daily Essentials & Lifestyle with Verified Bhavika Coupon Redemption
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-medium text-[#6B0B1A] bg-[#FAF7F2] px-3 py-1.5 rounded-md border border-[#EBDCB9] shrink-0">
            <span>Direct Community Marketplace</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#EBDCB9] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, SKU or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#FAF7F2] border border-[#EBDCB9] rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#6B0B1A] focus:border-[#6B0B1A]"
          />
        </div>

        {/* Filter and Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <div className="flex items-center space-x-1.5 bg-[#FAF7F2] border border-[#EBDCB9] rounded-lg px-3 py-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-gray-800 font-medium focus:outline-none cursor-pointer"
            >
              <option value="">All Categories</option>
              <option value="gold-jewellery">Gold Jewellery</option>
              <option value="silver-jewellery">Silver Jewellery</option>
              <option value="grocery">Grocery & Daily Needs</option>
              <option value="fashion">Fashion & Lifestyle</option>
              <option value="electronics">Electronics</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center space-x-1.5 bg-[#FAF7F2] border border-[#EBDCB9] rounded-lg px-3 py-2 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-gray-800 font-medium focus:outline-none cursor-pointer"
            >
              <option value="featured">Featured First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-white border border-[#EBDCB9] animate-pulse rounded-xl"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-[#EBDCB9] shadow-xs space-y-3">
          <p className="font-serif text-lg font-bold text-gray-800">
            No Products Found
          </p>
          <p className="text-xs text-gray-500">
            No items matched your current filter criteria. Try resetting search or selecting all categories.
          </p>
          <button
            onClick={() => {
              setSelectedCategory("");
              setSearchQuery("");
            }}
            className="text-xs font-semibold text-[#6B0B1A] hover:underline"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => {
            const isWishlisted = !!wishlist[product.sku];
            return (
              <div
                key={product.id || product.sku}
                className="bg-white rounded-xl border border-[#EBDCB9] shadow-2xs hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between group"
              >
                <div className="p-4 space-y-3">
                  {/* Thumbnail Container */}
                  <div className="relative h-44 w-full bg-[#FAF7F2] rounded-lg overflow-hidden flex items-center justify-center p-3">
                    {product.badge && (
                      <span className="absolute top-2.5 left-2.5 z-10 bg-[#A91B2E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider shadow-2xs">
                        {product.badge}
                      </span>
                    )}

                    <button
                      onClick={() => toggleWishlist(product.sku)}
                      className={`absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full bg-white/90 border transition ${
                        isWishlisted
                          ? "border-[#A91B2E] text-[#A91B2E]"
                          : "border-gray-200 text-gray-400 hover:text-[#A91B2E]"
                      }`}
                      aria-label="Wishlist"
                    >
                      <Heart className="w-3.5 h-3.5 fill-current" />
                    </button>

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
                    <div>
                      <div className="text-base sm:text-lg font-bold text-[#6B0B1A]">
                        ₹{product.priceRupees.toLocaleString("en-IN")}
                      </div>
                      {product.originalPriceRupees && product.originalPriceRupees > product.priceRupees && (
                        <div className="text-[10px] text-gray-400 line-through">
                          ₹{product.originalPriceRupees.toLocaleString("en-IN")}
                        </div>
                      )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
