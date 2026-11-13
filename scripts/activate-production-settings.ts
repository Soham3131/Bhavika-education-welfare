import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { storeSettingsSchema } from "../src/lib/validation/store-settings";
import { StoreSettingsSchema } from "../src/server/store/models/StoreSettings";

async function activateProductionSettings() {
  console.log("=================================================");
  console.log("   JMD PRODUCTION STORE SETTINGS ACTIVATION      ");
  console.log("=================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not configured in .env.local");

  const dbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";
  console.log(`Connecting to database '${dbName}'...`);

  const conn = mongoose.createConnection(uri, {
    dbName,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });

  await conn.asPromise();

  const db = conn.db;
  if (!db) throw new Error("Could not acquire DB handle.");

  // Pre-flight database isolation check
  if (db.databaseName !== "jai_maa_durga") {
    throw new Error(`DATABASE IDENTITY MISMATCH: Expected 'jai_maa_durga', got '${db.databaseName}'`);
  }
  console.log(`✓ Verified target database identity: '${db.databaseName}'`);

  // Approved Production Settings Payload
  const approvedPayload = {
    rechargeCommissionSplits: {
      freeTierPercent: 40,
      freeTierCapPaise: 200,
      areaTierPercent: 60,
      chiefTierPercent: 80,
    },
    membership: {
      qualificationStrategy: "SINGLE_ORDER_THRESHOLD" as const,
      areaTierThresholdPaise: 200_000,
      chiefTierThresholdPaise: 1_000_000,
      directReferralProductMarginPercent: 10,
    },
    jewellery: {
      metalGstRateBasisPoints: 300, // 3.00%
      makingGstRateBasisPoints: 500, // 5.00%
      stoneGstRateBasisPoints: 300, // 3.00%
      goldMakingChargePerGramPaise: 450_00, // ₹450.00 / gram
      silverMakingChargePerGramPaise: 15_00, // ₹15.00 / gram
      quoteLockDurationMinutes: 30,
      caApprovalConfirmed: true, // APPROVED BY CHARTERED ACCOUNTANT
    },
    cod: {
      codEnabled: true,
      maxOrderAmountPaise: 500_000, // ₹5,000 max COD
    },
    inventory: {
      stockReservationDurationMinutes: 15,
    },
    luckyDraw: {
      luckyDrawsEnabled: true, // APPROVED LEGAL CLEARANCE
      legalClearanceConfirmed: true, // APPROVED LEGAL CLEARANCE
    },
    recharge: {
      mockRechargeEnabled: true,
    },
    coupons: {
      freeRegistrationMiniCouponValuePaise: 50_00,
      freeRegistrationCouponValidityDays: 90,
    },
    invoice: {
      isProductionReady: false, // GATED: Production invoices remain on hold pending official confirmation of ACTIVE status on GST portal
      legalEntityName: "RAJENDER SINGH",
      tradeName: "JAI MA DURGA & COMPANY",
      businessConstitution: "Proprietorship",
      udyamNumber: "UDYAM-HR-17-0005563",
      gstin: "06EXVPS0958F2ZR",
      pan: "EXVPS0958F",
      registeredAddress: "Ramsara Jogiwala Daiyer Road, Rampur Dhani, Sirsa, Haryana - 125055",
      district: "Sirsa",
      state: "Haryana",
      stateCode: "06",
      gstStatus: "PENDING_REACTIVATION" as const,
      invoiceNumberPrefix: "JMD",
      financialYear: "26-27",
      supportEmail: "store@bhavikawelfare.org",
      supportPhone: "",
      hsnMappings: {
        JEWELLERY_GOLD: "7113",
        JEWELLERY_SILVER: "7113",
        GROCERY: "2106",
        FASHION: "6204",
        ELECTRONICS: "8517",
        RECHARGE: "9984",
      },
    },
  };

  // Validate payload through schema
  const validatedSettings = storeSettingsSchema.parse(approvedPayload);
  console.log("✓ Approved production settings payload passed Zod validation.");

  const SettingsModel = conn.model("StoreSettings", StoreSettingsSchema);

  const updatedDoc = await SettingsModel.findOneAndUpdate(
    { singletonKey: "DEFAULT_SETTINGS" },
    {
      $set: {
        settings: validatedSettings,
        goldRatePerGramPaise: 7500_00,
        silverRatePerGramPaise: 95_00,
        bullionRatesUpdatedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  console.log("\n--- PERSISTED PRODUCTION SETTINGS IN ATLAS ---");
  console.log(`Singleton Key: ${updatedDoc.singletonKey}`);
  console.log(`Lucky Draw Active: ${updatedDoc.settings.luckyDraw.luckyDrawsEnabled} (Legal Clearance: ${updatedDoc.settings.luckyDraw.legalClearanceConfirmed})`);
  console.log(`Jewellery CA Approval: ${updatedDoc.settings.jewellery.caApprovalConfirmed} (Metal: 3%, Making: 5%, Stone: 3%)`);
  console.log(`Seller GST Ready: ${updatedDoc.settings.invoice.isProductionReady} (GSTIN: ${updatedDoc.settings.invoice.gstin}, Status: ${updatedDoc.settings.invoice.gstStatus})`);
  console.log(`Seller Entity: ${updatedDoc.settings.invoice.legalEntityName} [${updatedDoc.settings.invoice.businessConstitution}]`);
  console.log(`Seller Trade Name: ${updatedDoc.settings.invoice.tradeName}`);
  console.log(`Seller Udyam: ${updatedDoc.settings.invoice.udyamNumber}`);
  console.log(`Seller Address: ${updatedDoc.settings.invoice.registeredAddress}`);
  console.log("=================================================");
  console.log("   ACTIVATION COMPLETED SUCCESSFULLY            ");
  console.log("=================================================");

  await conn.close();
}

activateProductionSettings().catch((err) => {
  console.error("❌ Activation Error:", err);
  process.exit(1);
});

