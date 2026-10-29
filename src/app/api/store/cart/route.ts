import { handle, ok } from "@/server/http";
import { calculateCart } from "@/server/store/services/cart.service";
import { resolveAuthoritativeCoupons } from "@/server/store/services/coupon-authority.service";
import { getStoreMemberSession } from "@/server/store/auth/session";
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
  couponCodes: z.array(z.string().trim().min(1)).optional(),
  coupons: z
    .array(
      z.object({
        code: z.string().trim().min(1),
      }).passthrough(),
    )
    .optional(),
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = cartValidationSchema.parse(body);

  // Extract coupon codes only. Client-supplied discount amounts are never trusted.
  const rawCodes: string[] = [];
  if (parsed.couponCodes) {
    rawCodes.push(...parsed.couponCodes);
  }
  if (parsed.coupons) {
    for (const c of parsed.coupons) {
      if (c.code) rawCodes.push(c.code);
    }
  }

  const session = await getStoreMemberSession();
  const authoritativeCoupons = await resolveAuthoritativeCoupons({
    couponCodes: rawCodes,
    memberId: session?.storeMemberId,
  });

  const cart = await calculateCart(parsed.items, {
    couponDiscountPaise: authoritativeCoupons.totalDiscountPaise,
  });

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
    couponDiscountPaise: cart.couponDiscountPaise,
    couponDiscountRupees: cart.couponDiscountPaise / 100,
    totalPayablePaise: cart.totalPayablePaise,
    totalPayableRupees: cart.totalPayablePaise / 100,
    qualifiesForFreeShipping: cart.qualifiesForFreeShipping,
    appliedCoupons: authoritativeCoupons.coupons.map((c) => ({
      code: c.code,
      valueRupees: c.valueRupees,
      valuePaise: c.valuePaise,
      source: c.source,
    })),
  });
});

