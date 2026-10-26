import { handle, ok } from "@/server/http";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreProductModel } from "@/server/store/models/StoreProduct";
import { getStoreCategoryModel } from "@/server/store/models/StoreCategory";

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const categorySlug = url.searchParams.get("category");

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);
  const Category = getStoreCategoryModel(db);

  const filter: Record<string, unknown> = { isActive: true };

  if (categorySlug) {
    const cat = await Category.findOne({
      slug: categorySlug.toLowerCase().trim(),
    });
    if (cat) {
      filter.category = cat._id;
    } else {
      return ok({ products: [] });
    }
  }

  const products = await Product.find(filter)
    .populate("category", "name slug type")
    .sort({ createdAt: -1 })
    .limit(100);

  return ok({
    products: products.map((p) => {
      const cat = p.category as unknown as { name?: string; slug?: string };
      return {
        id: p._id.toString(),
        sku: p.sku,
        title: p.title,
        slug: p.slug,
        categoryName: cat?.name || "General",
        categorySlug: cat?.slug || "",
        basePricePaise: p.basePricePaise,
        priceRupees: p.basePricePaise / 100,
        stock: p.stock,
        availableStock: Math.max(0, p.stock - p.reservedStock),
        images: p.images,
        description: p.description,
      };
    }),
  });
});
