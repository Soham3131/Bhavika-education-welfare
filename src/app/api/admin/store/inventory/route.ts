import { handle, ok, fail } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreProductModel } from "@/server/store/models/StoreProduct";
import { Types } from "mongoose";
import { z } from "zod";

const inventoryAdjustmentSchema = z.object({
  productId: z.string().min(1),
  adjustmentDelta: z.number().int(),
  reason: z.string().min(1),
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = inventoryAdjustmentSchema.parse(body);

  await requireStoreAdmin("STORE_INVENTORY_ADJUST", {
    action: "STORE_INVENTORY_ADJUST",
    targetType: "STORE_PRODUCT",
    targetId: parsed.productId,
    reason: parsed.reason,
    meta: { delta: parsed.adjustmentDelta },
  });

  const db = await getStoreDb();
  const Product = getStoreProductModel(db);

  const product = await Product.findById(new Types.ObjectId(parsed.productId));
  if (!product) {
    return fail("Product not found.", 404);
  }

  const updatedStock = product.stock + parsed.adjustmentDelta;
  if (updatedStock < product.reservedStock) {
    return fail(
      `Cannot adjust stock to ${updatedStock}: lower than currently reserved stock (${product.reservedStock})`,
      400,
    );
  }

  product.stock = updatedStock;
  await product.save();

  return ok({
    success: true,
    productId: product._id.toString(),
    stock: product.stock,
    reservedStock: product.reservedStock,
    availableStock: product.stock - product.reservedStock,
  });
});
