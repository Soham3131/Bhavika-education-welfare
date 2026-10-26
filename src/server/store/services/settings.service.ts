import "server-only";
import { getStoreDb } from "../db/connect";
import { getStoreSettingsModel } from "../models/StoreSettings";
import {
  StoreSettings,
  DEFAULT_STORE_SETTINGS,
  storeSettingsSchema,
} from "@/lib/validation/store-settings";

export async function getStoreSettings(): Promise<StoreSettings> {
  const conn = await getStoreDb();
  const Model = getStoreSettingsModel(conn);
  const doc = await Model.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();

  if (!doc || !doc.settings) {
    return DEFAULT_STORE_SETTINGS;
  }

  // Parse through schema to ensure all defaults exist even if older documents missed new keys
  const parsed = storeSettingsSchema.safeParse(doc.settings);
  if (parsed.success) {
    return parsed.data;
  }

  // If corrupted, fallback safely to defaults
  return DEFAULT_STORE_SETTINGS;
}

export async function updateStoreSettings(updates: Partial<StoreSettings>): Promise<StoreSettings> {
  const current = await getStoreSettings();
  const merged = {
    ...current,
    ...updates,
    rechargeCommissionSplits: {
      ...current.rechargeCommissionSplits,
      ...(updates.rechargeCommissionSplits || {}),
    },
    membership: {
      ...current.membership,
      ...(updates.membership || {}),
    },
    jewellery: {
      ...current.jewellery,
      ...(updates.jewellery || {}),
    },
    inventory: {
      ...current.inventory,
      ...(updates.inventory || {}),
    },
    luckyDraw: {
      ...current.luckyDraw,
      ...(updates.luckyDraw || {}),
    },
    recharge: {
      ...current.recharge,
      ...(updates.recharge || {}),
    },
  };

  const validated = storeSettingsSchema.parse(merged);

  const conn = await getStoreDb();
  const Model = getStoreSettingsModel(conn);

  await Model.findOneAndUpdate(
    { singletonKey: "DEFAULT_SETTINGS" },
    { $set: { settings: validated } },
    { upsert: true, returnDocument: "after" },
  );

  return validated;
}
