import { handle, ok, fail } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import {
  submitRechargeOrder,
  listMemberRecharges,
} from "@/server/store/services/recharge.service";
import {
  getRechargeProvider,
} from "@/server/store/services/recharge-provider";
import {
  RechargeServiceType,
} from "@/server/store/models/StoreRechargeOrder";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreWalletModel } from "@/server/store/models/StoreWallet";
import { Types } from "mongoose";
import { z } from "zod";

const submitRechargeSchema = z.object({
  serviceType: z.enum([
    "MOBILE_PREPAID",
    "DTH",
    "FASTAG",
    "ELECTRICITY",
    "GAS",
    "WATER",
  ]),
  operator: z.string().trim().min(2, "Operator code required"),
  consumerNumber: z.string().trim().min(4, "Valid consumer number required"),
  circle: z.string().trim().optional(),
  amountRupees: z.number().int().min(1, "Minimum recharge is ₹1"),
});

export const GET = handle(async (req) => {
  const session = await requireStoreMember();
  const url = new URL(req.url);
  const service = (url.searchParams.get("service") as RechargeServiceType) || "MOBILE_PREPAID";
  const operator = url.searchParams.get("operator");

  const provider = getRechargeProvider();
  const operators = await provider.fetchOperators(service);
  const plans = operator ? await provider.fetchPlans(operator) : [];

  const [history, db] = await Promise.all([
    listMemberRecharges(session.memberId),
    getStoreDb(),
  ]);

  const WalletModel = getStoreWalletModel(db);
  const wallet = await WalletModel.findOne({
    member: new Types.ObjectId(session.memberId),
  }).lean();

  return ok({
    service,
    operators,
    plans,
    history,
    walletBalancePaise: (wallet?.addMoneyPaise || 0) + (wallet?.rechargePaise || 0),
    walletBalanceRupees:
      ((wallet?.addMoneyPaise || 0) + (wallet?.rechargePaise || 0)) / 100,
  });
});

export const POST = handle(async (req) => {
  const session = await requireStoreMember();
  const body = await req.json();
  const parsed = submitRechargeSchema.parse(body);

  const amountPaise = parsed.amountRupees * 100;
  const result = await submitRechargeOrder({
    memberId: session.memberId,
    serviceType: parsed.serviceType,
    operator: parsed.operator,
    consumerNumber: parsed.consumerNumber,
    circle: parsed.circle,
    amountPaise,
  });

  if (result.status === "FAILED") {
    return fail(
      result.order.failureReason || "Recharge could not be processed. Your money has been refunded to your wallet.",
      400,
      { code: "RECHARGE_FAILED" },
    );
  }

  return ok({
    message:
      result.status === "SUCCESS"
        ? `Recharge of ₹${parsed.amountRupees} to ${parsed.consumerNumber} successful! Commission earned: ₹${(result.memberCommissionPaise / 100).toFixed(2)}`
        : `Recharge submitted! Awaiting operator confirmation. Reference: ${result.order.rechargeRef}`,
    order: result.order,
    status: result.status,
    commissionRupees: result.memberCommissionPaise / 100,
  });
});
