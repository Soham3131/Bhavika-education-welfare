import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreProductModel } from "../models/StoreProduct";
import { DomainError } from "@/server/errors";

export interface CartInputItem {
  productId: string | Types.ObjectId;
  quantity: number;
}

export interface CalculatedCartLineItem {
  productId: Types.ObjectId;
  sku: string;
  title: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
}

export interface CalculateCartOptions {
  shippingFeePaise?: number;
  couponDiscountPaise?: number;
}

export interface CalculatedCartSummary {
  items: CalculatedCartLineItem[];
  itemsTotalPaise: number;
  taxPaise: number;
  shippingFeePaise: number;
  couponDiscountPaise: number;
  totalPayablePaise: number;
  qualifiesForFreeShipping: boolean;
}

/**
 * Shipping Policy: Free delivery on orders with merchandise subtotal >= ₹999.00 (99,900 paise).
 * Standard courier delivery fee of ₹99.00 (9,900 paise) applies to orders below ₹999.00.
 *
 * Approved Policy Definition:
 * The free-shipping threshold applies to the merchandise subtotal BEFORE coupons/discounts.
 * Boundary verification (paise integers):
 * - ₹998.99 (99,899 paise): Below threshold -> Standard shipping of ₹99.00 (9,900 paise) applies.
 * - ₹999.00 (99,900 paise): At threshold -> FREE shipping (0 paise).
 * - ₹999.01 (99,901 paise): Above threshold -> FREE shipping (0 paise).
 */
export const FREE_SHIPPING_THRESHOLD_PAISE = 999_00; // ₹999.00
export const STANDARD_SHIPPING_FEE_PAISE = 99_00; // ₹99.00

/**
 * Calculates cart pricing entirely server-side using authoritative database records.
 * Authoritative single source of truth for merchandise total, shipping, discount and payable amount.
 * Ignores any client-submitted prices to prevent tampering.
 */
export async function calculateCart(
  items: CartInputItem[],
  options?: CalculateCartOptions,
): Promise<CalculatedCartSummary> {
  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const calculatedItems: CalculatedCartLineItem[] = [];
  let itemsTotalPaise = 0;

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity ${item.quantity} for item`);
    }

    const product = await Product.findById(
      new Types.ObjectId(item.productId.toString()),
    );
    if (!product || !product.isActive) {
      throw new Error(
        `Product ${item.productId.toString()} is inactive or not found`,
      );
    }

    const available = product.stock - product.reservedStock;
    if (available < item.quantity) {
      throw new Error(
        `Insufficient stock for '${product.title}': requested ${item.quantity}, available ${available}`,
      );
    }

    const unitPricePaise = product.basePricePaise;
    const totalPricePaise = unitPricePaise * item.quantity;

    calculatedItems.push({
      productId: product._id as Types.ObjectId,
      sku: product.sku,
      title: product.title,
      quantity: item.quantity,
      unitPricePaise,
      totalPricePaise,
    });

    itemsTotalPaise += totalPricePaise;
  }

  const taxPaise = 0; // Prices are tax-inclusive by default in Phase B

  // Free shipping policy applies to merchandise subtotal before coupons
  const qualifiesForFreeShipping = itemsTotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE;
  const shippingFeePaise =
    options?.shippingFeePaise !== undefined
      ? options.shippingFeePaise
      : qualifiesForFreeShipping
      ? 0
      : STANDARD_SHIPPING_FEE_PAISE;

  // Strict coupon discount authority:
  // Reject over-coverage to prevent silent loss of unspent customer coupon value.
  const grossOrderValuePaise = itemsTotalPaise + taxPaise + shippingFeePaise;
  const rawDiscount = Math.max(0, options?.couponDiscountPaise ?? 0);

  if (rawDiscount > grossOrderValuePaise) {
    throw new DomainError(
      `Coupon discount of ₹${(rawDiscount / 100).toFixed(2)} exceeds gross order value of ₹${(grossOrderValuePaise / 100).toFixed(2)}. In order to protect coupon value and prevent loss of unspent balance, coupons exceeding order total cannot be applied.`,
      400,
      "COUPON_OVERCOVERAGE_PROHIBITED",
    );
  }

  const couponDiscountPaise = rawDiscount;
  const totalPayablePaise = grossOrderValuePaise - couponDiscountPaise;

  return {
    items: calculatedItems,
    itemsTotalPaise,
    taxPaise,
    shippingFeePaise,
    couponDiscountPaise,
    totalPayablePaise,
    qualifiesForFreeShipping,
  };
}
