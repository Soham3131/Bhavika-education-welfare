import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreProductModel } from "@/server/store/models/StoreProduct";
import { createStoreProduct } from "@/server/store/services/product.service";
import { z } from "zod";

const createProductAdminSchema = z.object({
  sku: z.string().trim().min(3),
  title: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  categoryId: z.string().min(1),
  basePriceRupees: z.number().min(0),
  stock: z.number().int().min(0),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_CATALOGUE_VIEW");
  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const products = await Product.find({})
    .populate("category", "name slug type")
    .sort({ createdAt: -1 });

  return ok({
    products: products.map((p) => {
      const cat = p.category as unknown as { name?: string; slug?: string };
      return {
        id: p._id.toString(),
        sku: p.sku,
        title: p.title,
        slug: p.slug,
        category: cat?.name || "General",
        priceRupees: p.basePricePaise / 100,
        basePricePaise: p.basePricePaise,
        stock: p.stock,
        reservedStock: p.reservedStock,
        availableStock: Math.max(0, p.stock - p.reservedStock),
        isActive: p.isActive,
        createdAt: p.createdAt,
      };
    }),
  });
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = createProductAdminSchema.parse(body);

  await requireStoreAdmin("STORE_CATALOGUE_MANAGE", {
    action: "STORE_PRODUCT_CREATE",
    targetType: "STORE_PRODUCT",
    meta: { sku: parsed.sku, title: parsed.title },
  });

  const basePricePaise = Math.round(parsed.basePriceRupees * 100);

  const product = await createStoreProduct({
    sku: parsed.sku,
    title: parsed.title,
    slug: parsed.slug,
    categoryId: parsed.categoryId,
    basePricePaise,
    stock: parsed.stock,
    description: parsed.description,
    images: parsed.images,
    isActive: parsed.isActive,
  });

  return ok({ success: true, productId: product._id.toString() });
});
