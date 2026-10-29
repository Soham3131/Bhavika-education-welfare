"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Heart,
  ChevronRight,
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
  originalPriceRupees?: number;
  availableStock: number;
  rating?: number;
  reviewsCount?: number;
  attributes?: Record<string, unknown>;
}

const FALLBACK_DETAIL: Record<string, ProductDetail> = {
  "gold-mangalsutra": {
    id: "6adf9f0ceac7435409988963",
    sku: "JMD-GOLD-MANGAL-01",
    title: "Gold Mangalsutra",
    slug: "gold-mangalsutra",
    category: { name: "Gold Jewellery", slug: "gold-jewellery", type: "JEWELLERY_GOLD" },
    priceRupees: 48999,
    originalPriceRupees: 52999,
    availableStock: 5,
    images: ["/images/prod-gold-mangalsutra-v2.png"],
    description:
      "Crafted with timeless elegance, this 18K Gold Mangalsutra embodies sacred Indian tradition paired with modern sophistication. Features certified auspicious black beads and diamond accents. Eligible for 100% face-value Bhavika coupon redemption at checkout.",
    attributes: {
      metalType: "GOLD",
      purity: "18K (750)",
      grossWeightGrams: 6.45,
      netWeightGrams: 5.8,
      makingChargesPaise: 450000,
      gstPercent: 3,
      hallmarkCenter: "Assayed & Verified",
      pricingStatus: "APPROVED_FINAL_PRICE",
    },
  },
  "silver-earrings": {
    id: "6adf9f0ceac7435409988965",
    sku: "JMD-SLVR-EAR-02",
    title: "Silver Earrings",
    slug: "silver-earrings",
    category: { name: "Silver Jewellery", slug: "silver-jewellery", type: "JEWELLERY_SILVER" },
    priceRupees: 2999,
    originalPriceRupees: 3499,
    availableStock: 12,
    images: ["/images/prod-silver-earrings-v2.png"],
    rating: 4.8,
    reviewsCount: 89,
    description:
      "Handcrafted pure 925 sterling silver jhumka earrings adorned with natural freshwater pearls and antique floral filigree. Hypoallergenic, skin-friendly, and finished with a protective anti-tarnish rhodium polish.",
    attributes: {
      metalType: "SILVER",
      purity: "925 Sterling Silver",
      grossWeightGrams: 18.2,
      netWeightGrams: 16.5,
      makingChargesPaise: 60000,
      gstPercent: 3,
      pricingStatus: "APPROVED_FINAL_PRICE",
    },
  },
  "premium-basmati-rice": {
    id: "6adf9f0ceac7435409988966",
    sku: "JMD-GROC-RICE-03",
    title: "Premium Basmati Rice",
    slug: "premium-basmati-rice",
    category: { name: "Grocery", slug: "grocery", type: "GROCERY" },
    priceRupees: 549,
    originalPriceRupees: 600,
    availableStock: 50,
    images: ["/images/prod-basmati-rice-v2.png"],
    rating: 4.7,
    reviewsCount: 210,
    description:
      "5kg Royal aged long grain aromatic basmati rice. Sourced directly from Himalayan foothills, naturally aged for 2 years to ensure exceptional aroma and fluffiness upon cooking.",
  },
  "womens-ethnic-saree": {
    id: "6adf9f0ceac7435409988967",
    sku: "JMD-FASH-SAREE-04",
    title: "Women's Ethnic Saree",
    slug: "womens-ethnic-saree",
    category: { name: "Fashion", slug: "fashion", type: "FASHION" },
    priceRupees: 1899,
    originalPriceRupees: 2299,
    availableStock: 15,
    images: ["/images/prod-ethnic-saree-v2.png"],
    rating: 4.6,
    reviewsCount: 76,
    description:
      "Traditional crimson Banarasi art silk saree woven with intricate gold zari brocade, featuring a grand contrast pallu and unstitched blouse piece. Perfect for festive ceremonies and weddings.",
  },
  "wireless-headphones": {
    id: "6adf9f0ceac7435409988968",
    sku: "JMD-ELEC-HEAD-05",
    title: "Wireless Headphones",
    slug: "wireless-headphones",
    category: { name: "Electronics", slug: "electronics", type: "ELECTRONICS" },
    priceRupees: 2999,
    originalPriceRupees: 3499,
    availableStock: 20,
    images: ["/images/prod-headphones-v2.png"],
    rating: 4.4,
    reviewsCount: 92,
    description:
      "Over-ear bluetooth 5.3 headphones equipped with hybrid active noise cancellation (ANC), 40mm dynamic drivers, 30-hour playback, and ultra-comfortable memory foam ear cushions.",
  },
  "gold-bracelet": {
    id: "6adf9f0ceac7435409988964",
    sku: "JMD-GOLD-BRAC-06",
    title: "Gold Bracelet",
    slug: "gold-bracelet",
    category: { name: "Gold Jewellery", slug: "gold-jewellery", type: "JEWELLERY_GOLD" },
    priceRupees: 32569,
    originalPriceRupees: 34999,
    availableStock: 4,
    images: ["/images/prod-gold-bracelet-v2.png"],
    description:
      "Lightweight 22K yellow gold daily wear bracelet with fine floral motifs and a secure lobster lock. Verified purity and insured courier delivery.",
    attributes: {
      metalType: "GOLD",
      purity: "22K (916)",
      grossWeightGrams: 4.8,
      netWeightGrams: 4.8,
      makingChargesPaise: 380000,
      gstPercent: 3,
      pricingStatus: "APPROVED_FINAL_PRICE",
    },
  },
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params.slug as string) || "";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [wishlist, setWishlist] = useState(false);

  const { addItem } = useCart();

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/store/products/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Product not in live catalog");
        return res.json();
      })
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
        } else if (FALLBACK_DETAIL[slug]) {
          setProduct(FALLBACK_DETAIL[slug]);
        } else {
          setError("Product not found");
        }
        setLoading(false);
      })
      .catch(() => {
        if (FALLBACK_DETAIL[slug]) {
          setProduct(FALLBACK_DETAIL[slug]);
        } else {
          setError("Product not found");
        }
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
        image: product.images[selectedImage] || product.images[0] || "/images/prod-gold-mangalsutra.png",
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
      <div className="max-w-6xl mx-auto py-8 animate-pulse space-y-6">
        <div className="h-6 w-48 bg-white rounded border border-[#EBDCB9]" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="h-96 bg-white rounded-xl border border-[#EBDCB9]" />
          <div className="space-y-4">
            <div className="h-8 bg-white rounded w-3/4 border border-[#EBDCB9]" />
            <div className="h-6 bg-white rounded w-1/3 border border-[#EBDCB9]" />
            <div className="h-24 bg-white rounded border border-[#EBDCB9]" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-white p-8 rounded-2xl border border-[#EBDCB9] shadow-sm text-center space-y-4">
        <h2 className="font-serif text-xl font-bold text-[#6B0B1A]">
          Product Not Available
        </h2>
        <p className="text-xs text-gray-500">
          The requested product could not be located in our active inventory.
        </p>
        <Link
          href="/store/products"
          className="inline-flex items-center space-x-1.5 text-[#6B0B1A] font-semibold hover:underline text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Catalogue</span>
        </Link>
      </div>
    );
  }

  const isJewellery =
    product.category?.type === "JEWELLERY_GOLD" ||
    product.category?.type === "JEWELLERY_SILVER" ||
    product.category?.name?.toLowerCase().includes("jewellery");

  const attrs = (product.attributes || {}) as Record<string, unknown>;
  const pricingStatus =
    (attrs.pricingStatus as string) || "APPROVED_FINAL_PRICE";

  return (
    <div className="max-w-6xl mx-auto space-y-8 font-sans">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-1.5 text-xs text-gray-500 border-b border-[#EBDCB9]/70 pb-4">
        <Link href="/store" className="hover:text-[#6B0B1A]">
          Store
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <Link href="/store/products" className="hover:text-[#6B0B1A]">
          Catalogue
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <Link
          href={`/store/categories/${product.category.slug}`}
          className="hover:text-[#6B0B1A]"
        >
          {product.category.name}
        </Link>
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <span className="font-semibold text-[#6B0B1A] truncate max-w-[200px]">
          {product.title}
        </span>
      </div>

      {/* Main Product Showcase Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 bg-white p-6 md:p-8 rounded-2xl border border-[#EBDCB9] shadow-xs">
        {/* Left Column: Image Showcase with Zoom/Thumbnails */}
        <div className="space-y-4">
          <div className="relative h-80 sm:h-96 w-full bg-[#FAF7F2] rounded-xl border border-[#EBDCB9]/80 overflow-hidden flex items-center justify-center p-4">
            <Image
              src={product.images[selectedImage] || product.images[0] || "/images/prod-gold-mangalsutra.png"}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-contain p-4 transition-all duration-300"
            />

            {/* Wishlist Button */}
            <button
              onClick={() => setWishlist(!wishlist)}
              className={`absolute top-3 right-3 p-2 rounded-full bg-white border transition ${
                wishlist
                  ? "border-[#A91B2E] text-[#A91B2E]"
                  : "border-gray-200 text-gray-400 hover:text-[#A91B2E]"
              }`}
              aria-label="Wishlist"
            >
              <Heart className="w-4 h-4 fill-current" />
            </button>
          </div>

          {/* Thumbnails */}
          {product.images.length > 1 && (
            <div className="flex items-center space-x-3 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`relative w-16 h-16 rounded-lg border overflow-hidden p-1 bg-[#FAF7F2] shrink-0 transition ${
                    selectedImage === i
                      ? "border-[#6B0B1A] ring-2 ring-[#6B0B1A]/20"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Image
                    src={img}
                    alt={`Thumbnail ${i + 1}`}
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Title, Pricing, Jewellery Specs, Actions */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Category and SKU */}
            <div className="flex items-center space-x-3">
              <span className="text-[10px] font-bold text-[#6B0B1A] bg-[#6B0B1A]/5 px-2.5 py-0.5 rounded-sm uppercase tracking-wide">
                {product.category.name}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                SKU: {product.sku}
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              {product.title}
            </h1>

            {/* Price Row */}
            <div className="pt-2 border-t border-[#EBDCB9]/50">
              <div className="flex items-baseline space-x-3">
                <span className="text-3xl font-extrabold text-[#6B0B1A]">
                  ₹{product.priceRupees.toLocaleString("en-IN")}
                </span>
                {product.originalPriceRupees && product.originalPriceRupees > product.priceRupees && (
                  <span className="text-sm text-gray-400 line-through">
                    ₹{product.originalPriceRupees.toLocaleString("en-IN")}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  (Inclusive of all taxes & GST)
                </span>
              </div>

              {/* Bhavika Coupon Callout */}
              <div className="mt-2.5 p-2.5 bg-[#FAF7F2] rounded-lg border border-[#EBDCB9] flex items-center space-x-2 text-xs text-gray-700">
                <span className="text-base">🎟️</span>
                <span>
                  <strong>Bhavika Quiz Coupon:</strong> Redeem up to 100% of order value at checkout with your verified bearer codes.
                </span>
              </div>
            </div>

            {/* Stock Availability */}
            <div>
              {product.availableStock > 0 ? (
                <div className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-sm border border-emerald-200">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>In Stock — Ready for Dispatched</span>
                </div>
              ) : (
                <div className="inline-flex items-center space-x-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-sm border border-rose-200">
                  <span>Currently Out of Stock</span>
                </div>
              )}
            </div>

            {/* Jewellery Breakdown Table (when metal attributes exist) */}
            {isJewellery && (
              <div className="pt-2">
                <div className="bg-[#FAF7F2] rounded-xl border border-[#EBDCB9] p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-gray-900 border-b border-[#EBDCB9]/60 pb-1.5">
                    <span>Jewellery Metal & Rate Specification</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-wider font-semibold ${
                        pricingStatus === "APPROVED_FINAL_PRICE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {pricingStatus === "APPROVED_FINAL_PRICE"
                        ? "Approved Final Quote"
                        : "Estimate (Pending CA Approval)"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-700">
                    <div>
                      <span className="text-gray-400 block">Purity:</span>
                      <strong className="text-gray-900">
                        {(attrs.purity as string) || "18K / 22K"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Gross Weight:</span>
                      <strong className="text-gray-900">
                        {(attrs.grossWeightGrams as number) || "5.80"} g
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">GST Rate:</span>
                      <strong className="text-gray-900">
                        {(attrs.gstPercent as number) || 3}% Bullion GST
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Certification:</span>
                      <strong className="text-gray-900">
                        {(attrs.hallmarkCenter as string) || "Assayed & Verified"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed pt-1">
              {product.description}
            </p>
          </div>

          {/* Purchase Actions & Quantity Controls */}
          {product.availableStock > 0 && (
            <div className="space-y-4 pt-4 border-t border-[#EBDCB9]/60">
              <div className="flex items-center space-x-4">
                <span className="text-xs font-semibold text-gray-700">Quantity:</span>
                <div className="inline-flex items-center border border-[#EBDCB9] rounded-md bg-[#FAF7F2]">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="p-2 text-gray-600 hover:text-[#6B0B1A] transition"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3 text-xs font-bold text-gray-900">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity((q) => Math.min(product.availableStock, q + 1))
                    }
                    className="p-2 text-gray-600 hover:text-[#6B0B1A] transition"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[11px] text-gray-400">
                  (Max {product.availableStock} per order)
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleAddToCart}
                  className={`flex-1 py-3 px-6 rounded-md text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs ${
                    added
                      ? "bg-emerald-700 text-white"
                      : "bg-[#6B0B1A] hover:bg-[#831023] text-white"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{added ? "Item Added to Cart!" : "Add to Cart"}</span>
                </button>

                <button
                  onClick={handleBuyNow}
                  className="flex-1 py-3 px-6 rounded-md text-xs font-bold bg-[#FAF7F2] hover:bg-white text-[#6B0B1A] border border-[#6B0B1A] transition flex items-center justify-center space-x-2 shadow-2xs"
                >
                  <span>Buy Now with Bhavika Coupon</span>
                </button>
              </div>
            </div>
          )}

          {/* Trust Guarantees */}
          <div className="pt-4 border-t border-[#EBDCB9]/50 grid grid-cols-2 gap-3 text-[11px] text-gray-600">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>Razorpay 256-Bit Encrypted</span>
            </div>
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>Pan-India Tracked Delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
