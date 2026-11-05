import "server-only";
import { Types } from "mongoose";
import { getStoreDb } from "../db/connect";
import { getStoreSettingsModel } from "../models/StoreSettings";
import { AdminAuditLog } from "@/server/models";
import { DomainError } from "@/server/errors";

export interface BullionRates {
  goldRatePerGramPaise: number; // e.g. 750000 = ₹7,500.00 / gram
  silverRatePerGramPaise: number; // e.g. 9500 = ₹95.00 / gram
  lastUpdated: Date;
}

// In-memory cache for live bullion rates (default fallback)
let currentRates: BullionRates = {
  goldRatePerGramPaise: 750000, // ₹7,500/g
  silverRatePerGramPaise: 9500, // ₹95/g
  lastUpdated: new Date(),
};

export interface JewelleryPricingInput {
  metalType: "GOLD" | "SILVER";
  grossWeightGrams: number;
  stoneWeightGrams?: number;
  makingChargeType?: "PER_GRAM" | "PERCENTAGE";
  makingChargeValue?: number; // per gram in paise (e.g. 45000 = ₹450/g) OR percentage (e.g. 12 = 12%)
  stoneChargePaise?: number;
}

export interface JewelleryPriceBreakdown {
  metalType: "GOLD" | "SILVER";
  ratePerGramPaise: number;
  grossWeightGrams: number;
  netWeightGrams: number;
  metalValuePaise: number;
  makingChargesPaise: number;
  stoneChargePaise: number;
  subtotalBeforeGstPaise: number;
  metalGstPaise: number;
  makingGstPaise: number;
  stoneGstPaise: number;
  totalGstPaise: number;
  totalPricePaise: number;
  totalPriceRupees: number;
  rateTimestamp: Date;
  priceLockedUntil: Date;
  caApprovalConfirmed: boolean;
  pricingStatus: "ESTIMATE_PENDING_CA_APPROVAL" | "APPROVED_FINAL_PRICE";
}

/**
 * Returns current bullion rates.
 */
export async function getBullionRates(): Promise<BullionRates> {
  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);
  const settings = await SettingsModel.findOne();

  if (settings) {
    const raw = settings as unknown as Record<string, unknown>;
    if (typeof raw.goldRatePerGramPaise === "number") {
      currentRates = {
        goldRatePerGramPaise: raw.goldRatePerGramPaise,
        silverRatePerGramPaise:
          typeof raw.silverRatePerGramPaise === "number"
            ? raw.silverRatePerGramPaise
            : 9500,
        lastUpdated:
          raw.bullionRatesUpdatedAt instanceof Date
            ? raw.bullionRatesUpdatedAt
            : new Date(),
      };
    }
  }

  return currentRates;
}

/**
 * Updates daily gold and silver rates with admin audit log.
 */
export async function updateBullionRates(input: {
  adminId: string | Types.ObjectId;
  goldRatePerGramPaise: number;
  silverRatePerGramPaise: number;
}): Promise<BullionRates> {
  if (input.goldRatePerGramPaise <= 0 || input.silverRatePerGramPaise <= 0) {
    throw new DomainError("Bullion rates must be positive values.", 400, "INVALID_RATES");
  }

  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);

  const now = new Date();
  await SettingsModel.updateOne(
    {},
    {
      $set: {
        goldRatePerGramPaise: input.goldRatePerGramPaise,
        silverRatePerGramPaise: input.silverRatePerGramPaise,
        bullionRatesUpdatedAt: now,
      },
    },
    { upsert: true },
  );

  currentRates = {
    goldRatePerGramPaise: input.goldRatePerGramPaise,
    silverRatePerGramPaise: input.silverRatePerGramPaise,
    lastUpdated: now,
  };

  const adminObjectId = new Types.ObjectId(input.adminId);
  await AdminAuditLog.create({
    admin: adminObjectId,
    action: "BULLION_RATES_UPDATED",
    targetType: "STORE_SETTINGS",
    targetId: null,
    meta: {
      target: "GLOBAL_SETTINGS",
      goldRatePerGramPaise: input.goldRatePerGramPaise,
      silverRatePerGramPaise: input.silverRatePerGramPaise,
    },
  });

  return currentRates;
}

/**
 * Updates jewellery configuration (GST rates, making charges, CA approval) with admin audit log.
 */
export async function updateJewellerySettings(input: {
  adminId: string | Types.ObjectId;
  metalGstRateBasisPoints?: number;
  makingGstRateBasisPoints?: number;
  stoneGstRateBasisPoints?: number;
  goldMakingChargePerGramPaise?: number;
  silverMakingChargePerGramPaise?: number;
  caApprovalConfirmed?: boolean;
}): Promise<void> {
  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);

  const updateFields: Record<string, unknown> = {};
  if (input.metalGstRateBasisPoints !== undefined) {
    updateFields["settings.jewellery.metalGstRateBasisPoints"] = input.metalGstRateBasisPoints;
  }
  if (input.makingGstRateBasisPoints !== undefined) {
    updateFields["settings.jewellery.makingGstRateBasisPoints"] = input.makingGstRateBasisPoints;
  }
  if (input.stoneGstRateBasisPoints !== undefined) {
    updateFields["settings.jewellery.stoneGstRateBasisPoints"] = input.stoneGstRateBasisPoints;
  }
  if (input.goldMakingChargePerGramPaise !== undefined) {
    updateFields["settings.jewellery.goldMakingChargePerGramPaise"] = input.goldMakingChargePerGramPaise;
  }
  if (input.silverMakingChargePerGramPaise !== undefined) {
    updateFields["settings.jewellery.silverMakingChargePerGramPaise"] = input.silverMakingChargePerGramPaise;
  }
  if (input.caApprovalConfirmed !== undefined) {
    updateFields["settings.jewellery.caApprovalConfirmed"] = input.caApprovalConfirmed;
  }

  await SettingsModel.updateOne(
    { singletonKey: "DEFAULT_SETTINGS" },
    { $set: updateFields },
    { upsert: true },
  );

  const adminObjectId = new Types.ObjectId(input.adminId);
  await AdminAuditLog.create({
    admin: adminObjectId,
    action: "JEWELLERY_SETTINGS_UPDATED",
    targetType: "STORE_SETTINGS",
    targetId: null,
    meta: {
      target: "JEWELLERY_TAX_AND_MAKING_SETTINGS",
      updates: input,
    },
  });
}

/**
 * Calculates dynamic jewellery price using integer paise arithmetic throughout.
 * GST: 3% on metal value, 5% on making charges, 3% on stone charges (CA approved).
 * Rounded once on line total to nearest whole rupee (half-up).
 * Locks price for 30 minutes.
 */
export async function calculateJewelleryPrice(
  input: JewelleryPricingInput,
  options?: { requireCaApproval?: boolean },
): Promise<JewelleryPriceBreakdown> {
  const rates = await getBullionRates();
  const ratePerGramPaise =
    input.metalType === "GOLD"
      ? rates.goldRatePerGramPaise
      : rates.silverRatePerGramPaise;

  const grossWeight = Math.max(0.01, input.grossWeightGrams);
  const stoneWeight = Math.max(0, input.stoneWeightGrams || 0);
  const netWeightGrams = Math.max(0.01, Math.round((grossWeight - stoneWeight) * 1000) / 1000);

  // STATUTORY & CA-APPROVED COMMERCIAL RULE (WEIGHT BASIS):
  // 1. Metal Value: Calculated on NET metal weight (gross weight minus stone weight).
  //    Only the actual precious metal is charged at the daily bullion rate.
  const metalValuePaise = Math.round(netWeightGrams * ratePerGramPaise);

  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);
  const settingsDoc = await SettingsModel.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();

  const metalGstBps = settingsDoc?.settings?.jewellery?.metalGstRateBasisPoints ?? 300;
  const makingGstBps = settingsDoc?.settings?.jewellery?.makingGstRateBasisPoints ?? 500;
  const stoneGstBps = settingsDoc?.settings?.jewellery?.stoneGstRateBasisPoints ?? 300;
  const goldMakingPerGram = settingsDoc?.settings?.jewellery?.goldMakingChargePerGramPaise ?? 450_00;
  const silverMakingPerGram = settingsDoc?.settings?.jewellery?.silverMakingChargePerGramPaise ?? 15_00;
  const lockMinutes = settingsDoc?.settings?.jewellery?.quoteLockDurationMinutes ?? 30;
  const caApprovalConfirmed = settingsDoc?.settings?.jewellery?.caApprovalConfirmed === true;

  // 2. Making Charges (Job Work): Calculated on GROSS weight for per-gram rates.
  //    In Indian jewellery manufacturing, labour/crafting applies to the total article crafted.
  let makingChargesPaise = 0;
  if (input.makingChargeType === "PERCENTAGE") {
    const pct = input.makingChargeValue || 10;
    makingChargesPaise = Math.round(metalValuePaise * (pct / 100));
  } else {
    // Default per-gram making charge based on metal type (Gold ₹450/g, Silver ₹15/g)
    const perGram = input.makingChargeValue || (input.metalType === "GOLD" ? goldMakingPerGram : silverMakingPerGram);
    makingChargesPaise = Math.round(grossWeight * perGram);
  }

  const stoneChargePaise = Math.max(0, input.stoneChargePaise || 0);
  const subtotalBeforeGstPaise = metalValuePaise + makingChargesPaise + stoneChargePaise;

  if (options?.requireCaApproval && !caApprovalConfirmed) {
    throw new DomainError(
      "Jewellery pricing cannot be finalized: GST tax treatment is unapproved pending written Chartered Accountant confirmation.",
      403,
      "JEWELLERY_TAX_APPROVAL_PENDING",
    );
  }

  // Indian jewellery GST: 3% on metal, 5% on making, 3% on stone
  const metalGstPaise = Math.round((metalValuePaise * metalGstBps) / 10000);
  const makingGstPaise = Math.round((makingChargesPaise * makingGstBps) / 10000);
  const stoneGstPaise = Math.round((stoneChargePaise * stoneGstBps) / 10000);
  const rawTotalGstPaise = metalGstPaise + makingGstPaise + stoneGstPaise;

  // Single line item rounding: nearest rupee, half up
  const unroundedTotalPaise = subtotalBeforeGstPaise + rawTotalGstPaise;
  const totalPricePaise = Math.round(unroundedTotalPaise / 100) * 100;
  const totalGstPaise = totalPricePaise - subtotalBeforeGstPaise;

  // Quote lock window
  const priceLockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);

  return {
    metalType: input.metalType,
    ratePerGramPaise,
    grossWeightGrams: grossWeight,
    netWeightGrams,
    metalValuePaise,
    makingChargesPaise,
    stoneChargePaise,
    subtotalBeforeGstPaise,
    metalGstPaise,
    makingGstPaise,
    stoneGstPaise,
    totalGstPaise,
    totalPricePaise,
    totalPriceRupees: totalPricePaise / 100,
    rateTimestamp: rates.lastUpdated,
    priceLockedUntil,
    caApprovalConfirmed,
    pricingStatus: caApprovalConfirmed
      ? "APPROVED_FINAL_PRICE"
      : "ESTIMATE_PENDING_CA_APPROVAL",
  };
}

