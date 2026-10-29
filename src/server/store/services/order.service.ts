import { ClientSession, Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getStoreOrderModel,
  IOrderItem,
  IShippingAddress,
  IStoreOrderDoc,
  OrderStatus,
  OrderPaymentStatus,
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

import {
  resolveAuthoritativeCoupons,
  AuthoritativeCouponResolution,
} from "./coupon-authority.service";

export interface CreateOrderInput {
  memberId: string | Types.ObjectId;
  items: CartInputItem[];
  shippingAddress: IShippingAddress;
  couponCodes?: string[];
  couponDiscountPaise?: number;
  customCouponValidator?: (
    code: string,
  ) => Promise<{ valid: boolean; valueRupees?: number; error?: string }>;
  couponRedeemer?: (
    code: string,
    orderRef: string,
  ) => Promise<{ success: boolean; error?: string; isReplay?: boolean }>;
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
  EXPIRED: ["REFUNDED"],
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

  // 1. Authoritative server-side cart and order pricing calculation
  // Independently recalculates complete order total, shipping fee, and payable amount from database records.
  let authoritativeCoupons: AuthoritativeCouponResolution | null = null;
  let couponDiscountPaise = 0;

  if (input.couponCodes && input.couponCodes.length > 0) {
    authoritativeCoupons = await resolveAuthoritativeCoupons({
      couponCodes: input.couponCodes,
      memberId: input.memberId,
      customValidator: input.customCouponValidator,
    });
    couponDiscountPaise = authoritativeCoupons.totalDiscountPaise;
  } else if (input.couponDiscountPaise && input.couponDiscountPaise > 0) {
    // Internal fallback for direct test callers without coupon codes
    couponDiscountPaise = Math.max(0, input.couponDiscountPaise);
  }

  // Check coupon discount against gross order value before reserving stock or locking coupons
  const grossCart = await calculateCart(input.items, { couponDiscountPaise: 0 });
  const grossOrderValuePaise =
    grossCart.itemsTotalPaise + grossCart.taxPaise + grossCart.shippingFeePaise;

  if (couponDiscountPaise > grossOrderValuePaise) {
    throw new DomainError(
      `Coupon discount of ₹${(couponDiscountPaise / 100).toFixed(2)} exceeds gross order value of ₹${(grossOrderValuePaise / 100).toFixed(2)}. In order to protect coupon value and prevent loss of unspent balance, coupons exceeding order total cannot be applied.`,
      400,
      "COUPON_OVERCOVERAGE_PROHIBITED",
    );
  }

  const cartSummary = await calculateCart(input.items, { couponDiscountPaise });

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

  // 3. Generate stable human-readable order reference & stock expiry
  const orderRef = await generateOrderRef();
  const reservationMinutes = input.reservationMinutes ?? 15;
  const stockReservationExpiresAt = new Date(
    Date.now() + reservationMinutes * 60 * 1000,
  );

  // 4. Atomically lock native store coupons into checkout reservation
  const storeCoupons = authoritativeCoupons
    ? authoritativeCoupons.coupons.filter((c) => c.source === "STORE")
    : [];
  const lockedStoreCodes: string[] = [];

  if (storeCoupons.length > 0) {
    const { getStoreCouponModel, StoreCouponStatus } = await import(
      "../models/StoreCoupon"
    );
    const StoreCoupon = getStoreCouponModel(db);

    for (const sc of storeCoupons) {
      const locked = await StoreCoupon.findOneAndUpdate(
        {
          couponCode: sc.code,
          $or: [
            { status: StoreCouponStatus.ACTIVE },
            {
              status: StoreCouponStatus.LOCKED_IN_CHECKOUT,
              lockedExpiresAt: { $lt: new Date() },
            },
          ],
        },
        {
          $set: {
            status: StoreCouponStatus.LOCKED_IN_CHECKOUT,
            lockedOrderRef: orderRef,
            lockedExpiresAt: stockReservationExpiresAt,
          },
        },
        { returnDocument: "after" },
      );

      if (!locked) {
        // Rollback any previously locked coupons in this order
        if (lockedStoreCodes.length > 0) {
          await StoreCoupon.updateMany(
            { couponCode: { $in: lockedStoreCodes } },
            {
              $set: {
                status: StoreCouponStatus.ACTIVE,
                lockedOrderRef: null,
                lockedExpiresAt: null,
              },
            },
          );
        }
        // Rollback reserved inventory
        for (const item of reservedItems) {
          try {
            await releaseProductInventory({
              productId: item.productId,
              quantity: item.quantity,
            });
          } catch {}
        }
        throw new DomainError(
          `Native store coupon '${sc.code}' is currently locked in another checkout session or no longer active.`,
          409,
          "COUPON_ALREADY_LOCKED",
        );
      }
      lockedStoreCodes.push(sc.code);
    }
  }

  // 5. Explicit tender accounting breakdown
  let settledStoreCouponsPaise = 0;
  let settledBhavikaCouponsPaise = 0;
  if (authoritativeCoupons) {
    for (const c of authoritativeCoupons.coupons) {
      if (c.source === "STORE") {
        settledStoreCouponsPaise += c.valuePaise;
      } else {
        settledBhavikaCouponsPaise += c.valuePaise;
      }
    }
  }

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
    couponDiscountPaise: cartSummary.couponDiscountPaise,
    settledStoreCouponsPaise,
    settledBhavikaCouponsPaise,
    netPayablePaise: cartSummary.totalPayablePaise,
    paidCashPaise: 0,
    deficitPaise: 0,
    status: "PENDING_PAYMENT",
    paymentStatus: "UNPAID",
    stockReservationExpiresAt,
  });

  const savedOrder = await order.save();

  // 6. Register external coupons if applied
  if (authoritativeCoupons && authoritativeCoupons.coupons.length > 0) {
    const externalCoupons = authoritativeCoupons.coupons.filter(
      (c) => c.source === "BHAVIKA" || c.source === "CUSTOM",
    );
    if (externalCoupons.length > 0) {
      const { registerExternalCouponsForOrder } = await import(
        "./checkout.service"
      );
      await registerExternalCouponsForOrder({
        orderRef,
        orderId: savedOrder._id.toString(),
        memberId: input.memberId,
        coupons: externalCoupons.map((c) => ({
          code: c.code,
          valueRupees: c.valueRupees,
          discountAppliedPaise: c.valuePaise,
        })),
      });
    }
  }

  // 7. Zero-cash checkout settlement for 100% coupon-covered orders
  if (savedOrder.netPayablePaise === 0 && authoritativeCoupons && authoritativeCoupons.coupons.length > 0) {
    const { processZeroCashCouponCheckout } = await import("./checkout.service");
    const zeroCashRes = await processZeroCashCouponCheckout({
      orderRef,
      redeemer: input.couponRedeemer,
    });
    return zeroCashRes.order;
  }

  return savedOrder;
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
  paymentStatus?: OrderPaymentStatus;
  refundRequiredPaise?: number;
  refundedPaise?: number;
  refundId?: string;
  refundedAt?: Date;
  session?: ClientSession;
}): Promise<IStoreOrderDoc> {
  const {
    orderRef,
    targetStatus,
    notes,
    cancellationReason,
    deficitPaise,
    paidCashPaise,
    paymentStatus,
    refundRequiredPaise,
    refundedPaise,
    refundId,
    refundedAt,
    session,
  } = params;

  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);

  const current = await Order.findOne({ orderRef }).session(session ?? null);
  if (!current) {
    throw new Error(`Order ${orderRef} not found`);
  }

  // Check valid transitions (allow idempotent updates within same status e.g. updating notes or deficit amount)
  if (targetStatus !== current.status) {
    const allowed = VALID_ORDER_TRANSITIONS[current.status];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new Error(
        `Illegal order transition: cannot transition order ${orderRef} from '${current.status}' to '${targetStatus}'`,
      );
    }
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
    if (
      current.status === "PENDING_PAYMENT" &&
      current.stockReservationExpiresAt &&
      current.stockReservationExpiresAt < new Date()
    ) {
      throw new DomainError(
        `Cannot fulfill order ${orderRef}: stock reservation expired at ${current.stockReservationExpiresAt.toISOString()}. Payment must be refunded.`,
        409,
        "ORDER_EXPIRED_PAYMENT_REFUND_REQUIRED",
      );
    }
    if (current.settledStoreCouponsPaise > 0) {
      const { getStoreCouponModel, StoreCouponStatus } = await import(
        "../models/StoreCoupon"
      );
      const StoreCoupon = getStoreCouponModel(db);
      const lockedCoupons = await StoreCoupon.find({
        lockedOrderRef: orderRef,
        status: StoreCouponStatus.LOCKED_IN_CHECKOUT,
      }).session(session ?? null);
      const lockedTotal = lockedCoupons.reduce((sum, c) => sum + c.faceValuePaise, 0);
      if (lockedTotal < current.settledStoreCouponsPaise) {
        throw new DomainError(
          `Cannot fulfill order ${orderRef}: native coupon reservation expired and was reclaimed by another session. Order cannot transition to PAID. Payment must be refunded.`,
          409,
          "NATIVE_COUPON_RESERVATION_LOST",
        );
      }
    }

    if (paymentStatus) {
      updateFields.paymentStatus = paymentStatus;
    } else if (current.netPayablePaise === 0) {
      updateFields.paymentStatus = "SETTLED_COUPONS";
    } else {
      updateFields.paymentStatus = "CAPTURED";
      if (typeof paidCashPaise !== "number") {
        updateFields.paidCashPaise = current.netPayablePaise;
      }
    }
    updateFields.paidAt = new Date();
  } else if (
    targetStatus === "CANCELLED" ||
    targetStatus === "CANCELLED_PARTIAL_COUPON_CONSUMED"
  ) {
    updateFields.cancelledAt = new Date();
    if (!paymentStatus && current.paidCashPaise > 0) {
      updateFields.paymentStatus = "REFUND_PENDING";
      updateFields.refundRequiredPaise = current.paidCashPaise;
    }
  } else if (targetStatus === "EXPIRED") {
    if (!paymentStatus && (current.paidCashPaise > 0 || (typeof paidCashPaise === "number" && paidCashPaise > 0))) {
      updateFields.paymentStatus = "REFUND_PENDING";
      updateFields.refundRequiredPaise = typeof paidCashPaise === "number" ? paidCashPaise : current.paidCashPaise;
    }
  } else if (targetStatus === "REFUNDED") {
    updateFields.paymentStatus = "REFUNDED";
    updateFields.refundedAt = refundedAt || new Date();
    if (typeof refundedPaise === "number") {
      updateFields.refundedPaise = refundedPaise;
    } else if (current.paidCashPaise > 0) {
      updateFields.refundedPaise = current.paidCashPaise;
    }
  }

  if (paymentStatus) {
    updateFields.paymentStatus = paymentStatus;
  }
  if (typeof refundRequiredPaise === "number") {
    updateFields.refundRequiredPaise = refundRequiredPaise;
  }
  if (typeof refundedPaise === "number") {
    updateFields.refundedPaise = refundedPaise;
  }
  if (refundId) {
    updateFields.refundId = refundId;
  }
  if (refundedAt) {
    updateFields.refundedAt = refundedAt;
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

  // Handle inventory and native coupon side-effects
  if (targetStatus === "PAID") {
    // 1. Permanently fulfill reserved inventory
    for (const item of updated.items) {
      await fulfillProductInventory({
        productId: item.productId,
        quantity: item.quantity,
        session,
      });
    }

    // 2. Finalize locked native store coupons to REDEEMED
    try {
      const { getStoreCouponModel, StoreCouponStatus } = await import(
        "../models/StoreCoupon"
      );
      const StoreCoupon = getStoreCouponModel(db);
      await StoreCoupon.updateMany(
        {
          lockedOrderRef: orderRef,
          status: StoreCouponStatus.LOCKED_IN_CHECKOUT,
        },
        {
          $set: {
            status: StoreCouponStatus.REDEEMED,
            redeemedAt: new Date(),
            redeemedOrderRef: orderRef,
            lockedOrderRef: null,
            lockedExpiresAt: null,
          },
        },
        { session },
      );
    } catch (err) {
      console.error(`[Order] Failed to finalize locked store coupons for ${orderRef}:`, err);
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
    targetStatus === "CANCELLED" ||
    targetStatus === "CANCELLED_PARTIAL_COUPON_CONSUMED" ||
    targetStatus === "EXPIRED"
  ) {
    if (
      current.status === "PENDING_PAYMENT" ||
      current.status === "PROCESSING_COUPONS" ||
      current.status === "PARTIAL_COUPON_REDEMPTION_DEFICIT"
    ) {
      // 1. Release reserved inventory back to available pool
      for (const item of updated.items) {
        await releaseProductInventory({
          productId: item.productId,
          quantity: item.quantity,
          session,
        });
      }

      // 2. Release locked native store coupons back to ACTIVE
      try {
        const { getStoreCouponModel, StoreCouponStatus } = await import(
          "../models/StoreCoupon"
        );
        const StoreCoupon = getStoreCouponModel(db);
        await StoreCoupon.updateMany(
          {
            lockedOrderRef: orderRef,
            status: StoreCouponStatus.LOCKED_IN_CHECKOUT,
          },
          {
            $set: {
              status: StoreCouponStatus.ACTIVE,
              lockedOrderRef: null,
              lockedExpiresAt: null,
            },
          },
          { session },
        );
      } catch (err) {
        console.error(`[Order] Failed to release locked store coupons for ${orderRef}:`, err);
      }

      // 3. Compensating store credit for consumed external Bhavika coupons
      if (targetStatus === "CANCELLED_PARTIAL_COUPON_CONSUMED") {
        try {
          const { getExternalCouponRedemptionModel } = await import(
            "../models/ExternalCouponRedemption"
          );
          const ExternalCoupon = getExternalCouponRedemptionModel(db);
          const redeemedCoupons = await ExternalCoupon.find({
            orderRef,
            status: "REDEEMED",
          }).session(session ?? null);

          const totalConsumedExternalPaise = redeemedCoupons.reduce(
            (sum, c) => sum + (c.discountAppliedPaise || c.valuePaise || 0),
            0,
          );

          if (totalConsumedExternalPaise > 0) {
            const isPolicyApproved =
              process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION === "true";

            if (!isPolicyApproved) {
              const gatedNote = `[GATED] Wallet compensation for ₹${(totalConsumedExternalPaise / 100).toFixed(2)} is pending client policy approval.`;
              updated.compensationStatus = "AWAITING_CLIENT_POLICY_APPROVAL";
              updated.notes = updated.notes ? `${updated.notes}; ${gatedNote}` : gatedNote;
              await Order.updateOne(
                { _id: updated._id },
                {
                  $set: {
                    compensationStatus: "AWAITING_CLIENT_POLICY_APPROVAL",
                    notes: updated.notes,
                  },
                },
                { session },
              );
            } else {
              const { mutateStoreWallet } = await import("./wallet-ledger.service");
              await mutateStoreWallet({
                memberId: updated.memberId,
                walletType: "ADD_MONEY",
                type: "CREDIT",
                unit: "INR_PAISE",
                amountPaise: totalConsumedExternalPaise,
                referenceType: "ORDER_REFUND",
                referenceId: orderRef,
                idempotencyKey: `comp-credit:${orderRef}`,
                description: `Compensating store credit for consumed Bhavika coupon(s) on cancelled order ${orderRef}`,
                metadata: {
                  orderRef,
                  consumedCoupons: redeemedCoupons.map((c) => ({
                    code: c.code,
                    valuePaise: c.discountAppliedPaise,
                  })),
                },
                session,
              });

              updated.compensationStatus = "COMPENSATED";
              await Order.updateOne(
                { _id: updated._id },
                { $set: { compensationStatus: "COMPENSATED" } },
                { session },
              );
            }
          }
        } catch (compErr) {
          console.error(`[Order] Failed to issue compensating credit for ${orderRef}:`, compErr);
          updated.compensationStatus = "FAILED";
          try {
            await Order.updateOne(
              { _id: updated._id },
              { $set: { compensationStatus: "FAILED" } },
              { session },
            );
          } catch {}
        }
      }
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

/**
 * Retries/recovers pending or failed wallet compensation for a cancelled order
 * once client policy approval is enabled.
 */
export async function recoverOrderCompensation(orderRef: string): Promise<{
  success: boolean;
  compensatedPaise: number;
  isReplay: boolean;
}> {
  const isPolicyApproved =
    process.env.ENABLE_CANCELLED_COUPON_WALLET_COMPENSATION === "true";
  if (!isPolicyApproved) {
    throw new DomainError(
      "Automated cancellation wallet compensation policy has not been formally approved by the client.",
      403,
      "COMPENSATION_POLICY_NOT_APPROVED",
    );
  }

  const db = await getStoreDb();
  const Order = getStoreOrderModel(db);
  const order = await Order.findOne({ orderRef });
  if (!order) {
    throw new Error(`Order ${orderRef} not found`);
  }

  if (order.status !== "CANCELLED_PARTIAL_COUPON_CONSUMED") {
    throw new Error(
      `Order ${orderRef} is in '${order.status}' status, not CANCELLED_PARTIAL_COUPON_CONSUMED`,
    );
  }

  const { getExternalCouponRedemptionModel } = await import(
    "../models/ExternalCouponRedemption"
  );
  const ExternalCoupon = getExternalCouponRedemptionModel(db);
  const redeemedCoupons = await ExternalCoupon.find({
    orderRef,
    status: "REDEEMED",
  });
  const totalConsumedExternalPaise = redeemedCoupons.reduce(
    (sum, c) => sum + (c.discountAppliedPaise || c.valuePaise || 0),
    0,
  );

  if (totalConsumedExternalPaise === 0) {
    return { success: true, compensatedPaise: 0, isReplay: false };
  }

  const { mutateStoreWallet } = await import("./wallet-ledger.service");
  const res = await mutateStoreWallet({
    memberId: order.memberId,
    walletType: "ADD_MONEY",
    type: "CREDIT",
    unit: "INR_PAISE",
    amountPaise: totalConsumedExternalPaise,
    referenceType: "ORDER_REFUND",
    referenceId: orderRef,
    idempotencyKey: `comp-credit:${orderRef}`,
    description: `Compensating store credit for consumed Bhavika coupon(s) on cancelled order ${orderRef}`,
    metadata: {
      orderRef,
      consumedCoupons: redeemedCoupons.map((c) => ({
        code: c.code,
        valuePaise: c.discountAppliedPaise,
      })),
    },
  });

  await Order.updateOne(
    { _id: order._id },
    { $set: { compensationStatus: "COMPENSATED" } },
  );

  return {
    success: true,
    compensatedPaise: totalConsumedExternalPaise,
    isReplay: res.isReplay,
  };
}

