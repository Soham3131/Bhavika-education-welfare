import "server-only";
import mongoose, { Connection } from "mongoose";
import { env } from "@/lib/env";

/**
 * Serverless-safe Mongoose connection dedicated exclusively to the
 * Jai Maa Durga commerce platform.
 *
 * Uses `mongoose.createConnection()` so that models, schemas, connection pools,
 * and transactions are strictly isolated from Bhavika's default connection.
 */

type ConnectionCache = {
  conn: Connection | null;
  promise: Promise<Connection> | null;
};

const globalForStore = globalThis as unknown as {
  _storeMongoose?: ConnectionCache;
};

const cache: ConnectionCache = globalForStore._storeMongoose ?? {
  conn: null,
  promise: null,
};

globalForStore._storeMongoose = cache;

export async function getStoreDb(): Promise<Connection> {
  if (cache.conn && cache.conn.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    // Intended database name is 'jai_maa_durga', fallback to MONGODB_DB_NAME in test environments.
    const dbName = process.env.JMD_MONGODB_DB_NAME || (env.NODE_ENV === "test" ? "test_jmd" : "jai_maa_durga");
    const uri = process.env.JMD_MONGODB_URI || env.MONGODB_URI;

    cache.promise = new Promise<Connection>((resolve, reject) => {
      const conn = mongoose.createConnection(uri, {
        dbName,
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      });

      conn.asPromise()
        .then(() => resolve(conn))
        .catch((err) => {
          cache.promise = null;
          reject(err);
        });
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}

/**
 * Execute a function within a multi-document MongoDB transaction on the
 * Jai Maa Durga database.
 */
export async function withStoreTransaction<T>(
  fn: (session: mongoose.ClientSession, conn: Connection) => Promise<T>,
): Promise<T> {
  const conn = await getStoreDb();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session, conn);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
