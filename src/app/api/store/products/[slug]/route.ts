import { handle, ok, fail } from "@/server/http";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreProductModel } from "@/server/store/models/StoreProduct";

export const GET = handle(async (_req, ctx) => {
  const { slug } = await ctx.params;
  if (!slug) {
    return fail("Product slug required.", 400);
  }

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const product = await Product.findOne({
    slug: slug.toLowerCase().trim(),
    isActive: true,
  }).populate("category", "name slug type");

  if (!product) {
    return fail("Product not found.", 404, { code: "NOT_FOUND" });
  }

  const cat = product.category as unknown as {
    name?: string;
    slug?: string;
    type?: string;
  };

  return ok({
    product: {
      id: product._id.toString(),
      sku: product.sku,
      title: product.title,
      slug: product.slug,
      category: {
        name: cat?.name || "General",
        slug: cat?.slug || "",
        type: cat?.type || "",
      },
      description: product.description,
      images: product.images,
      basePricePaise: product.basePricePaise,
      priceRupees: product.basePricePaise / 100,
      stock: product.stock,
      availableStock: Math.max(0, product.stock - product.reservedStock),
      attributes: product.attributes,
    },
  });
});
