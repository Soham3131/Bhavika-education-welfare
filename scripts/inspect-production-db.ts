import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";

async function inspectProductionDb() {
  console.log("=================================================");
  console.log("   READ-ONLY PRODUCTION DATABASE STATE INSPECTION ");
  console.log("=================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in .env.local");
  }

  const jmdDbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";
  console.log(`Connecting in READ-ONLY mode to: '${jmdDbName}'...`);

  const conn = mongoose.createConnection(uri, {
    dbName: jmdDbName,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
  });

  await conn.asPromise();

  // Verification 1: Confirm database identity
  const db = conn.db;
  if (!db) throw new Error("Could not acquire Db handle.");
  const activeDbName = db.databaseName;
  console.log(`✓ Confirmed database identity: '${activeDbName}'`);

  if (activeDbName !== "jai_maa_durga") {
    throw new Error(`DATABASE IDENTITY MISMATCH: Expected 'jai_maa_durga', got '${activeDbName}'`);
  }

  // Verification 2: List all collections
  const collections = await db.listCollections().toArray();
  console.log(`\nFound ${collections.length} collection(s) in '${activeDbName}':`);
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  - ${col.name} (${count} documents)`);
  }

  // Verification 3: Inspect relevant collections
  const candidateCollections = [
    "store_orders",
    "storeorders",
    "store_withdrawal_requests",
    "storewithdrawalrequests",
    "store_coupons",
    "storecoupons",
  ];

  console.log("\n--- DETAILED COLLECTION INDEX & DUPLICATE ANALYSIS ---");

  for (const colName of candidateCollections) {
    const exists = collections.some((c) => c.name === colName);
    if (!exists) continue;

    console.log(`\n======================================================`);
    console.log(`Collection: '${colName}'`);
    const col = db.collection(colName);
    const docCount = await col.countDocuments();
    console.log(`Document Count: ${docCount}`);

    // List all existing indexes
    const indexes = await col.indexes();
    console.log(`Existing Indexes (${indexes.length}):`);
    for (const idx of indexes) {
      console.log(`  * Name: '${idx.name}'`);
      console.log(`    Keys: ${JSON.stringify(idx.key)}`);
      if (idx.unique) console.log(`    Unique: ${idx.unique}`);
      if (idx.sparse) console.log(`    Sparse: ${idx.sparse}`);
      if (idx.partialFilterExpression) {
        console.log(`    PartialFilter: ${JSON.stringify(idx.partialFilterExpression)}`);
      }
    }

    // Check duplicates based on collection type
    if (colName.includes("order")) {
      console.log(`\nChecking for duplicate string invoice numbers in '${colName}'...`);
      const dups = await col
        .aggregate([
          { $match: { invoiceNumber: { $type: "string", $ne: "" } } },
          { $group: { _id: "$invoiceNumber", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();

      if (dups.length === 0) {
        console.log(`  ✓ ZERO duplicate string invoice numbers found. Ready for unique index.`);
      } else {
        console.log(`  ❌ FOUND ${dups.length} DUPLICATE INVOICE NUMBER(S):`, dups);
      }

      const nullOrders = await col.countDocuments({ invoiceNumber: null });
      const unsetOrders = await col.countDocuments({ invoiceNumber: { $exists: false } });
      const stringOrders = await col.countDocuments({ invoiceNumber: { $type: "string" } });
      console.log(`  Invoice stats: ${stringOrders} string invoices, ${nullOrders} null invoices, ${unsetOrders} unset invoices.`);
    }

    if (colName.includes("withdrawal")) {
      console.log(`\nChecking for duplicate active withdrawals in '${colName}'...`);
      const activeStatuses = ["REQUESTED", "APPROVED", "PROCESSING"];
      const dups = await col
        .aggregate([
          { $match: { status: { $in: activeStatuses } } },
          { $group: { _id: "$member", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();

      if (dups.length === 0) {
        console.log(`  ✓ ZERO duplicate active withdrawals per member found. Ready for unique index.`);
      } else {
        console.log(`  ❌ FOUND ${dups.length} MEMBER(S) WITH MULTIPLE ACTIVE WITHDRAWALS:`, dups);
      }

      const totalActive = await col.countDocuments({ status: { $in: activeStatuses } });
      console.log(`  Active withdrawals count: ${totalActive}.`);
    }

    if (colName.includes("coupon")) {
      console.log(`\nChecking for duplicate FREE_REGISTRATION coupons in '${colName}'...`);
      const dups = await col
        .aggregate([
          { $match: { source: "FREE_REGISTRATION" } },
          { $group: { _id: "$member", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();

      if (dups.length === 0) {
        console.log(`  ✓ ZERO duplicate FREE_REGISTRATION coupons per member found. Ready for unique index.`);
      } else {
        console.log(`  ❌ FOUND ${dups.length} MEMBER(S) WITH MULTIPLE FREE_REGISTRATION COUPONS:`, dups);
      }

      const totalFreeReg = await col.countDocuments({ source: "FREE_REGISTRATION" });
      console.log(`  Total FREE_REGISTRATION coupons count: ${totalFreeReg}.`);
    }
  }

  await conn.close();
  console.log("\n=================================================");
  console.log("   INSPECTION COMPLETED SAFELY (ZERO WRITES)     ");
  console.log("=================================================");
}

inspectProductionDb().catch((err) => {
  console.error("Inspection error:", err);
  process.exit(1);
});

