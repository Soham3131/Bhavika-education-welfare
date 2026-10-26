import { ClientSession, Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreCategoryModel,
  IStoreCategory,
  IStoreCategoryDoc,
} from "../models/StoreCategory";
import {
  getStoreProductModel,
  IStoreProductDoc,
} from "../models/StoreProduct";

export interface CreateCategoryInput {
  name: string;
  slug: string;
  type: IStoreCategory["type"];
  description?: string;
  isActive?: boolean;
}

export interface CreateProductInput {
  sku: string;
  title: string;
  slug: string;
  categoryId: string | Types.ObjectId;
  description?: string;
  images?: string[];
  basePricePaise: number;
  stock: number;
  isActive?: boolean;
  attributes?: Record<string, unknown>;
}

export async function createStoreCategory(
  input: CreateCategoryInput,
): Promise<IStoreCategoryDoc> {
  const db = await getStoreDb();
  const Category = getStoreCategoryModel(db);
  const doc = new Category({
    name: input.name,
    slug: input.slug.toLowerCase().trim(),
    type: input.type,
    description: input.description,
    isActive: input.isActive ?? true,
  });
  return await doc.save();
}

export async function getStoreCategoryBySlug(
  slug: string,
): Promise<IStoreCategoryDoc | null> {
  const db = await getStoreDb();
  const Category = getStoreCategoryModel(db);
  return await Category.findOne({ slug: slug.toLowerCase().trim() });
}

export async function listStoreCategories(
  activeOnly = true,
): Promise<IStoreCategoryDoc[]> {
  const db = await getStoreDb();
  const Category = getStoreCategoryModel(db);
  const filter = activeOnly ? { isActive: true } : {};
  return await Category.find(filter).sort({ name: 1 });
}

export async function createStoreProduct(
  input: CreateProductInput,
): Promise<IStoreProductDoc> {
  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  if (!Number.isInteger(input.basePricePaise) || input.basePricePaise < 0) {
    throw new Error("basePricePaise must be a non-negative integer");
  }
  if (!Number.isInteger(input.stock) || input.stock < 0) {
    throw new Error("stock must be a non-negative integer");
  }

  const doc = new Product({
    sku: input.sku.toUpperCase().trim(),
    title: input.title.trim(),
    slug: input.slug.toLowerCase().trim(),
    category: new Types.ObjectId(input.categoryId.toString()),
    description: input.description,
    images: input.images ?? [],
    basePricePaise: input.basePricePaise,
    stock: input.stock,
    reservedStock: 0,
    isActive: input.isActive ?? true,
    attributes: input.attributes ?? {},
  });
  return await doc.save();
}

export async function getStoreProductBySku(
  sku: string,
): Promise<IStoreProductDoc | null> {
  const db = await getStoreDb();
  const Product = getStoreProductModel(db);
  return await Product.findOne({ sku: sku.toUpperCase().trim() });
}

export async function getStoreProductById(
  id: string | Types.ObjectId,
): Promise<IStoreProductDoc | null> {
  const db = await getStoreDb();
  const Product = getStoreProductModel(db);
  return await Product.findById(new Types.ObjectId(id.toString()));
}

export async function listStoreProducts(options?: {
  categoryId?: string | Types.ObjectId;
  activeOnly?: boolean;
}): Promise<IStoreProductDoc[]> {
  const db = await getStoreDb();
  const Product = getStoreProductModel(db);
  const filter: Record<string, unknown> = {};
  if (options?.activeOnly !== false) {
    filter.isActive = true;
  }
  if (options?.categoryId) {
    filter.category = new Types.ObjectId(options.categoryId.toString());
  }
  return await Product.find(filter).sort({ createdAt: -1 });
}

/**
 * Concurrency-safe inventory reservation.
 * Atomically checks available stock (stock - reservedStock >= quantity) and increments reservedStock.
 * Returns the updated product or throws if stock is insufficient.
 */
export async function reserveProductInventory(params: {
  productId: string | Types.ObjectId;
  quantity: number;
  session?: ClientSession;
}): Promise<IStoreProductDoc> {
  const { productId, quantity, session } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Reservation quantity must be a positive integer");
  }

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const updated = await Product.findOneAndUpdate(
    {
      _id: new Types.ObjectId(productId.toString()),
      isActive: true,
      $expr: {
        $gte: [{ $subtract: ["$stock", "$reservedStock"] }, quantity],
      },
    },
    { $inc: { reservedStock: quantity } },
    { returnDocument: "after", session },
  );

  if (!updated) {
    throw new Error(
      `Insufficient available stock for product ${productId.toString()}`,
    );
  }

  return updated;
}

/**
 * Release reserved inventory (e.g., when an order is cancelled or expires).
 */
export async function releaseProductInventory(params: {
  productId: string | Types.ObjectId;
  quantity: number;
  session?: ClientSession;
}): Promise<IStoreProductDoc> {
  const { productId, quantity, session } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Release quantity must be a positive integer");
  }

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const updated = await Product.findOneAndUpdate(
    {
      _id: new Types.ObjectId(productId.toString()),
      reservedStock: { $gte: quantity },
    },
    { $inc: { reservedStock: -quantity } },
    { returnDocument: "after", session },
  );

  if (!updated) {
    throw new Error(
      `Cannot release ${quantity} units: reservedStock insufficient on product ${productId.toString()}`,
    );
  }

  return updated;
}

/**
 * Permanently fulfill inventory upon order payment capture.
 * Decrements both physical stock and reservedStock by the fulfilled quantity.
 */
export async function fulfillProductInventory(params: {
  productId: string | Types.ObjectId;
  quantity: number;
  session?: ClientSession;
}): Promise<IStoreProductDoc> {
  const { productId, quantity, session } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Fulfillment quantity must be a positive integer");
  }

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const updated = await Product.findOneAndUpdate(
    {
      _id: new Types.ObjectId(productId.toString()),
      stock: { $gte: quantity },
      reservedStock: { $gte: quantity },
    },
    {
      $inc: {
        stock: -quantity,
        reservedStock: -quantity,
      },
    },
    { returnDocument: "after", session },
  );

  if (!updated) {
    throw new Error(
      `Cannot fulfill ${quantity} units: stock or reservedStock insufficient on product ${productId.toString()}`,
    );
  }

  return updated;
}
