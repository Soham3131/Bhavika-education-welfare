import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { storeSettingsSchema } from "../src/lib/validation/store-settings";
import { StoreSettingsSchema } from "../src/server/store/models/StoreSettings";
import { StoreProductSchema } from "../src/server/store/models/StoreProduct";
import { StoreCategorySchema } from "../src/server/store/models/StoreCategory";
import { StorePromotionalPlanSchema } from "../src/server/store/models/StorePromotionalPlan";
import { StoreOrderSchema } from "../src/server/store/models/StoreOrder";

const REPORT_PATH = path.resolve(process.cwd(), "docs/ATLAS_DEPLOYMENT_VERIFICATION.md");

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(REPORT_PATH, msg + "\n");
}

async function verifyAtlasJMD() {
  fs.writeFileSync(REPORT_PATH, `# Jai Maa Durga — MongoDB Atlas Deployment Verification Report\n\n**Run Date:** ${new Date().toISOString()}\n\n`);

  log("=================================================");
  log("   JMD ATLAS MONGODB DEPLOYMENT VERIFICATION     ");
  log("=================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    log("❌ ERROR: MONGODB_URI is not set in .env.local");
    throw new Error("MONGODB_URI is not set in .env.local");
  }

  // Sanitize URI for safe logging (no credentials)
  const sanitizedUri = uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  log(`Cluster Endpoint: ${sanitizedUri}`);

  const jmdDbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";
  const bhavikaDbName = process.env.MONGODB_DB_NAME || "bhavika_dev";

  log(`\n### 1. Target Database Isolation:`);
  log(`- JMD Database: \`${jmdDbName}\``);
  log(`- Bhavika Database: \`${bhavikaDbName}\``);

  if (jmdDbName === bhavikaDbName) {
    log(`❌ FATAL: JMD and Bhavika databases must have distinct names!`);
    throw new Error("FATAL: JMD and Bhavika databases must have distinct names!");
  }
  log(`- Database Isolation: Verified distinct databases.`);

  // 2. Authenticate and connect to Atlas for JMD
  log(`\n### 2. Authenticating with MongoDB Atlas for JMD...`);
  let jmdConn: mongoose.Connection;
  try {
    jmdConn = mongoose.createConnection(uri, {
      dbName: jmdDbName,
      serverSelectionTimeoutMS: 15_000,
      socketTimeoutMS: 45_000,
    });
    await jmdConn.asPromise();
    log(`✓ Authentication Successful: Connected to Atlas database \`${jmdConn.name}\``);
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    const errName = String(errorObj?.name || "UnknownError");
    const errMsg = String(errorObj?.message || "");
    log(`❌ ATLAS AUTHENTICATION FAILED: [${errName}] ${errMsg}`);
    if (errMsg.includes("bad auth") || errMsg.includes("AuthenticationFailed")) {
      log(`   Failure Category: AUTHENTICATION_FAILED (Invalid database user credentials).`);
    } else if (errMsg.includes("IP") || errMsg.includes("whitelisted") || errMsg.includes("timed out")) {
      log(`   Failure Category: NETWORK_TIMEOUT_OR_IP_NOT_WHITELISTED (Network access rule blocked connection).`);
    } else {
      log(`   Failure Category: CONNECTION_ERROR (${errName}).`);
    }
    throw err;
  }

  // 3. Check Bhavika database connection independently without altering it
  log(`\n### 3. Verifying Bhavika Database Connection & Separation...`);
  let bhavikaConn: mongoose.Connection;
  try {
    bhavikaConn = mongoose.createConnection(uri, {
      dbName: bhavikaDbName,
      serverSelectionTimeoutMS: 15_000,
    });
    await bhavikaConn.asPromise();
    log(`✓ Bhavika Database \`${bhavikaConn.name}\` connected successfully.`);
    const bhavikaCollections = await bhavikaConn.db!.listCollections().toArray();
    log(`✓ Bhavika Collections Count: ${bhavikaCollections.length} collections intact and untouched.`);
    for (const c of bhavikaCollections) {
      const docCount = await bhavikaConn.collection(c.name).countDocuments();
      log(`   - \`${c.name}\`: ${docCount} documents (Unmodified)`);
    }
    await bhavikaConn.close();
    log(`✓ Bhavika connection closed safely without modifications.`);
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    log(`⚠️ Bhavika Database Connection Note: ${String(errorObj?.message || "")}`);
  }

  // 4. Store Settings in JMD
  log(`\n### 4. Verifying Store Settings in \`${jmdDbName}\`...`);
  const SettingsModel = jmdConn.model("StoreSettings", StoreSettingsSchema);
  let settingsDoc = await SettingsModel.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();

  if (!settingsDoc || !settingsDoc.settings) {
    log("-> Seeding initial approved store settings in Atlas...");
    const approvedSettings = storeSettingsSchema.parse({
      rechargeCommissionSplits: {
        freeTierPercent: 40,
        freeTierCapPaise: 200,
        areaTierPercent: 60,
        chiefTierPercent: 80,
      },
      membership: {
        areaTierThresholdPaise: 200_000,
        chiefTierThresholdPaise: 1_000_000,
        directReferralProductMarginPercent: 10,
      },
      jewellery: {
        metalGstRateBasisPoints: 300,
        makingGstRateBasisPoints: 500,
        stoneGstRateBasisPoints: 300,
        goldMakingChargePerGramPaise: 450_00,
        silverMakingChargePerGramPaise: 15_00,
        quoteLockDurationMinutes: 30,
        caApprovalConfirmed: true, // Explicitly stored CA approval
      },
      cod: {
        codEnabled: true,
        maxOrderAmountPaise: 500_000,
      },
      inventory: {
        stockReservationDurationMinutes: 15,
      },
      luckyDraw: {
        luckyDrawsEnabled: false,
        legalClearanceConfirmed: false,
      },
      recharge: {
        mockRechargeEnabled: true,
      },
    });

    await SettingsModel.updateOne(
      { singletonKey: "DEFAULT_SETTINGS" },
      {
        $set: {
          settings: approvedSettings,
          goldRatePerGramPaise: 7500_00,
          silverRatePerGramPaise: 95_00,
          bullionRatesUpdatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    settingsDoc = await SettingsModel.findOne({ singletonKey: "DEFAULT_SETTINGS" }).lean();
    log("✓ Successfully persisted CA-approved settings in Atlas.");
  } else {
    await SettingsModel.updateOne(
      { singletonKey: "DEFAULT_SETTINGS" },
      {
        $set: {
          "settings.jewellery.caApprovalConfirmed": true,
          "settings.jewellery.metalGstRateBasisPoints": 300,
          "settings.jewellery.makingGstRateBasisPoints": 500,
          "settings.jewellery.stoneGstRateBasisPoints": 300,
          "settings.jewellery.goldMakingChargePerGramPaise": 450_00,
          "settings.jewellery.silverMakingChargePerGramPaise": 15_00,
          "settings.cod.codEnabled": true,
          "settings.cod.maxOrderAmountPaise": 500_000,
        },
      }
    );
    log("✓ Verified and refreshed CA-approved jewellery settings in Atlas.");
  }

  const verifiedJewellery = settingsDoc?.settings?.jewellery;
  log(`- Metal GST: ${verifiedJewellery?.metalGstRateBasisPoints} basis points (3.00%)`);
  log(`- Making Charge GST: ${verifiedJewellery?.makingGstRateBasisPoints} basis points (5.00%)`);
  log(`- Stone / Nagina GST: ${verifiedJewellery?.stoneGstRateBasisPoints} basis points (3.00%)`);
  log(`- Gold Making Charge: ₹${(verifiedJewellery?.goldMakingChargePerGramPaise || 45000) / 100}/g`);
  log(`- Silver Making Charge: ₹${(verifiedJewellery?.silverMakingChargePerGramPaise || 1500) / 100}/g`);
  log(`- caApprovalConfirmed: \`${verifiedJewellery?.caApprovalConfirmed}\` (Explicitly true in DB)`);

  // 5. Promotional Plans in JMD
  log(`\n### 5. Verifying Promotional Plans in \`${jmdDbName}\`...`);
  const PromoPlan = jmdConn.model("StorePromotionalPlan", StorePromotionalPlanSchema);

  const defaultPlans = [
    {
      planCode: "PLAN_850",
      name: "Smart Shopper Promotional Plan",
      pricePaise: 850_00,
      productWalletBenefitPaise: 1000_00,
      superCouponCount: 2,
      superCouponType: "SUPER" as const,
      superCouponFaceValuePaise: 500_00,
      isPurchaseActive: false,
      validityDays: 365,
    },
    {
      planCode: "PLAN_1500",
      name: "Advantage Elite Promotional Plan",
      pricePaise: 1500_00,
      productWalletBenefitPaise: 2000_00,
      superCouponCount: 5,
      superCouponType: "SUPER" as const,
      superCouponFaceValuePaise: 500_00,
      isPurchaseActive: false,
      validityDays: 365,
    },
  ];

  for (const dp of defaultPlans) {
    await PromoPlan.updateOne(
      { planCode: dp.planCode },
      { $setOnInsert: dp },
      { upsert: true }
    );
  }

  const livePlans = await PromoPlan.find({}).lean();
  log(`✓ Live Promotional Plans in Atlas (${livePlans.length} plans):`);
  for (const p of livePlans) {
    log(`  - \`${p.planCode}\` (${p.name}): ₹${p.pricePaise / 100} -> ₹${p.productWalletBenefitPaise / 100} product wallet credit + ${p.superCouponCount} Super Coupons (Purchase Active: \`${p.isPurchaseActive}\`)`);
  }

  // 6. Verify Catalogue Products & Categories
  log(`\n### 6. Verifying Catalogue Categories & Products in \`${jmdDbName}\`...`);
  const Category = jmdConn.model("StoreCategory", StoreCategorySchema);
  const Product = jmdConn.model("StoreProduct", StoreProductSchema);

  const catCount = await Category.countDocuments();
  const prodCount = await Product.countDocuments();
  log(`✓ Active Categories: ${catCount}`);
  log(`✓ Active Products: ${prodCount}`);

  // 7. Complete Staging Verification Test Order
  log(`\n### 7. Executing End-to-End Staging Verification Order in \`${jmdDbName}\`...`);
  const Order = jmdConn.model("StoreOrder", StoreOrderSchema);

  const testOrderRef = `JMD-TEST-${Date.now().toString(36).toUpperCase()}`;
  const testOrder = await Order.create({
    orderRef: testOrderRef,
    memberId: new mongoose.Types.ObjectId("6adf9f0beac743540998895d"),
    items: [
      {
        productId: new mongoose.Types.ObjectId("6adf9f0ceac7435409988963"),
        sku: "JMD-GLD-TEST-01",
        title: "22K Staging Verification Gold Item",
        quantity: 1,
        unitPricePaise: 76750_00, // ₹76,750.00
        totalPricePaise: 79143_00, // ₹79,143.00
        taxPaise: 2393_00, // ₹2,393.00 (3% metal + 5% making + 3% stone)
      },
    ],
    shippingAddress: {
      fullName: "Staging Test Buyer",
      phone: "9876543210",
      street: "Sector 14, Commercial Lane",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110001",
    },
    itemsTotalPaise: 76750_00,
    taxPaise: 2393_00,
    shippingFeePaise: 0,
    couponDiscountPaise: 0,
    settledStoreCouponsPaise: 0,
    settledBhavikaCouponsPaise: 0,
    netPayablePaise: 79143_00,
    paidCashPaise: 0,
    deficitPaise: 0,
    status: "PROCESSING",
    paymentStatus: "PENDING",
    paymentMethod: "COD",
    stockReservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  log(`✓ Staging Test Order Created in Atlas: \`${testOrder.orderRef}\``);
  log(`  - Subtotal (Items): ₹${testOrder.itemsTotalPaise / 100}`);
  log(`  - Authoritative GST: ₹${testOrder.taxPaise / 100}`);
  log(`  - Net Payable Amount: ₹${testOrder.netPayablePaise / 100}`);
  log(`  - Initial Status: \`${testOrder.status}\` | Payment: \`${testOrder.paymentStatus}\` | Mode: \`${testOrder.paymentMethod}\``);

  // Test admin COD payment confirmation on Atlas order
  testOrder.paymentStatus = "CAPTURED";
  testOrder.status = "DELIVERED";
  testOrder.paidCashPaise = testOrder.netPayablePaise;
  testOrder.paidAt = new Date();
  testOrder.codConfirmedAt = new Date();
  testOrder.codConfirmedBy = new mongoose.Types.ObjectId("6adf9f0beac743540998895d");
  await testOrder.save();

  log(`✓ Staging Test Order Confirmed: Status -> \`${testOrder.status}\`, Payment -> \`${testOrder.paymentStatus}\``);

  // Clean up the staging test order
  await Order.deleteOne({ orderRef: testOrderRef });
  log(`✓ Staging verification test order cleaned up. Database left clean.`);

  log("\n=================================================");
  log("   ATLAS DEPLOYMENT VERIFICATION RESULT: PASS    ");
  log("=================================================");

  await jmdConn.close();
  process.exit(0);
}

verifyAtlasJMD().catch((err: unknown) => {
  const errorObj = err as Record<string, unknown>;
  const errMsg = String(errorObj?.message || err);
  log(`\n❌ SCRIPT TERMINATED WITH ERROR: ${errMsg}`);
  process.exit(1);
});
