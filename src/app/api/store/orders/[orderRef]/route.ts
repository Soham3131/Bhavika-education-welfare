import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import { getStoreOrderByRef } from "@/server/store/services/order.service";

export const GET = handle(async (_req, ctx) => {
  const session = await requireStoreMember();
  const { orderRef } = await ctx.params;

  if (!orderRef) {
    return fail("Order reference required.", 400);
  }

  const order = await getStoreOrderByRef(orderRef);
  if (!order) {
    return fail("Order not found.", 404);
  }

  // Ensure member owns this order
  if (order.memberId.toString() !== session.storeMemberId) {
    return fail("Unauthorized.", 403);
  }

  return ok({
    order: {
      orderRef: order.orderRef,
      status: order.status,
      paymentStatus: order.paymentStatus,
      items: order.items.map((it) => ({
        sku: it.sku,
        title: it.title,
        quantity: it.quantity,
        unitPriceRupees: it.unitPricePaise / 100,
        totalPriceRupees: it.totalPricePaise / 100,
      })),
      shippingAddress: order.shippingAddress,
      itemsTotalRupees: order.itemsTotalPaise / 100,
      taxRupees: order.taxPaise / 100,
      shippingFeeRupees: order.shippingFeePaise / 100,
      couponDiscountRupees: order.couponDiscountPaise / 100,
      netPayableRupees: order.netPayablePaise / 100,
      paidCashRupees: order.paidCashPaise / 100,
      deficitRupees: order.deficitPaise / 100,
      notes: order.notes,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
    },
  });
});
