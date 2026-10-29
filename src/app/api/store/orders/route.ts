import { handle, ok } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  createStoreOrder,
  getStoreOrderHistory,
} from "@/server/store/services/order.service";
import { z } from "zod";

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1, "Order must contain at least one item"),
  shippingAddress: z.object({
    fullName: z.string().trim().min(2, "Full name required"),
    phone: z.string().trim().min(10, "Phone number required"),
    addressLine1: z.string().trim().min(3, "Address line 1 required"),
    addressLine2: z.string().trim().optional(),
    city: z.string().trim().min(2, "City required"),
    state: z.string().trim().min(2, "State required"),
    postalCode: z.string().trim().min(4, "Postal code required"),
    country: z.string().trim().default("India"),
  }),
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
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = createOrderSchema.parse(body);

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

  const order = await createStoreOrder({
    memberId: session.storeMemberId,
    items: parsed.items,
    shippingAddress: parsed.shippingAddress,
    couponCodes: rawCodes,
  });

  return ok({
    success: true,
    orderRef: order.orderRef,
    itemsTotalRupees: order.itemsTotalPaise / 100,
    couponDiscountRupees: order.couponDiscountPaise / 100,
    netPayableRupees: order.netPayablePaise / 100,
    netPayablePaise: order.netPayablePaise,
    status: order.status,
    stockReservationExpiresAt: order.stockReservationExpiresAt,
  });
});

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const orders = await getStoreOrderHistory(session.storeMemberId);

  return ok({
    orders: orders.map((o) => ({
      orderRef: o.orderRef,
      itemCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
      items: o.items.map((it) => ({
        sku: it.sku,
        title: it.title,
        quantity: it.quantity,
        totalPriceRupees: it.totalPricePaise / 100,
      })),
      itemsTotalRupees: o.itemsTotalPaise / 100,
      couponDiscountRupees: o.couponDiscountPaise / 100,
      netPayableRupees: o.netPayablePaise / 100,
      status: o.status,
      paymentStatus: o.paymentStatus,
      deficitRupees: o.deficitPaise / 100,
      createdAt: o.createdAt,
    })),
  });
});
