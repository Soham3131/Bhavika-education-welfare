"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/store/cart-context";
import {
  ArrowRight,
  ShoppingCart,
  Heart,
  ShieldCheck,
  Truck,
  Headphones,
  Award,
  Sparkles,
  Percent,
  Tag,
  Gift,
} from "lucide-react";

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
  attributes?: Record<string, unknown>;
  description?: string;
}

// Curated authentic trending catalog matching the design reference
const CURATED_TRENDING: Product[] = [
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

export default function StoreHomePage() {
  const [products, setProducts] = useState<Product[]>(CURATED_TRENDING);
  const { addItem } = useCart();
  const [addedSku, setAddedSku] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/store/products")
      .then((r) => r.json())
      .then((prodData) => {
        if (prodData.products && prodData.products.length > 0) {
          const merged = prodData.products.map((p: Product) => {
            const fallback = CURATED_TRENDING.find((f) => f.sku === p.sku);
            return {
              ...p,
              images: p.images && p.images.length > 0 ? p.images : (fallback?.images ?? []),
              badge: p.badge ?? fallback?.badge,
              originalPriceRupees: p.originalPriceRupees ?? fallback?.originalPriceRupees,
            };
          });
          setProducts(merged);
        }
      })
      .catch(() => {});
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

  // 9 Category Shortcuts with authentic images from the marketplace reference
  const categoryShortcuts = [
    { title: "Gold Jewellery", image: "/images/cat-gold-v2.png", href: "/store/categories/gold-jewellery" },
    { title: "Silver Jewellery", image: "/images/cat-silver-v2.png", href: "/store/categories/silver-jewellery" },
    { title: "Grocery & Daily Needs", image: "/images/cat-grocery-v2.png", href: "/store/categories/grocery" },
    { title: "Fashion & Lifestyle", image: "/images/cat-fashion-v2.png", href: "/store/categories/fashion" },
    { title: "Electronics", image: "/images/cat-electronics-v2.png", href: "/store/categories/electronics" },
    { title: "Mobile Recharge & Bill Payments", image: "/images/cat-recharge-v2.png", href: "/store/recharge" },
    { title: "EMI Products", image: "/images/cat-emi-v2.png", href: "/store/account/emi" },
    { title: "PIN & Vouchers", image: "/images/cat-pins-v2.png", href: "/store/account/pins" },
    { title: "Special Offers", image: "/images/cat-offers-v2.png", href: "/store/products?offers=true" },
  ];

  return (
    <div className="space-y-12 sm:space-y-16">
      {/* =========================================================================
          SECTION D: HERO BANNER (Wide editorial hero with Indian bridal jewellery)
         ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#F7EFE4] via-[#F4E9D8] to-[#E9D9C3] border border-[#EBDCB9] shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
          {/* Left Column: Heading, Subtitle, CTA, Trust strip */}
          <div className="lg:col-span-7 p-6 sm:p-10 lg:p-14 space-y-6">
            <div className="space-y-3">
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#6B0B1A] leading-[1.15]">
                Divine Elegance <br />
                <span className="text-[#3B060D]">For Every Occasion</span>
              </h1>
              <p className="text-gray-700 text-sm sm:text-base lg:text-lg font-medium leading-relaxed">
                Beautiful Jewellery <span className="text-[#C5A059]">•</span> Trusted Products <span className="text-[#C5A059]">•</span> Better Futures Together
              </p>
            </div>

            {/* CTA Button */}
            <div className="pt-1">
              <Link
                href="/store/categories/gold-jewellery"
                className="inline-flex items-center space-x-2.5 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold px-6 py-3.5 rounded-md shadow-md transition transform active:scale-98 text-sm"
              >
                <span>Shop Jewellery</span>
                <ArrowRight className="w-4 h-4 text-amber-200" />
              </Link>
            </div>

            {/* 4 Trust Badges Strip inside Hero */}
            <div className="pt-4 border-t border-[#D9C79E]/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-gray-700">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-[#C5A059] shrink-0" />
                <span>Authentic Gold & Silver</span>
              </div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
                <span>Secure Payments</span>
              </div>
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-[#C5A059] shrink-0" />
                <span>Pan India Delivery</span>
              </div>
              <div className="flex items-center space-x-2">
                <Headphones className="w-4 h-4 text-[#C5A059] shrink-0" />
                <span>Customer Support (Mon–Sat)</span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Resolution Bridal Jewellery Portrait */}
          <div className="lg:col-span-5 relative h-72 sm:h-96 lg:h-[420px] w-full overflow-hidden">
            <Image
              src="/images/hero-bridal-jewellery-v2.jpg"
              alt="Indian Bride in Royal Gold Jewellery — Jai Maa Durga"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 42vw"
              className="object-cover object-center"
            />
            {/* Subtle elegant gradient overlay for soft edge blending */}
            <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#F7EFE4]/80 via-transparent to-transparent lg:from-[#F4E9D8] lg:to-transparent pointer-events-none" />

            {/* Devanagari Auspicious Calligraphy Tag */}
            <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-xs text-amber-200 px-3 py-1.5 rounded-sm border border-amber-300/30 text-right leading-tight">
              <div className="font-hindi text-base sm:text-lg font-bold tracking-widest text-[#F9E2A8]">
                शक्ति
              </div>
              <div className="font-hindi text-xs text-amber-100">
                सुन्दरता • समृद्धि
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION E: CIRCULAR CATEGORY SHORTCUTS (9 Consistent Circles)
         ========================================================================= */}
      <section className="w-full">
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3 sm:gap-4 text-center">
          {categoryShortcuts.map((cat) => (
            <Link
              key={cat.title}
              href={cat.href}
              className="group flex flex-col items-center p-2 rounded-xl hover:bg-white hover:shadow-xs transition duration-200"
            >
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white border border-[#EBDCB9] p-2 flex items-center justify-center shadow-xs group-hover:scale-105 group-hover:border-[#C5A059] transition duration-200">
                <Image
                  src={cat.image}
                  alt={cat.title}
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="mt-2 text-[11px] sm:text-xs font-semibold text-gray-800 group-hover:text-[#6B0B1A] transition leading-tight line-clamp-2">
                {cat.title}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* =========================================================================
          SECTION F: THREE PROMOTIONAL FEATURE BANNERS
         ========================================================================= */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Banner 1: Festive Jewellery Collection (Deep Maroon) */}
        <div className="relative overflow-hidden rounded-xl bg-[#6B0B1A] text-white p-6 sm:p-7 flex flex-col justify-between shadow-sm min-h-[220px]">
          <div className="relative z-10 max-w-[65%] space-y-2">
            <h3 className="font-serif text-lg sm:text-xl font-bold leading-tight">
              Festive Jewellery Collection
            </h3>
            <p className="text-white/80 text-xs leading-relaxed">
              Timeless Designs for Your Special Moments
            </p>
            <div className="pt-2">
              <Link
                href="/store/categories/gold-jewellery"
                className="inline-flex items-center space-x-1.5 bg-[#FAF7F2] hover:bg-white text-[#6B0B1A] font-semibold text-xs px-3.5 py-1.5 rounded-sm transition shadow-xs"
              >
                <span>Explore Collection</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-2/5 overflow-hidden">
            <Image
              src="/images/promo-festive-jewellery.jpg"
              alt="Festive Gold Jewellery"
              fill
              sizes="(max-width: 768px) 40vw, 15vw"
              className="object-cover object-center"
            />
          </div>
        </div>

        {/* Banner 2: Everyday Grocery Essentials (Warm Peach/Beige) */}
        <div className="relative overflow-hidden rounded-xl bg-[#F7EBE1] text-[#3B060D] border border-[#EBDCB9] p-6 sm:p-7 flex flex-col justify-between shadow-sm min-h-[220px]">
          <div className="relative z-10 max-w-[65%] space-y-2">
            <h3 className="font-serif text-lg sm:text-xl font-bold leading-tight text-[#6B0B1A]">
              Everyday Grocery Essentials
            </h3>
            <p className="text-gray-700 text-xs leading-relaxed">
              Quality Products for a Better Tomorrow
            </p>
            <div className="pt-2">
              <Link
                href="/store/categories/grocery"
                className="inline-flex items-center space-x-1.5 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold text-xs px-3.5 py-1.5 rounded-sm transition shadow-xs"
              >
                <span>Shop Grocery</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-2/5 overflow-hidden">
            <Image
              src="/images/promo-grocery-essentials.jpg"
              alt="Everyday Grocery Essentials"
              fill
              sizes="(max-width: 768px) 40vw, 15vw"
              className="object-cover object-center"
            />
          </div>
        </div>

        {/* Banner 3: Mobile Recharge & Bill Payments (Soft Blue/Lilac) */}
        <div className="relative overflow-hidden rounded-xl bg-[#EAF0F9] text-[#1F2937] border border-[#D5E1F2] p-6 sm:p-7 flex flex-col justify-between shadow-sm min-h-[220px]">
          <div className="relative z-10 max-w-[65%] space-y-2">
            <h3 className="font-serif text-lg sm:text-xl font-bold leading-tight text-[#1E3A8A]">
              Mobile Recharge & Bill Payments
            </h3>
            <p className="text-gray-600 text-xs leading-relaxed">
              Fast, Secure & Rewarding
            </p>
            <div className="pt-2">
              <Link
                href="/store/recharge"
                className="inline-flex items-center space-x-1.5 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold text-xs px-3.5 py-1.5 rounded-sm transition shadow-xs"
              >
                <span>Recharge Now</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-2/5 overflow-hidden flex items-center justify-center p-2">
            <Image
              src="/images/promo-recharge-phone-v2.png"
              alt="Mobile Recharge on Jai Maa Durga"
              fill
              sizes="(max-width: 768px) 40vw, 15vw"
              className="object-contain object-right-bottom"
            />
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION G: TRENDING PRODUCTS (Consistent Product Cards with Floral Divider)
         ========================================================================= */}
      <section className="space-y-6">
        {/* Editorial Heading with Floral Divider */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EBDCB9]/70 pb-3">
          <div className="flex items-center space-x-3">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A]">
              Trending Products
            </h2>
            <div className="hidden sm:flex items-center text-[#C5A059] text-sm">
              <span>✦</span>
              <span className="w-8 h-[1px] bg-[#C5A059] mx-1.5" />
              <span>✦</span>
            </div>
          </div>

          <Link
            href="/store/products"
            className="text-xs font-bold text-[#6B0B1A] hover:text-[#831023] flex items-center space-x-1 uppercase tracking-wider group"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5 transition transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {products.slice(0, 6).map((product) => {
            const isWishlisted = !!wishlist[product.sku];
            return (
              <div
                key={product.id || product.sku}
                className="bg-white rounded-xl border border-[#EBDCB9]/80 shadow-2xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group"
              >
                <div className="p-3 space-y-2">
                  {/* Image Container with Badges */}
                  <div className="relative h-32 sm:h-36 w-full bg-[#FAF7F2] rounded-lg overflow-hidden flex items-center justify-center p-2">
                    {/* Badge */}
                    {product.badge && (
                      <span className="absolute top-2 left-2 z-10 bg-[#A91B2E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider shadow-2xs">
                        {product.badge}
                      </span>
                    )}

                    {/* Wishlist Button */}
                    <button
                      onClick={() => toggleWishlist(product.sku)}
                      className={`absolute top-2 right-2 z-10 p-1 rounded-full bg-white/90 border transition ${
                        isWishlisted
                          ? "border-[#A91B2E] text-[#A91B2E]"
                          : "border-gray-200 text-gray-400 hover:text-[#A91B2E]"
                      }`}
                      aria-label="Save to Wishlist"
                    >
                      <Heart className="w-3 h-3 fill-current" />
                    </button>

                    <Image
                      src={product.images[0] || "/images/prod-gold-mangalsutra.png"}
                      alt={product.title}
                      fill
                      sizes="(max-width: 640px) 45vw, 16vw"
                      className="object-contain p-2 group-hover:scale-105 transition duration-300"
                    />
                  </div>

                  {/* Title & Specs */}
                  <div>
                    <h3 className="font-semibold text-gray-900 text-xs sm:text-sm line-clamp-1 group-hover:text-[#6B0B1A] transition">
                      <Link href={`/store/products/${product.slug}`}>
                        {product.title}
                      </Link>
                    </h3>
                    <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                      {product.description || ""}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="pt-1">
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-sm sm:text-base font-bold text-[#6B0B1A]">
                        ₹{product.priceRupees.toLocaleString("en-IN")}
                      </span>
                      {product.originalPriceRupees && product.originalPriceRupees > product.priceRupees && (
                        <span className="text-[10px] text-gray-400 line-through">
                          ₹{product.originalPriceRupees.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Add to Cart CTA (Full width inside card) */}
                <div className="p-3 pt-0">
                  <button
                    onClick={() => handleAddToCart(product)}
                    className={`w-full py-2 rounded-sm text-xs font-bold transition flex items-center justify-center space-x-1 ${
                      addedSku === product.sku
                        ? "bg-emerald-700 text-white"
                        : "bg-[#6B0B1A] hover:bg-[#831023] text-white shadow-xs"
                    }`}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    <span>{addedSku === product.sku ? "Added!" : "Add to Cart"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          SECTION H: JMD MEMBERSHIP BENEFITS (Wide family-oriented banner)
         ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-[#FAF4EA] border border-[#EBDCB9] p-6 sm:p-10 lg:p-12 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Benefits & Action */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#6B0B1A]">
                JMD Membership Benefits
              </h2>
              <p className="text-gray-700 text-sm sm:text-base font-medium">
                Shop More <span className="text-[#C5A059]">•</span> Save More <span className="text-[#C5A059]">•</span> Grow Together
              </p>
            </div>

            {/* 5 Membership Perks */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div className="text-center p-3 rounded-xl bg-white/70 border border-[#EBDCB9]/60">
                <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1.5">
                  <Percent className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-gray-800 leading-tight">
                  Exclusive Discounts
                </div>
              </div>

              <div className="text-center p-3 rounded-xl bg-white/70 border border-[#EBDCB9]/60">
                <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1.5">
                  <Tag className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-gray-800 leading-tight">
                  Special Offers
                </div>
              </div>

              <div className="text-center p-3 rounded-xl bg-white/70 border border-[#EBDCB9]/60">
                <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1.5">
                  <Gift className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-gray-800 leading-tight">
                  Member-Only Deals
                </div>
              </div>

              <div className="text-center p-3 rounded-xl bg-white/70 border border-[#EBDCB9]/60">
                <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-gray-800 leading-tight">
                  Loyalty Rewards
                </div>
              </div>

              <div className="text-center p-3 rounded-xl bg-white/70 border border-[#EBDCB9]/60 col-span-2 sm:col-span-1">
                <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1.5">
                  <Award className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-gray-800 leading-tight">
                  Early Access
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/store/account/referrals"
                className="inline-flex items-center space-x-2 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold text-xs px-5 py-2.5 rounded-sm shadow-xs transition"
              >
                <span>Learn More</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-200" />
              </Link>
            </div>
          </div>

          {/* Right Column: Indian Family Celebrating with Gift Box */}
          <div className="lg:col-span-5 relative h-56 sm:h-72 w-full rounded-xl overflow-hidden shadow-xs border border-[#EBDCB9]">
            <Image
              src="/images/membership-family-v2.png"
              alt="Indian Family Celebrating with Jai Maa Durga Gift Box"
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover object-center"
            />
            {/* Hindi watermark */}
            <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-xs text-amber-100 px-3 py-1 rounded text-right font-hindi text-xs sm:text-sm font-semibold">
              हर खरीदारी एक बेहतर कल के लिए
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION I: ADDITIONAL CATEGORY SHOPPING SECTION (Shop by Category)
         ========================================================================= */}
      <section className="space-y-6">
        <div className="text-center space-y-1">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A]">
            Shop by Category
          </h2>
          <div className="flex items-center justify-center text-[#C5A059] text-xs">
            <span>✦</span>
            <span className="w-12 h-[1px] bg-[#C5A059] mx-2" />
            <span>✦</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { name: "Gold Jewellery", image: "/images/shopcat-gold-v2.png", href: "/store/categories/gold-jewellery" },
            { name: "Silver Jewellery", image: "/images/shopcat-silver-v2.png", href: "/store/categories/silver-jewellery" },
            { name: "Grocery & Daily Needs", image: "/images/shopcat-grocery-v2.png", href: "/store/categories/grocery" },
            { name: "Fashion & Lifestyle", image: "/images/shopcat-fashion-v2.png", href: "/store/categories/fashion" },
            { name: "Electronics", image: "/images/shopcat-electronics-v2.png", href: "/store/categories/electronics" },
            { name: "Recharge & Bills", image: "/images/shopcat-recharge-v2.png", href: "/store/recharge" },
          ].map((cat) => (
            <Link
              key={cat.name}
              href={cat.href}
              className="bg-white rounded-xl border border-[#EBDCB9] p-4 text-center hover:border-[#C5A059] hover:shadow-sm transition group flex flex-col items-center justify-between min-h-[140px]"
            >
              <div className="relative w-16 h-14 flex items-center justify-center">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  width={64}
                  height={56}
                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-200"
                />
              </div>
              <div className="mt-2">
                <div className="text-xs font-bold text-gray-900 group-hover:text-[#6B0B1A] transition leading-tight">
                  {cat.name}
                </div>
                <div className="text-[10px] text-[#A91B2E] font-semibold mt-1 flex items-center justify-center space-x-0.5">
                  <span>View Products</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* =========================================================================
          SECTION J: TRUST & SERVICE BENEFITS STRIP ("Why Shop with Jai Maa Durga?")
         ========================================================================= */}
      <section className="space-y-6 pt-4">
        <div className="text-center space-y-1">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#6B0B1A]">
            Why Shop with Jai Maa Durga?
          </h2>
          <p className="text-xs text-gray-500">
            Committed to purity, transparency and community empowerment
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center">
          <div className="space-y-2 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#FAF4EA] border border-[#EBDCB9] flex items-center justify-center text-[#6B0B1A] shadow-2xs">
              <Award className="w-6 h-6 text-[#C5A059]" />
            </div>
            <h4 className="font-bold text-xs text-gray-900">100% Genuine Products</h4>
            <p className="text-[11px] text-gray-500 max-w-[160px]">
              Fine gold, pure silver and verified brand partners.
            </p>
          </div>

          <div className="space-y-2 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#FAF4EA] border border-[#EBDCB9] flex items-center justify-center text-[#6B0B1A] shadow-2xs">
              <ShieldCheck className="w-6 h-6 text-[#C5A059]" />
            </div>
            <h4 className="font-bold text-xs text-gray-900">Secure Payment Gateway</h4>
            <p className="text-[11px] text-gray-500 max-w-[160px]">
              256-bit encrypted Razorpay checkouts and Bhavika coupon redemption.
            </p>
          </div>

          <div className="space-y-2 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#FAF4EA] border border-[#EBDCB9] flex items-center justify-center text-[#6B0B1A] shadow-2xs">
              <Truck className="w-6 h-6 text-[#C5A059]" />
            </div>
            <h4 className="font-bold text-xs text-gray-900">Fast & Reliable Pan India</h4>
            <p className="text-[11px] text-gray-500 max-w-[160px]">
              Standard delivery across India with order tracking via Member Portal.
            </p>
          </div>

          <div className="space-y-2 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#FAF4EA] border border-[#EBDCB9] flex items-center justify-center text-[#6B0B1A] shadow-2xs">
              <Headphones className="w-6 h-6 text-[#C5A059]" />
            </div>
            <h4 className="font-bold text-xs text-gray-900">Dedicated Customer Support</h4>
            <p className="text-[11px] text-gray-500 max-w-[160px]">
              Support desk Mon–Sat (10:00 AM – 6:00 PM IST) for orders, coupons and product queries.
            </p>
          </div>

          <div className="space-y-2 flex flex-col items-center col-span-2 sm:col-span-1">
            <div className="w-14 h-14 rounded-full bg-[#FAF4EA] border border-[#EBDCB9] flex items-center justify-center text-[#6B0B1A] shadow-2xs">
              <Sparkles className="w-6 h-6 text-[#C5A059]" />
            </div>
            <h4 className="font-bold text-xs text-gray-900">Better Futures: Social Impact</h4>
            <p className="text-[11px] text-gray-500 max-w-[160px]">
              Supporting education and grassroots welfare with every purchase.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION K: SOCIAL IMPACT BANNER ("Shopping with a Purpose")
         ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-[#6B0B1A] text-white p-6 sm:p-10 shadow-md border border-[#831023]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Maa Durga Divine Artwork */}
          <div className="lg:col-span-3 relative h-40 sm:h-48 w-full flex items-center justify-center">
            <div className="relative w-44 h-40 rounded-xl overflow-hidden border border-amber-400/40 shadow-inner">
              <Image
                src="/images/social-impact-durga-v2.png"
                alt="Maa Durga Divine Artwork — Jai Maa Durga"
                fill
                sizes="180px"
                className="object-contain"
              />
            </div>
          </div>

          {/* Middle: Mission Statement & CTA */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-amber-200">
              Shopping with a Purpose
            </h3>
            <p className="text-white/90 text-xs sm:text-sm leading-relaxed">
              Every purchase at Jai Maa Durga supports education, welfare and a brighter future for our community.
            </p>
            <div className="pt-2">
              <Link
                href="/about"
                className="inline-flex items-center space-x-2 bg-[#FAF7F2] hover:bg-white text-[#6B0B1A] font-semibold text-xs px-4 py-2 rounded-sm shadow-xs transition"
              >
                <span>Know Our Mission</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Right: 4 Impact Pillars */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3 text-center text-xs">
            <div className="p-3 bg-white/10 backdrop-blur-xs rounded-xl border border-white/10 space-y-1">
              <div className="text-amber-300 font-bold text-sm">🎓</div>
              <div className="font-medium text-white/95">Education Support</div>
            </div>
            <div className="p-3 bg-white/10 backdrop-blur-xs rounded-xl border border-white/10 space-y-1">
              <div className="text-amber-300 font-bold text-sm">🌸</div>
              <div className="font-medium text-white/95">Women Empowerment</div>
            </div>
            <div className="p-3 bg-white/10 backdrop-blur-xs rounded-xl border border-white/10 space-y-1">
              <div className="text-amber-300 font-bold text-sm">🤝</div>
              <div className="font-medium text-white/95">Community Welfare</div>
            </div>
            <div className="p-3 bg-white/10 backdrop-blur-xs rounded-xl border border-white/10 space-y-1">
              <div className="text-amber-300 font-bold text-sm">☀️</div>
              <div className="font-medium text-white/95">A Better Tomorrow</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
