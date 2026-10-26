import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import {
  getExternalCouponRedemptionModel,
  IExternalCouponRedemptionDoc,
} from "../models/ExternalCouponRedemption";
import { getStorePaymentAttemptModel } from "../models/StorePaymentAttempt";
import { getStoreOrderByRef, transitionOrderStatus } from "./order.service";
import { IStoreOrderDoc } from "../models/StoreOrder";
import { redeemBhavikaCoupon } from "./bhavika-client.service";
import { evaluateMemberTierQualification } from "./membership.service";
import { calculateOrderDirectCommission } from "./commission.service";

export type BhavikaCouponRedeemer = (
  code: string,
  orderRef: string,
) => Promise<{ success: boolean; error?: string; isReplay?: boolean }>;

/**
 * Registers validated external Bhavika coupons against an order prior to checkout.
 */
export async function registerExternalCouponsForOrder(params: {
  orderRef: string;
  orderId?: string | Types.ObjectId;
  memberId: string | Types.ObjectId;
  coupons: {
    code: string;
    valueRupees: number;
    discountAppliedPaise: number;
    metadata?: Record<string, unknown>;
  }[];
}): Promise<IExternalCouponRedemptionDoc[]> {
  const { orderRef, orderId, memberId, coupons } = params;
  const db = await getStoreDb();
  const ExternalCoupon = getExternalCouponRedemptionModel(db);
  await ExternalCoupon.init();

  const registered: IExternalCouponRedemptionDoc[] = [];

  for (const c of coupons) {
    const code = c.code.toUpperCase().trim();
    const existing = await ExternalCoupon.findOne({ orderRef, code });
    if (existing) {
      throw new Error(
        `Coupon ${code} is already registered on order ${orderRef}`,
      );
    }

    const valuePaise = c.valueRupees * 100;
    const doc = new ExternalCoupon({
      orderRef,
      orderId: orderId ? new Types.ObjectId(orderId.toString()) : undefined,
      memberId: new Types.ObjectId(memberId.toString()),
      code,
      status: "VALIDATED",
      valueRupees: c.valueRupees,
      valuePaise,
      discountAppliedPaise: c.discountAppliedPaise,
      validatedAt: new Date(),
      metadata: c.metadata,
    });
    const saved = await doc.save();
    registered.push(saved);
  }

  return registered;
}

/**
 * Post-payment checkout coordinator.
 * Upon verified payment success:
 * 1. Checks if external Bhavika coupons were applied.
 * 2. If coupons applied, transitions order to PROCESSING_COUPONS and attempts redemption.
 * 3. If all coupons redeem cleanly -> marks order PAID (fulfilling inventory).
 * 4. If any coupon fails -> marks order PARTIAL_COUPON_REDEMPTION_DEFICIT with deficit amount.
 *    Goods are never fulfilled while deficit exists.
 */
export async function processPostPaymentCheckout(params: {
  orderRef: string;
  paymentAttemptId: string | Types.ObjectId;
  redeemer?: BhavikaCouponRedeemer;
}): Promise<{
  order: IStoreOrderDoc;
  status: "PAID" | "PARTIAL_COUPON_REDEMPTION_DEFICIT";
  deficitPaise: number;
  redeemedCoupons: string[];
  failedCoupons: string[];
}> {
  const { orderRef, paymentAttemptId, redeemer } = params;

  const db = await getStoreDb();
  const PaymentAttempt = getStorePaymentAttemptModel(db);
  const ExternalCoupon = getExternalCouponRedemptionModel(db);

  // 1. Verify payment attempt is SUCCESS
  const payment = await PaymentAttempt.findById(
    new Types.ObjectId(paymentAttemptId.toString()),
  );
  if (!payment || payment.status !== "SUCCESS") {
    throw new Error(
      `Cannot process post-payment checkout: payment attempt is not in SUCCESS status`,
    );
  }

  // 2. Retrieve order
  const order = await getStoreOrderByRef(orderRef);
  if (!order) {
    throw new Error(`Order ${orderRef} not found`);
  }

  // Safety guard: Cannot fulfill an order whose stock reservation has expired or was cancelled
  if (order.status === "EXPIRED" || order.status === "CANCELLED") {
    throw new Error(
      `Order ${orderRef} is in '${order.status}' status (stock reservation expired or order was cancelled). Payment must be refunded.`,
    );
  }

  // 3. Check for external coupons
  const coupons = await ExternalCoupon.find({ orderRef });

  if (coupons.length === 0) {
    // Pure cash payment: directly transition to PAID
    const paidOrder = await transitionOrderStatus({
      orderRef,
      targetStatus: "PAID",
      paidCashPaise: payment.amountPaise,
    });
    return {
      order: paidOrder,
      status: "PAID",
      deficitPaise: 0,
      redeemedCoupons: [],
      failedCoupons: [],
    };
  }

  // Only transition to PROCESSING_COUPONS if coming from PENDING_PAYMENT
  if (order.status === "PENDING_PAYMENT") {
    await transitionOrderStatus({
      orderRef,
      targetStatus: "PROCESSING_COUPONS",
      paidCashPaise: payment.amountPaise,
    });
  }

  const redeemedCoupons: string[] = [];
  const failedCoupons: string[] = [];
  let deficitPaise = 0;

  // 4. Sequentially redeem each pending Bhavika coupon
  for (const coupon of coupons) {
    if (coupon.status === "REDEEMED") {
      redeemedCoupons.push(coupon.code);
      continue;
    }

    try {
      const redeemFn: BhavikaCouponRedeemer =
        redeemer ||
        (async (c, ref) => {
          return await redeemBhavikaCoupon(c, ref);
        });

      const result = await redeemFn(coupon.code, orderRef);

      if (result.success) {
        coupon.status = "REDEEMED";
        coupon.redeemedAt = new Date();
        coupon.isReplay = Boolean(result.isReplay);
        await coupon.save();
        redeemedCoupons.push(coupon.code);
      } else {
        coupon.status = "FAILED";
        coupon.lastRedeemError = result.error || "Redemption failed at upstream";
        await coupon.save();
        failedCoupons.push(coupon.code);
        deficitPaise += coupon.discountAppliedPaise;
      }
    } catch (err: unknown) {
      coupon.status = "FAILED";
      coupon.lastRedeemError =
        err instanceof Error ? err.message : "Network/execution error";
      await coupon.save();
      failedCoupons.push(coupon.code);
      deficitPaise += coupon.discountAppliedPaise;
    }
  }

  // 5. Check outcome
  if (failedCoupons.length > 0) {
    // Partial or total coupon failure -> record deficit
    const deficitOrder = await transitionOrderStatus({
      orderRef,
      targetStatus: "PARTIAL_COUPON_REDEMPTION_DEFICIT",
      deficitPaise,
      notes: `Deficit of ₹${(deficitPaise / 100).toFixed(2)} due to failure of coupon(s): ${failedCoupons.join(", ")}`,
    });

    return {
      order: deficitOrder,
      status: "PARTIAL_COUPON_REDEMPTION_DEFICIT",
      deficitPaise,
      redeemedCoupons,
      failedCoupons,
    };
  }

  // All coupons successfully redeemed -> mark PAID
  const paidOrder = await transitionOrderStatus({
    orderRef,
    targetStatus: "PAID",
  });

  // Phase C: Tier qualification & Direct Sponsor Commission calculation
  try {
    await evaluateMemberTierQualification({
      memberId: order.memberId,
      orderRef,
      orderAmountPaise: order.itemsTotalPaise,
    });

    await calculateOrderDirectCommission({
      orderRef,
      purchasingMemberId: order.memberId,
      itemsTotalPaise: order.itemsTotalPaise,
      couponDiscountPaise: order.couponDiscountPaise,
    });
  } catch (err) {
    console.error("[Phase C] Post-paid commission/qualification error:", err);
  }

  // Phase D: Process referral reward for immediate sponsor if applicable (exactly-once)
  try {
    const { getStoreMemberModel } = await import("../models/StoreMember");
    const { processStoreReferralReward } = await import("./referral.service");
    const MemberModel = getStoreMemberModel(db);
    const buyer = await MemberModel.findById(order.memberId);
    if (buyer && buyer.sponsorId) {
      const sponsor = await MemberModel.findOne({ memberId: buyer.sponsorId });
      if (sponsor) {
        await processStoreReferralReward({
          sponsorMemberId: sponsor._id,
          referredMemberId: buyer._id,
          eventRef: orderRef,
        });
      }
    }
  } catch (err) {
    console.error("[Phase D] Post-paid referral reward error:", err);
  }

  return {
    order: paidOrder,
    status: "PAID",
    deficitPaise: 0,
    redeemedCoupons,
    failedCoupons: [],
  };
}
