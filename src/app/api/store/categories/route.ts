import { handle, ok } from "@/server/http";
import { listStoreCategories } from "@/server/store/services/product.service";

export const GET = handle(async () => {
  const categories = await listStoreCategories(true);
  return ok({
    categories: categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      type: c.type,
      description: c.description,
    })),
  });
});
