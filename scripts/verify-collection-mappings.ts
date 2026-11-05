import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { getStoreOrderModel } from "../src/server/store/models/StoreOrder";
import { getStoreWithdrawalRequestModel } from "../src/server/store/models/StoreWithdrawalRequest";
import { getStoreCouponModel } from "../src/server/store/models/StoreCoupon";

async function verifyCollectionMappings() {
  console.log("=================================================");
  console.log("   READ-ONLY MONGOOSE MODEL & ATLAS MAPPING CHECK");
  console.log("=================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in .env.local");

  const jmdDbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";
  console.log(`Connecting to '${jmdDbName}'...`);

  const conn = mongoose.createConnection(uri, {
    dbName: jmdDbName,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
  });

  await conn.asPromise();
  const db = conn.db;
  if (!db) throw new Error("No database handle");

  console.log(`✓ Connected to '${db.databaseName}'`);

  // 1. Runtime Model Collection Names
  const OrderModel = getStoreOrderModel(conn);
  const WithdrawalModel = getStoreWithdrawalRequestModel(conn);
  const CouponModel = getStoreCouponModel(conn);

  console.log("\n--- 1. RUNTIME MONGOOSE MODEL .collection.name ---");
  console.log(`  StoreOrder:             '${OrderModel.collection.name}'`);
  console.log(`  StoreWithdrawalRequest: '${WithdrawalModel.collection.name}'`);
  console.log(`  StoreCoupon:            '${CouponModel.collection.name}'`);

  // 2. Atlas Collections Inspection
  const allCols = await db.listCollections().toArray();
  const allNames = allCols.map((c) => c.name);

  console.log("\n--- 2. ATLAS PHYSICAL COLLECTIONS CHECK ---");
  console.log(`Total collections on Atlas: ${allNames.length}`);

  // Check storecoupons vs store_coupons
  console.log("\nChecking 'storecoupons' vs 'store_coupons':");
  const hasStoreCouponsPlural = allNames.includes("storecoupons");
  const hasStore_CouponsUnderscore = allNames.includes("store_coupons");

  console.log(`  - 'storecoupons' exists on Atlas:   ${hasStoreCouponsPlural}`);
  console.log(`  - 'store_coupons' exists on Atlas:  ${hasStore_CouponsUnderscore}`);

  if (hasStoreCouponsPlural) {
    const col1 = db.collection("storecoupons");
    const count1 = await col1.countDocuments();
    const idx1 = await col1.indexes();
    console.log(`    'storecoupons' doc count: ${count1}`);
    console.log(`    'storecoupons' index count: ${idx1.length}`);
    const freeRegIdx = idx1.find((i) => i.name === "unique_free_reg_coupon_per_member");
    console.log(`    'storecoupons' unique_free_reg_coupon_per_member exists: ${Boolean(freeRegIdx)}`);
    if (freeRegIdx) {
      console.log(`      Keys: ${JSON.stringify(freeRegIdx.key)}`);
      console.log(`      Unique: ${freeRegIdx.unique}`);
      console.log(`      PartialFilter: ${JSON.stringify(freeRegIdx.partialFilterExpression)}`);
    }
  }

  if (hasStore_CouponsUnderscore) {
    const col2 = db.collection("store_coupons");
    const count2 = await col2.countDocuments();
    const idx2 = await col2.indexes();
    console.log(`    'store_coupons' doc count: ${count2}`);
    console.log(`    'store_coupons' index count: ${idx2.length}`);
  } else {
    console.log(`    'store_coupons' DOES NOT EXIST on Atlas (0 documents, 0 indexes, namespace does not exist).`);
  }

  // Check store_orders
  console.log("\nChecking 'store_orders':");
  const hasStoreOrders = allNames.includes("store_orders");
  console.log(`  - 'store_orders' exists on Atlas: ${hasStoreOrders}`);
  if (hasStoreOrders) {
    const colOrders = db.collection("store_orders");
    const orderCount = await colOrders.countDocuments();
    const orderIdx = await colOrders.indexes();
    console.log(`    Doc count: ${orderCount}`);
    console.log(`    Index count: ${orderIdx.length}`);
    const invoiceIdx = orderIdx.find((i) => i.key && i.key.invoiceNumber);
    console.log(`    Invoice index exists: ${Boolean(invoiceIdx)}`);
    if (invoiceIdx) {
      console.log(`      Name: ${invoiceIdx.name}, Keys: ${JSON.stringify(invoiceIdx.key)}, Unique: ${invoiceIdx.unique}`);
    } else {
      console.log(`      No index matching { invoiceNumber: 1 } currently exists.`);
    }

    // Inspect existing invoiceNumber values across all documents
    const ordersWithInvoices = await colOrders.find({}, { projection: { orderRef: 1, invoiceNumber: 1 } }).toArray();
    console.log(`    Existing order invoiceNumber values:`);
    for (const o of ordersWithInvoices) {
      console.log(`      Order '${o.orderRef}': invoiceNumber = ${JSON.stringify(o.invoiceNumber)} (type: ${typeof o.invoiceNumber})`);
    }
  }

  // Check store_withdrawal_requests
  console.log("\nChecking 'store_withdrawal_requests':");
  const hasWithdrawals = allNames.includes("store_withdrawal_requests");
  console.log(`  - 'store_withdrawal_requests' exists on Atlas: ${hasWithdrawals}`);
  if (hasWithdrawals) {
    const colWdr = db.collection("store_withdrawal_requests");
    const wdrCount = await colWdr.countDocuments();
    const wdrIdx = await colWdr.indexes();
    console.log(`    Doc count: ${wdrCount}`);
    console.log(`    Index count: ${wdrIdx.length}`);
    const activeWdrIdx = wdrIdx.find((i) => i.name === "unique_active_withdrawal_per_member");
    console.log(`    'unique_active_withdrawal_per_member' exists: ${Boolean(activeWdrIdx)}`);
    if (activeWdrIdx) {
      console.log(`      Keys: ${JSON.stringify(activeWdrIdx.key)}`);
      console.log(`      Unique: ${activeWdrIdx.unique}`);
      console.log(`      PartialFilter: ${JSON.stringify(activeWdrIdx.partialFilterExpression)}`);
    }
  }

  await conn.close();
  console.log("\n=================================================");
  console.log("   VERIFICATION COMPLETE (ZERO WRITES)           ");
  console.log("=================================================");
}

verifyCollectionMappings().catch((err) => {
  console.error(err);
  process.exit(1);
});

