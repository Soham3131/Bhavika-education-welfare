import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreOrderModel, OrderStatus } from "@/server/store/models/StoreOrder";
import { transitionOrderStatus } from "@/server/store/services/order.service";
import { z } from "zod";

const updateOrderStatusSchema = z.object({
  orderRef: z.string().min(1),
  targetStatus: z.enum([
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ]),
  notes: z.string().optional(),
});

export const GET = handle(async (req) => {
  await requireStoreAdmin("STORE_ORDER_MANAGE");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);

  const filter: Record<string, unknown> = {};
  if (status) {
    filter.status = status;
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(100);

  return ok({
    orders: orders.map((o) => ({
      orderRef: o.orderRef,
      memberId: o.memberId.toString(),
      items: o.items,
      shippingAddress: o.shippingAddress,
      itemsTotalRupees: o.itemsTotalPaise / 100,
      couponDiscountRupees: o.couponDiscountPaise / 100,
      netPayableRupees: o.netPayablePaise / 100,
      paidCashRupees: o.paidCashPaise / 100,
      deficitRupees: o.deficitPaise / 100,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
    })),
  });
});

export const PATCH = handle(async (req) => {
  const body = await req.json();
  const parsed = updateOrderStatusSchema.parse(body);

  await requireStoreAdmin("STORE_ORDER_MANAGE", {
    action: "STORE_ORDER_STATUS_UPDATE",
    targetType: "STORE_ORDER",
    targetId: parsed.orderRef,
    reason: parsed.notes,
    meta: { targetStatus: parsed.targetStatus },
  });

  const updated = await transitionOrderStatus({
    orderRef: parsed.orderRef,
    targetStatus: parsed.targetStatus as OrderStatus,
    notes: parsed.notes,
  });

  return ok({
    success: true,
    orderRef: updated.orderRef,
    status: updated.status,
  });
});
