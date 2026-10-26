import { handle, ok } from "@/server/http";
import {
  calculateJewelleryPrice,
  getBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import { z } from "zod";

const quoteSchema = z.object({
  metalType: z.enum(["GOLD", "SILVER"]),
  grossWeightGrams: z.number().positive("Weight must be positive"),
  stoneWeightGrams: z.number().nonnegative().optional(),
  makingChargeType: z.enum(["PER_GRAM", "PERCENTAGE"]).optional(),
  makingChargeValue: z.number().nonnegative().optional(),
  stoneChargePaise: z.number().nonnegative().optional(),
  requireFinalApproval: z.boolean().optional(),
});

export const GET = handle(async () => {
  const rates = await getBullionRates();
  return ok({ rates });
});

export const POST = handle(async (req) => {
  const body = await req.json();
  const parsed = quoteSchema.parse(body);

  const quote = await calculateJewelleryPrice(
    {
      metalType: parsed.metalType,
      grossWeightGrams: parsed.grossWeightGrams,
      stoneWeightGrams: parsed.stoneWeightGrams,
      makingChargeType: parsed.makingChargeType,
      makingChargeValue: parsed.makingChargeValue,
      stoneChargePaise: parsed.stoneChargePaise,
    },
    { requireCaApproval: parsed.requireFinalApproval },
  );

  return ok({ quote });
});
