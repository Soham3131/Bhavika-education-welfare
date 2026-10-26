import { handle, ok } from "@/server/http";
import { calculateCart } from "@/server/store/services/cart.service";
import { z } from "zod";

const cartValidationSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product ID required"),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "Cart cannot be empty"),
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = cartValidationSchema.parse(body);

  const cart = await calculateCart(parsed.items);

  return ok({
    items: cart.items.map((item) => ({
      productId: item.productId.toString(),
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      unitPriceRupees: item.unitPricePaise / 100,
      totalPricePaise: item.totalPricePaise,
      totalPriceRupees: item.totalPricePaise / 100,
    })),
    itemsTotalPaise: cart.itemsTotalPaise,
    itemsTotalRupees: cart.itemsTotalPaise / 100,
    shippingFeePaise: cart.shippingFeePaise,
    shippingFeeRupees: cart.shippingFeePaise / 100,
    totalPayablePaise: cart.totalPayablePaise,
    totalPayableRupees: cart.totalPayablePaise / 100,
  });
});
