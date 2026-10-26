import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  createStoreCategory,
  listStoreCategories,
} from "@/server/store/services/product.service";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  type: z.enum([
    "JEWELLERY_GOLD",
    "JEWELLERY_SILVER",
    "RECHARGE",
    "GROCERY",
    "FASHION",
    "ELECTRONICS",
  ]),
  description: z.string().optional(),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_CATALOGUE_VIEW");
  const categories = await listStoreCategories(false);
  return ok({
    categories: categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      type: c.type,
      description: c.description,
      isActive: c.isActive,
    })),
  });
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = createCategorySchema.parse(body);

  await requireStoreAdmin("STORE_CATALOGUE_MANAGE", {
    action: "STORE_CATEGORY_CREATE",
    targetType: "STORE_CATEGORY",
    meta: { name: parsed.name, slug: parsed.slug },
  });

  const category = await createStoreCategory({
    name: parsed.name,
    slug: parsed.slug,
    type: parsed.type,
    description: parsed.description,
  });

  return ok({ success: true, categoryId: category._id.toString() });
});
