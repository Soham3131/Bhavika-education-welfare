import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreProductModel } from "../models/StoreProduct";

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

export interface CalculatedCartSummary {
  items: CalculatedCartLineItem[];
  itemsTotalPaise: number;
  taxPaise: number;
  shippingFeePaise: number;
  totalPayablePaise: number;
}

/**
 * Calculates cart pricing entirely server-side using authoritative database records.
 * Ignores any client-submitted prices to prevent tampering.
 */
export async function calculateCart(
  items: CartInputItem[],
  options?: { shippingFeePaise?: number },
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
  const shippingFeePaise = options?.shippingFeePaise ?? 0;
  const totalPayablePaise = itemsTotalPaise + taxPaise + shippingFeePaise;

  return {
    items: calculatedItems,
    itemsTotalPaise,
    taxPaise,
    shippingFeePaise,
    totalPayablePaise,
  };
}
