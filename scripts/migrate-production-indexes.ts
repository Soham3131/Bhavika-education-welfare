import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";

interface TargetIndexPlan {
  collectionName: string;
  keys: Record<string, number | string>;
  options: {
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
    name?: string;
    background?: boolean;
  };
  duplicateCheck: (col: mongoose.mongo.Collection) => Promise<{
    hasDuplicates: boolean;
    duplicatesCount: number;
    details: unknown[];
  }>;
}

const MIGRATION_PLANS: TargetIndexPlan[] = [
  {
    collectionName: "store_orders",
    keys: { invoiceNumber: 1 },
    options: {
      unique: true,
      partialFilterExpression: { invoiceNumber: { $type: "string" } },
      name: "invoiceNumber_1_partial_unique",
      background: true,
    },
    duplicateCheck: async (col) => {
      const dups = await col
        .aggregate([
          { $match: { invoiceNumber: { $type: "string", $ne: "" } } },
          { $group: { _id: "$invoiceNumber", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();
      return {
        hasDuplicates: dups.length > 0,
        duplicatesCount: dups.length,
        details: dups,
      };
    },
  },
  {
    collectionName: "store_withdrawal_requests",
    keys: { member: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        status: { $in: ["REQUESTED", "APPROVED", "PROCESSING"] },
      },
      name: "unique_active_withdrawal_per_member",
      background: true,
    },
    duplicateCheck: async (col) => {
      const dups = await col
        .aggregate([
          { $match: { status: { $in: ["REQUESTED", "APPROVED", "PROCESSING"] } } },
          { $group: { _id: "$member", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();
      return {
        hasDuplicates: dups.length > 0,
        duplicatesCount: dups.length,
        details: dups,
      };
    },
  },
  {
    collectionName: "storecoupons",
    keys: { member: 1, source: 1 },
    options: {
      unique: true,
      partialFilterExpression: { source: "FREE_REGISTRATION" },
      name: "unique_free_reg_coupon_per_member",
      background: true,
    },
    duplicateCheck: async (col) => {
      const dups = await col
        .aggregate([
          { $match: { source: "FREE_REGISTRATION" } },
          { $group: { _id: "$member", count: { $sum: 1 }, ids: { $push: "$_id" } } },
          { $match: { count: { $gt: 1 } } },
        ])
        .toArray();
      return {
        hasDuplicates: dups.length > 0,
        duplicatesCount: dups.length,
        details: dups,
      };
    },
  },
];

function isKeyEqual(
  actual: Record<string, unknown>,
  expected: Record<string, number | string>,
): boolean {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((k) => actual[k] === expected[k]);
}

export async function runProductionIndexMigration(options: { execute: boolean }) {
  const isExecute = options.execute === true;
  const modeLabel = isExecute ? "LIVE EXECUTION MODE" : "DRY-RUN INSPECTION MODE (No mutations)";

  console.log("=================================================");
  console.log(`   JAI MAA DURGA — PRODUCTION MONGODB MIGRATION   `);
  console.log(`   MODE: ${modeLabel}`);
  console.log("=================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in .env.local");
  }

  const configuredDbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";

  // Strict safety check: Never run against test database or default Bhavika database
  if (configuredDbName !== "jai_maa_durga") {
    throw new Error(
      `SAFETY BLOCK: Target database must be strictly 'jai_maa_durga'. Current configuration: '${configuredDbName}'`,
    );
  }

  const conn = mongoose.createConnection(uri, {
    dbName: configuredDbName,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
  });

  await conn.asPromise();
  const db = conn.db;
  if (!db) throw new Error("Could not acquire MongoDB database handle.");

  // Pre-flight database identity verification
  const verifiedDbName = db.databaseName;
  console.log(`✓ Pre-flight Database Identity Verification: '${verifiedDbName}'`);
  if (verifiedDbName !== "jai_maa_durga") {
    throw new Error(
      `FATAL DATABASE MISMATCH: Expected 'jai_maa_durga', connected to '${verifiedDbName}'`,
    );
  }

  const existingCollections = await db.listCollections().toArray();
  const existingCollectionNames = new Set(existingCollections.map((c) => c.name));

  const planResults: {
    collection: string;
    status: "ALREADY_EXISTS" | "MISSING_READY_TO_CREATE" | "BLOCKED_BY_DUPLICATES" | "CREATED_SUCCESSFULLY";
    details: string;
  }[] = [];

  for (const plan of MIGRATION_PLANS) {
    console.log(`\n-------------------------------------------------`);
    console.log(`Checking Collection: '${plan.collectionName}'`);

    if (!existingCollectionNames.has(plan.collectionName)) {
      console.log(`  ℹ Collection '${plan.collectionName}' does not exist yet. Will create automatically upon index creation.`);
    }

    const col = db.collection(plan.collectionName);
    const docCount = existingCollectionNames.has(plan.collectionName)
      ? await col.countDocuments()
      : 0;
    console.log(`  Total Documents: ${docCount}`);

    // 1. Check existing indexes
    const actualIndexes = existingCollectionNames.has(plan.collectionName)
      ? await col.indexes()
      : [];

    let matchingIndex: mongoose.mongo.IndexDescription | null = null;
    for (const idx of actualIndexes) {
      if (isKeyEqual(idx.key as Record<string, unknown>, plan.keys)) {
        // Also verify partialFilterExpression if expected
        if (plan.options.partialFilterExpression) {
          const actualFilter = JSON.stringify(idx.partialFilterExpression || {});
          const expectedFilter = JSON.stringify(plan.options.partialFilterExpression);
          if (actualFilter === expectedFilter && idx.unique === plan.options.unique) {
            matchingIndex = idx;
            break;
          }
        } else if (idx.unique === plan.options.unique) {
          matchingIndex = idx;
          break;
        }
      }
    }

    if (matchingIndex) {
      const msg = `Index matching keys ${JSON.stringify(plan.keys)} already exists with identical options (Name: '${matchingIndex.name}').`;
      console.log(`  ✓ ALREADY PRESENT: ${msg}`);
      planResults.push({
        collection: plan.collectionName,
        status: "ALREADY_EXISTS",
        details: msg,
      });
      continue;
    }

    // 2. Perform pre-flight duplicate check
    console.log(`  Running duplicate check on target index keys...`);
    const dupCheck = await plan.duplicateCheck(col);

    if (dupCheck.hasDuplicates) {
      const msg = `BLOCKED: Found ${dupCheck.duplicatesCount} duplicate group(s) in '${plan.collectionName}'. Cannot create unique index.`;
      console.error(`  ❌ ${msg}`, dupCheck.details);
      planResults.push({
        collection: plan.collectionName,
        status: "BLOCKED_BY_DUPLICATES",
        details: msg,
      });
      continue;
    }

    console.log(`  ✓ Duplicate check PASSED: 0 duplicates found.`);

    // 3. Dry-run vs Execution
    const mongoCommand = `db.${plan.collectionName}.createIndex(${JSON.stringify(plan.keys)}, ${JSON.stringify(plan.options)});`;

    if (!isExecute) {
      console.log(`  [DRY-RUN] Index is GENUINELY MISSING.`);
      console.log(`  [DRY-RUN] Command to execute:`);
      console.log(`    ${mongoCommand}`);
      planResults.push({
        collection: plan.collectionName,
        status: "MISSING_READY_TO_CREATE",
        details: `Dry-run: Ready for creation via command: ${mongoCommand}`,
      });
    } else {
      console.log(`  [LIVE EXECUTION] Creating missing index now...`);
      const createResult = await col.createIndex(plan.keys as mongoose.mongo.IndexSpecification, plan.options as mongoose.mongo.CreateIndexesOptions);
      console.log(`  ✓ Index created successfully: '${createResult}'`);
      planResults.push({
        collection: plan.collectionName,
        status: "CREATED_SUCCESSFULLY",
        details: `Created index '${createResult}' with keys ${JSON.stringify(plan.keys)}`,
      });
    }
  }

  await conn.close();

  console.log(`\n=================================================`);
  console.log(`   MIGRATION PLAN SUMMARY RESULTS                `);
  console.log(`=================================================`);
  for (const r of planResults) {
    console.log(`[${r.status}] Collection '${r.collection}': ${r.details}`);
  }

  return planResults;
}

// CLI entrypoint
const isExecuteFlag = process.argv.includes("--execute");
runProductionIndexMigration({ execute: isExecuteFlag }).catch((err) => {
  console.error("Migration runner failed:", err);
  process.exit(1);
});

