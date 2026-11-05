import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { getStoreCouponModel } from "../src/server/store/models/StoreCoupon";
import { getStoreOrderModel } from "../src/server/store/models/StoreOrder";
import { getStoreWithdrawalRequestModel } from "../src/server/store/models/StoreWithdrawalRequest";

interface ExpectedIndexDefinition {
  name: string;
  key: Record<string, number | string>;
  unique: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

interface CollectionAuditRequirement {
  collectionName: string;
  modelResolver: (conn: mongoose.Connection) => mongoose.Model<unknown>;
  expectedIndexes: ExpectedIndexDefinition[];
}

const AUDIT_SPEC: CollectionAuditRequirement[] = [
  {
    collectionName: "store_orders",
    modelResolver: (conn) => getStoreOrderModel(conn) as unknown as mongoose.Model<unknown>,
    expectedIndexes: [
      {
        name: "invoiceNumber_1_partial_unique",
        key: { invoiceNumber: 1 },
        unique: true,
        partialFilterExpression: { invoiceNumber: { $type: "string" } },
      },
    ],
  },
  {
    collectionName: "store_withdrawal_requests",
    modelResolver: (conn) => getStoreWithdrawalRequestModel(conn) as unknown as mongoose.Model<unknown>,
    expectedIndexes: [
      {
        name: "unique_active_withdrawal_per_member",
        key: { member: 1 },
        unique: true,
        partialFilterExpression: {
          status: { $in: ["REQUESTED", "APPROVED", "PROCESSING"] },
        },
      },
    ],
  },
  {
    collectionName: "storecoupons",
    modelResolver: (conn) => getStoreCouponModel(conn) as unknown as mongoose.Model<unknown>,
    expectedIndexes: [
      {
        name: "unique_free_reg_coupon_per_member",
        key: { member: 1, source: 1 },
        unique: true,
        partialFilterExpression: { source: "FREE_REGISTRATION" },
      },
    ],
  },
];

function areKeysEqual(
  actual: Record<string, unknown>,
  expected: Record<string, number | string>,
): boolean {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((k) => actual[k] === expected[k]);
}

function areFilterExpressionsEquivalent(
  actual?: Record<string, unknown>,
  expected?: Record<string, unknown>,
): boolean {
  if (!actual && !expected) return true;
  if (!actual || !expected) return false;
  return JSON.stringify(actual) === JSON.stringify(expected);
}

interface ActualIndexDescription {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Searches actual collection indexes for the intended target index.
 * 1. First matches by exact name AND key.
 * 2. If name differs, matches by exact key AND options (unique + partialFilterExpression).
 * This strictly prevents confusing an ordinary non-unique index (e.g. member_1) with
 * the required partial unique index (unique_active_withdrawal_per_member).
 */
function findMatchingActualIndex(
  actualIndexes: ActualIndexDescription[],
  exp: ExpectedIndexDefinition,
): { index: ActualIndexDescription | null; isExactMatch: boolean; mismatchNotes: string[] } {
  // Strategy 1: Check by exact name
  const byName = actualIndexes.find((act) => act.name === exp.name);
  if (byName) {
    const keyMatch = areKeysEqual(byName.key, exp.key);
    const uniqueMatch = Boolean(byName.unique) === Boolean(exp.unique);
    const filterMatch = areFilterExpressionsEquivalent(
      byName.partialFilterExpression,
      exp.partialFilterExpression,
    );
    const notes: string[] = [];
    if (!keyMatch) notes.push(`Keys mismatch: expected ${JSON.stringify(exp.key)}, got ${JSON.stringify(byName.key)}`);
    if (!uniqueMatch) notes.push(`Unique mismatch: expected ${exp.unique}, got ${Boolean(byName.unique)}`);
    if (!filterMatch) notes.push(`Filter mismatch: expected ${JSON.stringify(exp.partialFilterExpression)}, got ${JSON.stringify(byName.partialFilterExpression)}`);

    return {
      index: byName,
      isExactMatch: keyMatch && uniqueMatch && filterMatch,
      mismatchNotes: notes,
    };
  }

  // Strategy 2: Check by key + options match (in case index was given auto/different name)
  const byKeyAndOptions = actualIndexes.find((act) => {
    const keyMatch = areKeysEqual(act.key, exp.key);
    const uniqueMatch = Boolean(act.unique) === Boolean(exp.unique);
    const filterMatch = areFilterExpressionsEquivalent(
      act.partialFilterExpression,
      exp.partialFilterExpression,
    );
    return keyMatch && uniqueMatch && filterMatch;
  });

  if (byKeyAndOptions) {
    return {
      index: byKeyAndOptions,
      isExactMatch: true,
      mismatchNotes: [],
    };
  }

  // Strategy 3: Check by key only (to report mismatch against non-unique index)
  const byKeyOnly = actualIndexes.find((act) => areKeysEqual(act.key, exp.key));
  if (byKeyOnly) {
    const notes: string[] = [];
    if (Boolean(byKeyOnly.unique) !== Boolean(exp.unique)) {
      notes.push(`Unique mismatch: expected ${exp.unique}, got ${Boolean(byKeyOnly.unique)}`);
    }
    if (!areFilterExpressionsEquivalent(byKeyOnly.partialFilterExpression, exp.partialFilterExpression)) {
      notes.push(`Filter mismatch: expected ${JSON.stringify(exp.partialFilterExpression)}, got ${JSON.stringify(byKeyOnly.partialFilterExpression)}`);
    }
    return {
      index: byKeyOnly,
      isExactMatch: false,
      mismatchNotes: notes,
    };
  }

  return { index: null, isExactMatch: false, mismatchNotes: ["Index not found"] };
}

async function verifyIndexesReadOnly() {
  console.log("=================================================");
  console.log("   READ-ONLY PRODUCTION INDEX VERIFICATION AUDIT ");
  console.log("   (Zero mutations: No syncIndexes/create/drop)  ");
  console.log("=================================================");

  const uri = process.env.JMD_MONGODB_URI || process.env.MONGODB_URI;
  const dbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";

  if (!uri) {
    console.error("❌ MONGODB_URI not configured in .env.local");
    process.exit(1);
  }

  console.log(`Target Database: '${dbName}'`);
  console.log("Connecting in strictly READ-ONLY inspection mode...");

  let conn: mongoose.Connection;
  try {
    conn = mongoose.createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await conn.asPromise();
    console.log(`✓ Connected to MongoDB Atlas cluster (${conn.host || "Atlas"}).`);
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`❌ Connection failed: ${error.message}`);
    process.exit(1);
  }

  const db = conn.db;
  if (!db) {
    console.error("❌ Failed to obtain MongoDB Db handle.");
    await conn.close();
    process.exit(1);
  }

  // Pre-flight database identity verification
  const verifiedDbName = db.databaseName;
  console.log(`✓ Database Identity Verified: '${verifiedDbName}'`);
  if (verifiedDbName !== "jai_maa_durga") {
    console.error(`❌ FATAL: Database identity is '${verifiedDbName}', expected 'jai_maa_durga'`);
    await conn.close();
    process.exit(1);
  }

  let allCompliant = true;
  const verificationResults: { collection: string; indexName: string; verified: boolean }[] = [];

  try {
    for (const spec of AUDIT_SPEC) {
      console.log(`\n--- [Collection: ${spec.collectionName}] ---`);

      // 1. Verify runtime Mongoose model collection mapping
      const runtimeModel = spec.modelResolver(conn);
      const runtimeModelCollection = runtimeModel.collection.name;
      console.log(`  Mongoose Model Collection: '${runtimeModelCollection}'`);

      if (runtimeModelCollection !== spec.collectionName) {
        console.error(
          `  ❌ RUNTIME MAPPING MISMATCH: Spec targets '${spec.collectionName}', but Model uses '${runtimeModelCollection}'`,
        );
        allCompliant = false;
      } else {
        console.log(`  ✓ Runtime model mapping aligns with '${spec.collectionName}'.`);
      }

      // 2. Fetch actual indexes via read-only collection.indexes()
      const coll = db.collection(spec.collectionName);

      let actualIndexes: ActualIndexDescription[] = [];
      try {
        actualIndexes = (await coll.indexes()) as ActualIndexDescription[];
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`  ❌ Failed to query indexes on '${spec.collectionName}': ${error.message}`);
        actualIndexes = [];
      }

      console.log(`  Found ${actualIndexes.length} actual index(es) in database.`);

      // 3. Inspect expected indexes
      const verifiedIndexNames = new Set<string>();

      for (const exp of spec.expectedIndexes) {
        const matchResult = findMatchingActualIndex(actualIndexes, exp);

        if (!matchResult.index) {
          console.error(
            `  ❌ MISSING: Index '${exp.name}' matching keys ${JSON.stringify(exp.key)}`,
          );
          allCompliant = false;
          verificationResults.push({
            collection: spec.collectionName,
            indexName: exp.name,
            verified: false,
          });
          continue;
        }

        if (matchResult.isExactMatch) {
          const act = matchResult.index;
          verifiedIndexNames.add(act.name);
          console.log(
            `  ✓ VERIFIED MATCH: '${act.name}' | Keys: ${JSON.stringify(act.key)} | Unique: ${Boolean(act.unique)}`,
          );
          if (act.partialFilterExpression) {
            console.log(
              `    PartialFilter: ${JSON.stringify(act.partialFilterExpression)}`,
            );
          }
          verificationResults.push({
            collection: spec.collectionName,
            indexName: exp.name,
            verified: true,
          });
        } else {
          console.error(`  ⚠️ MISMATCH: Target index '${exp.name}' failed verification against '${matchResult.index.name}':`);
          for (const note of matchResult.mismatchNotes) {
            console.error(`     - ${note}`);
          }
          allCompliant = false;
          verificationResults.push({
            collection: spec.collectionName,
            indexName: exp.name,
            verified: false,
          });
        }
      }

      // 4. Report other existing indexes
      for (const act of actualIndexes) {
        if (act.name === "_id_") continue;
        if (verifiedIndexNames.has(act.name)) continue;
        console.log(`  ℹ Existing index: '${act.name}' | Keys: ${JSON.stringify(act.key)}${act.unique ? " | Unique: true" : ""}`);
      }
    }

    console.log("\n=================================================");
    console.log("   AUDIT SUMMARY & FINAL VERIFICATION STATUS    ");
    console.log("=================================================");
    for (const res of verificationResults) {
      console.log(`  - [${res.verified ? "VERIFIED" : "FAILED"}] ${res.collection} -> ${res.indexName}`);
    }

    if (allCompliant && verificationResults.length === 3 && verificationResults.every((r) => r.verified)) {
      console.log("\n>>> ALL THREE REQUIRED PRODUCTION INDEXES VERIFIED. <<<");
      console.log("OVERALL INDEX VERIFICATION STATUS: COMPLIANT (READ-ONLY VERIFIED)");
    } else {
      console.log("\nOVERALL INDEX VERIFICATION STATUS: AUDIT COMPLETED WITH NOTES (Action Required)");
    }

    console.log("SAFETY GUARANTEE: Zero index mutations executed. Pure read-only inspection.");
    console.log("=================================================");

    await conn.close();
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Audit error: ${error.message}`);
    await conn.close();
    process.exit(1);
  }
}

verifyIndexesReadOnly().catch(console.error);
