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
 * Calculates dynamic jewellery price using integer paise arithmetic throughout.
 * GST: 3% on metal value, 5% on making charges.
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

  // Metal Value in integer paise
  const metalValuePaise = Math.round(netWeightGrams * ratePerGramPaise);

  // Making charges in integer paise
  let makingChargesPaise = 0;
  if (input.makingChargeType === "PERCENTAGE") {
    const pct = input.makingChargeValue || 10;
    makingChargesPaise = Math.round(metalValuePaise * (pct / 100));
  } else {
    // Default per-gram making charge (e.g. ₹450/g = 45000 paise)
    const perGram = input.makingChargeValue || 45000;
    makingChargesPaise = Math.round(grossWeight * perGram);
  }

  const stoneChargePaise = Math.max(0, input.stoneChargePaise || 0);
  const subtotalBeforeGstPaise = metalValuePaise + makingChargesPaise + stoneChargePaise;

  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);
  const settingsDoc = await SettingsModel.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();

  const metalGstBps = settingsDoc?.settings?.jewellery?.metalGstRateBasisPoints ?? 300;
  const makingGstBps = settingsDoc?.settings?.jewellery?.makingGstRateBasisPoints ?? 500;
  const lockMinutes = settingsDoc?.settings?.jewellery?.quoteLockDurationMinutes ?? 30;
  const caApprovalConfirmed = settingsDoc?.settings?.jewellery?.caApprovalConfirmed ?? false;

  if (options?.requireCaApproval && !caApprovalConfirmed) {
    throw new DomainError(
      "Jewellery pricing cannot be finalized: GST tax treatment is unapproved pending written Chartered Accountant confirmation.",
      403,
      "JEWELLERY_TAX_APPROVAL_PENDING",
    );
  }

  // Indian jewellery GST: derived from configurable StoreSettings
  const metalGstPaise = Math.round((metalValuePaise * metalGstBps) / 10000);
  const makingGstPaise = Math.round((makingChargesPaise * makingGstBps) / 10000);
  const totalGstPaise = metalGstPaise + makingGstPaise;

  // Single line item rounding: nearest rupee, half up
  const unroundedTotalPaise = subtotalBeforeGstPaise + totalGstPaise;
  const totalPricePaise = Math.round(unroundedTotalPaise / 100) * 100;

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
