import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import {
  getBullionRates,
  updateBullionRates,
} from "@/server/store/services/jewellery-pricing.service";
import {
  getStoreSettings,
  updateStoreSettings,
} from "@/server/store/services/settings.service";
import { StoreSettings } from "@/lib/validation/store-settings";
import { AdminAuditLog } from "@/server/models";
import { Types } from "mongoose";
import { z } from "zod";

export const runtime = "nodejs";

const updateRatesAndSettingsSchema = z.object({
  goldRatePerGramRupees: z.number().positive().optional(),
  silverRatePerGramRupees: z.number().positive().optional(),
  goldMakingChargePerGramRupees: z.number().min(0).optional(),
  silverMakingChargePerGramRupees: z.number().min(0).optional(),
  metalGstRateBasisPoints: z.number().min(0).max(2800).optional(),
  makingGstRateBasisPoints: z.number().min(0).max(2800).optional(),
  stoneGstRateBasisPoints: z.number().min(0).max(2800).optional(),
  caApprovalConfirmed: z.boolean().optional(),
  codEnabled: z.boolean().optional(),
  maxOrderAmountRupees: z.number().min(0).optional(),
});

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const rates = await getBullionRates();
  const settings = await getStoreSettings();

  return ok({
    rates: {
      goldRatePerGramRupees: rates.goldRatePerGramPaise / 100,
      silverRatePerGramRupees: rates.silverRatePerGramPaise / 100,
      goldMakingChargePerGramRupees: settings.jewellery.goldMakingChargePerGramPaise / 100,
      silverMakingChargePerGramRupees: settings.jewellery.silverMakingChargePerGramPaise / 100,
      metalGstRateBasisPoints: settings.jewellery.metalGstRateBasisPoints,
      makingGstRateBasisPoints: settings.jewellery.makingGstRateBasisPoints,
      stoneGstRateBasisPoints: settings.jewellery.stoneGstRateBasisPoints,
      caApprovalConfirmed: settings.jewellery.caApprovalConfirmed,
      codEnabled: settings.cod.codEnabled,
      maxOrderAmountRupees: settings.cod.maxOrderAmountPaise / 100,
      lastUpdated: rates.lastUpdated,
    },
  });
});

export const POST = handle(async (req) => {
  const admin = await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const body = await req.json();
  const parsed = updateRatesAndSettingsSchema.parse(body);

  if (
    parsed.goldRatePerGramRupees !== undefined &&
    parsed.silverRatePerGramRupees !== undefined
  ) {
    await updateBullionRates({
      adminId: admin.id,
      goldRatePerGramPaise: Math.round(parsed.goldRatePerGramRupees * 100),
      silverRatePerGramPaise: Math.round(parsed.silverRatePerGramRupees * 100),
    });
  }

  const jewelleryUpdates: Partial<StoreSettings["jewellery"]> = {};
  if (parsed.goldMakingChargePerGramRupees !== undefined) {
    jewelleryUpdates.goldMakingChargePerGramPaise = Math.round(
      parsed.goldMakingChargePerGramRupees * 100,
    );
  }
  if (parsed.silverMakingChargePerGramRupees !== undefined) {
    jewelleryUpdates.silverMakingChargePerGramPaise = Math.round(
      parsed.silverMakingChargePerGramRupees * 100,
    );
  }
  if (parsed.metalGstRateBasisPoints !== undefined) {
    jewelleryUpdates.metalGstRateBasisPoints = parsed.metalGstRateBasisPoints;
  }
  if (parsed.makingGstRateBasisPoints !== undefined) {
    jewelleryUpdates.makingGstRateBasisPoints = parsed.makingGstRateBasisPoints;
  }
  if (parsed.stoneGstRateBasisPoints !== undefined) {
    jewelleryUpdates.stoneGstRateBasisPoints = parsed.stoneGstRateBasisPoints;
  }
  if (parsed.caApprovalConfirmed !== undefined) {
    jewelleryUpdates.caApprovalConfirmed = parsed.caApprovalConfirmed;
  }

  const codUpdates: Partial<StoreSettings["cod"]> = {};
  if (parsed.codEnabled !== undefined) {
    codUpdates.codEnabled = parsed.codEnabled;
  }
  if (parsed.maxOrderAmountRupees !== undefined) {
    codUpdates.maxOrderAmountPaise = Math.round(parsed.maxOrderAmountRupees * 100);
  }

  if (Object.keys(jewelleryUpdates).length > 0 || Object.keys(codUpdates).length > 0) {
    await updateStoreSettings({
      ...(Object.keys(jewelleryUpdates).length > 0 ? { jewellery: jewelleryUpdates } : {}),
      ...(Object.keys(codUpdates).length > 0 ? { cod: codUpdates } : {}),
    });

    await AdminAuditLog.create({
      admin: new Types.ObjectId(admin.id),
      action: "JEWELLERY_SETTINGS_UPDATE",
      targetType: "STORE_SETTINGS",
      meta: {
        jewelleryUpdates,
        codUpdates,
      },
    });
  }

  const updatedRates = await getBullionRates();
  const updatedSettings = await getStoreSettings();

  return ok({
    message: "Store bullion rates and jewellery settings updated successfully.",
    rates: {
      goldRatePerGramRupees: updatedRates.goldRatePerGramPaise / 100,
      silverRatePerGramRupees: updatedRates.silverRatePerGramPaise / 100,
      goldMakingChargePerGramRupees:
        updatedSettings.jewellery.goldMakingChargePerGramPaise / 100,
      silverMakingChargePerGramRupees:
        updatedSettings.jewellery.silverMakingChargePerGramPaise / 100,
      metalGstRateBasisPoints: updatedSettings.jewellery.metalGstRateBasisPoints,
      makingGstRateBasisPoints: updatedSettings.jewellery.makingGstRateBasisPoints,
      stoneGstRateBasisPoints: updatedSettings.jewellery.stoneGstRateBasisPoints,
      caApprovalConfirmed: updatedSettings.jewellery.caApprovalConfirmed,
      codEnabled: updatedSettings.cod.codEnabled,
      maxOrderAmountRupees: updatedSettings.cod.maxOrderAmountPaise / 100,
      lastUpdated: updatedRates.lastUpdated,
    },
  });
});
