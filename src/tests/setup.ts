import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach } from "vitest";

// Register hooks synchronously (before any await) so Vitest keeps their context.

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replset) await replset.stop();
});

// Required env must be set BEFORE any app module (env.ts) is imported.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.MONGODB_DB_NAME = "test";
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-please-change-1234567890";
// Only the secret (not the key id), so signature verification can be exercised
// while `razorpayConfigured` stays false — no test ever hits the real API.
process.env.RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "test_rzp_secret_please_change_1234567890";
process.env.CRON_SECRET = process.env.CRON_SECRET || "test_cron_secret_1234567890";

// Start a single-node replica set so Mongo transactions work in tests.
const replset = await MongoMemoryReplSet.create({
  instanceOpts: [{ launchTimeout: 60000 }],
  replSet: { count: 1 },
});
process.env.MONGODB_URI = replset.getUri();

// Connect via the app's own helper (registers models) and build unique indexes.
const { dbConnect } = await import("@/server/db/connect");
await dbConnect();

const { WalletTransaction, QuizAttempt, Referral, UserActivityReward, User } = await import(
  "@/server/models"
);
await Promise.all([
  WalletTransaction.syncIndexes(),
  QuizAttempt.syncIndexes(),
  Referral.syncIndexes(),
  UserActivityReward.syncIndexes(),
  User.syncIndexes(),
]);
