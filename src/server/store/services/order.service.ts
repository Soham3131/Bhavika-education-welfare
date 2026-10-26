import { ClientSession, Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreOrderModel,
  IOrderItem,
  IShippingAddress,
  IStoreOrderDoc,
  OrderStatus,
} from "../models/StoreOrder";
import { getStoreProductModel } from "../models/StoreProduct";
import { getStoreCategoryModel } from "../models/StoreCategory";
import { getStoreSettingsModel } from "../models/StoreSettings";
import { calculateCart, CartInputItem } from "./cart.service";
import {
  reserveProductInventory,
  releaseProductInventory,
  fulfillProductInventory,
} from "./product.service";
import {
  reverseOrderCommission,
  settleOrderCommission,
} from "./commission.service";
import { DomainError } from "@/server/errors";

export interface CreateOrderInput {
  memberId: string | Types.ObjectId;
  items: CartInputItem[];
  shippingAddress: IShippingAddress;
  couponDiscountPaise?: number;
  reservationMinutes?: number;
}

/**
 * Valid transitions map for the strict Order State Machine.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [
    "PROCESSING_COUPONS",
    "PAID",
    "CANCELLED",
    "EXPIRED",
  ],
  PROCESSING_COUPONS: [
    "PAID",
    "PARTIAL_COUPON_REDEMPTION_DEFICIT",
    "CANCELLED",
  ],
  PARTIAL_COUPON_REDEMPTION_DEFICIT: [
    "PAID",
    "CANCELLED_PARTIAL_COUPON_CONSUMED",
  ],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  CANCELLED_PARTIAL_COUPON_CONSUMED: [],
  REFUNDED: [],
  EXPIRED: [],
};

export async function generateOrderRef(): Promise<string> {
  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);
  const year = new Date().getFullYear();
  const prefix = `JMD-ORD-${year}-`;

  const lastOrder = await Order.findOne({
    orderRef: { $regex: `^${prefix}` },
  })
    .sort({ orderRef: -1 })
    .collation({ locale: "en_US", numericOrdering: true });

  let nextSeq = 1;
  if (lastOrder && lastOrder.orderRef) {
    const parts = lastOrder.orderRef.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${prefix}${nextSeq.toString().padStart(6, "0")}`;
}

/**
 * Creates an order, validates cart pricing server-side, and atomically reserves inventory.
 */
export async function createStoreOrder(
  input: CreateOrderInput,
): Promise<IStoreOrderDoc> {
  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);

  // 1. Calculate pricing server-side
  const cartSummary = await calculateCart(input.items);

  // Check if any product belongs to a jewellery category pending CA GST approval
  const ProductModel = getStoreProductModel(db);
  const CategoryModel = getStoreCategoryModel(db);
  const orderedProductIds = cartSummary.items.map((i) => i.productId);
  const orderedProducts = await ProductModel.find({
    _id: { $in: orderedProductIds },
  })
    .select("category")
    .lean();

  if (orderedProducts.length > 0) {
    const categoryIds = orderedProducts.map((p) => p.category);
    const jewelleryCategories = await CategoryModel.find({
      _id: { $in: categoryIds },
      type: { $in: ["JEWELLERY_GOLD", "JEWELLERY_SILVER"] },
    }).lean();

    if (jewelleryCategories.length > 0) {
      const SettingsModel = getStoreSettingsModel(db);
      const settingsDoc = await SettingsModel.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();
      const caApproved = settingsDoc?.settings?.jewellery?.caApprovalConfirmed ?? false;
      if (!caApproved) {
        throw new DomainError(
          "Jewellery checkout is gated pending written Chartered Accountant confirmation of GST tax rates.",
          403,
          "JEWELLERY_TAX_APPROVAL_PENDING",
        );
      }
    }
  }

  const couponDiscountPaise = Math.max(0, input.couponDiscountPaise ?? 0);
  const netPayablePaise = Math.max(
    0,
    cartSummary.totalPayablePaise - couponDiscountPaise,
  );

  // 2. Atomically reserve inventory for all items
  const reservedItems: { productId: Types.ObjectId; quantity: number }[] = [];
  try {
    for (const item of cartSummary.items) {
      await reserveProductInventory({
        productId: item.productId,
        quantity: item.quantity,
      });
      reservedItems.push({
        productId: item.productId,
        quantity: item.quantity,
      });
    }
  } catch (error) {
    // Rollback any successfully reserved items on partial failure
    for (const item of reservedItems) {
      try {
        await releaseProductInventory({
          productId: item.productId,
          quantity: item.quantity,
        });
      } catch {
        // Log rollback error
      }
    }
    throw error;
  }

  // 3. Generate stable human-readable order reference
  const orderRef = await generateOrderRef();
  const reservationMinutes = input.reservationMinutes ?? 15;
  const stockReservationExpiresAt = new Date(
    Date.now() + reservationMinutes * 60 * 1000,
  );

  const orderItems: IOrderItem[] = cartSummary.items.map((item) => ({
    productId: item.productId,
    sku: item.sku,
    title: item.title,
    quantity: item.quantity,
    unitPricePaise: item.unitPricePaise,
    totalPricePaise: item.totalPricePaise,
  }));

  const order = new Order({
    orderRef,
    memberId: new Types.ObjectId(input.memberId.toString()),
    items: orderItems,
    shippingAddress: input.shippingAddress,
    itemsTotalPaise: cartSummary.itemsTotalPaise,
    taxPaise: cartSummary.taxPaise,
    shippingFeePaise: cartSummary.shippingFeePaise,
    couponDiscountPaise,
    netPayablePaise,
    paidCashPaise: 0,
    deficitPaise: 0,
    status: "PENDING_PAYMENT",
    paymentStatus: "UNPAID",
    stockReservationExpiresAt,
  });

  return await order.save();
}

/**
 * Transitions an order to a target state strictly verifying the state machine.
 */
export async function transitionOrderStatus(params: {
  orderRef: string;
  targetStatus: OrderStatus;
  notes?: string;
  cancellationReason?: string;
  deficitPaise?: number;
  paidCashPaise?: number;
  session?: ClientSession;
}): Promise<IStoreOrderDoc> {
  const {
    orderRef,
    targetStatus,
    notes,
    cancellationReason,
    deficitPaise,
    paidCashPaise,
    session,
  } = params;

  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);

  const current = await Order.findOne({ orderRef }).session(session ?? null);
  if (!current) {
    throw new Error(`Order ${orderRef} not found`);
  }

  // Check valid transitions
  const allowed = VALID_ORDER_TRANSITIONS[current.status];
  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `Illegal order transition: cannot transition order ${orderRef} from '${current.status}' to '${targetStatus}'`,
    );
  }

  const updateFields: Record<string, unknown> = {
    status: targetStatus,
  };
  if (notes) updateFields.notes = notes;
  if (cancellationReason)
    updateFields.cancellationReason = cancellationReason;
  if (typeof deficitPaise === "number")
    updateFields.deficitPaise = deficitPaise;
  if (typeof paidCashPaise === "number")
    updateFields.paidCashPaise = paidCashPaise;

  if (targetStatus === "PAID") {
    updateFields.paymentStatus = "CAPTURED";
    updateFields.paidAt = new Date();
  } else if (
    targetStatus === "CANCELLED" ||
    targetStatus === "CANCELLED_PARTIAL_COUPON_CONSUMED"
  ) {
    updateFields.cancelledAt = new Date();
  }

  const updated = await Order.findOneAndUpdate(
    { orderRef, status: current.status },
    { $set: updateFields },
    { returnDocument: "after", session },
  );

  if (!updated) {
    throw new Error(
      `Concurrent transition conflict for order ${orderRef}`,
    );
  }

  // Handle inventory side-effects
  if (targetStatus === "PAID") {
    // Permanently fulfill reserved inventory
    for (const item of updated.items) {
      await fulfillProductInventory({
        productId: item.productId,
        quantity: item.quantity,
        session,
      });
    }

    // Phase F: Automatically issue lucky draw tickets for qualifying paid orders
    try {
      const { issueOrderTickets } = await import("./lucky-draw.service");
      await issueOrderTickets({
        orderId: updated._id,
        memberId: updated.memberId,
        orderRef,
        totalAmountPaise: updated.itemsTotalPaise,
      });
    } catch (err) {
      console.error("[Phase F] Order lucky draw ticket issuance error:", err);
    }
  } else if (
    (targetStatus === "CANCELLED" || targetStatus === "EXPIRED") &&
    current.status === "PENDING_PAYMENT"
  ) {
    // Release reserved inventory back to available pool
    for (const item of updated.items) {
      await releaseProductInventory({
        productId: item.productId,
        quantity: item.quantity,
        session,
      });
    }
  }

  // Phase C: Commission lifecycle side-effects
  if (
    targetStatus === "CANCELLED" ||
    targetStatus === "CANCELLED_PARTIAL_COUPON_CONSUMED" ||
    targetStatus === "REFUNDED"
  ) {
    try {
      await reverseOrderCommission({
        orderRef,
        reason: cancellationReason || notes || `Order ${targetStatus}`,
      });
    } catch {
      // Non-blocking best-effort
    }
  } else if (targetStatus === "DELIVERED") {
    try {
      await settleOrderCommission(orderRef);
    } catch {
      // Non-blocking best-effort
    }

    // Phase D: Accrue product points & issue ORDER_PURCHASE coupon
    try {
      const { accrueOrderPoints } = await import("./points.service");
      const { issueStoreCoupon } = await import("./store-coupon.service");
      const { StoreCouponSource } = await import("../models/StoreCoupon");

      const eligibleSpend = Math.max(0, updated.itemsTotalPaise - updated.couponDiscountPaise);
      await accrueOrderPoints({
        memberId: updated.memberId,
        orderRef,
        eligibleSpendPaise: eligibleSpend,
      });

      // Issue ORDER_PURCHASE coupon if order is above ₹1,000 (100,000 paise)
      if (eligibleSpend >= 100000) {
        await issueStoreCoupon({
          memberId: updated.memberId,
          faceValuePaise: 5000, // ₹50 promotional coupon
          source: StoreCouponSource.ORDER_PURCHASE,
          sourceRef: orderRef,
          validityDays: 90,
          isEligibleForDraw: true,
          metadata: { orderRef, qualifyingSpendPaise: eligibleSpend },
        });
      }
    } catch (err) {
      console.error("[Phase D] Order delivered points/coupon error:", err);
    }
  }

  return updated;
}

export async function getStoreOrderByRef(
  orderRef: string,
): Promise<IStoreOrderDoc | null> {
  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);
  return await Order.findOne({ orderRef });
}

export async function getStoreOrderHistory(
  memberId: string | Types.ObjectId,
): Promise<IStoreOrderDoc[]> {
  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);
  return await Order.find({
    memberId: new Types.ObjectId(memberId.toString()),
  }).sort({ createdAt: -1 });
}

/**
 * Scans for orders with PENDING_PAYMENT status whose stockReservationExpiresAt has passed,
 * transitions them to EXPIRED, and releases their reserved stock back to the inventory pool.
 */
export async function cancelExpiredOrders(now = new Date()): Promise<number> {
  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);

  const expiredOrders = await Order.find({
    status: "PENDING_PAYMENT",
    stockReservationExpiresAt: { $lt: now },
  });

  let cancelledCount = 0;
  for (const order of expiredOrders) {
    try {
      await transitionOrderStatus({
        orderRef: order.orderRef,
        targetStatus: "EXPIRED",
        notes: "Stock reservation expired before payment completed",
      });
      cancelledCount++;
    } catch {
      // Order may have raced with a payment attempt or already transitioned
    }
  }

  return cancelledCount;
}

