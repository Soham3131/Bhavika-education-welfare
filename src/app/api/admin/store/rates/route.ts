import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  getBullionRates,
  updateBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import { z } from "zod";

const ratesSchema = z.object({
  goldRatePerGramRupees: z.number().positive("Gold rate must be positive"),
  silverRatePerGramRupees: z.number().positive("Silver rate must be positive"),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const rates = await getBullionRates();
  return ok({
    rates: {
      goldRatePerGramRupees: rates.goldRatePerGramPaise / 100,
      silverRatePerGramRupees: rates.silverRatePerGramPaise / 100,
      lastUpdated: rates.lastUpdated,
    },
  });
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = ratesSchema.parse(body);

  const updated = await updateBullionRates({
    adminId: admin.id,
    goldRatePerGramPaise: Math.round(parsed.goldRatePerGramRupees * 100),
    silverRatePerGramPaise: Math.round(parsed.silverRatePerGramRupees * 100),
  });

  return ok({
    message: `Daily bullion rates updated! Gold: ₹${parsed.goldRatePerGramRupees}/g, Silver: ₹${parsed.silverRatePerGramRupees}/g`,
    rates: {
      goldRatePerGramRupees: updated.goldRatePerGramPaise / 100,
      silverRatePerGramRupees: updated.silverRatePerGramPaise / 100,
      lastUpdated: updated.lastUpdated,
    },
  });
});
