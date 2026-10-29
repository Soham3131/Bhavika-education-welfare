import "server-only";
import { z } from "zod";
import { SITE } from "@/lib/constants";

/**
 * Server-only, validated environment variables.
 * Importing this file into a client component will fail the build (server-only),
 * which prevents accidental secret exposure.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB_NAME: z.string().default("bhavika"),

  // Auth.js
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be a long random string"),
  AUTH_URL: z.string().url().optional(),

  // Extra secret code required (in addition to email + password) for admin sign-in.
  // Override with a strong value in production.
  ADMIN_ACCESS_CODE: z.string().min(4).default("BHAVIKA-ADMIN-2026"),

  // Public site URL (also exposed as NEXT_PUBLIC_SITE_URL)
  SITE_URL: z.string().url().optional(),

  // Cloudinary (media)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("bhavika"),

  // Email. Brevo is the active transactional provider; Resend is kept as an
  // optional fallback so an existing deployment keeps working.
  BREVO_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("alerts@avanienterprises.in"),
  EMAIL_FROM_NAME: z.string().default("Bhavika Foundation"),

  // Rate limiting (Upstash) — optional; falls back to in-memory in dev
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Phase 2 integration (Jai Maa Durga) — not required in Phase 1
  JMD_SITE_MODE: z.string().optional(),
  JMD_MONGODB_DB_NAME: z.string().optional(),
  JMD_INTEGRATION_URL: z.string().optional(),
  JMD_INTEGRATION_SECRET: z.string().optional(),
  JMD_REDEMPTION_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Secret that authorises the scheduled jobs under /api/cron/*. Vercel Cron
  // sends it as `Authorization: Bearer <CRON_SECRET>`. Without it the cron
  // endpoints refuse every caller, so they can never be triggered publicly.
  CRON_SECRET: z.string().optional(),
  ENABLE_CRON_JOBS: z.string().optional(),
  ENABLE_COUPON_EXPIRY_CRON: z.string().optional(),
  ENABLE_REFUND_RECONCILE_CRON: z.string().optional(),

  // Razorpay (donations). key_id is safe to expose to the client; the secret and
  // webhook secret are server-only. All optional so the app runs without them —
  // the donate button reports "not configured" until they are set.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Seeding
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid or missing environment variables:\n${issues}\n\nCopy .env.example to .env.local and fill in the values.`,
  );
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";

export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

/** True when any transactional email provider is usable. */
export const emailConfigured = Boolean(env.BREVO_API_KEY || env.RESEND_API_KEY);

/** True when Razorpay is fully configured and donations can be taken. */
export const razorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const emailProvider: "brevo" | "resend" | "console" = env.BREVO_API_KEY
  ? "brevo"
  : env.RESEND_API_KEY
    ? "resend"
    : "console";

/**
 * Resolves the operational base URL for transactional emails and links.
 * Avoids returning localhost when running in production/Vercel.
 */
export function getAppBaseUrl(): string {
  if (env.SITE_URL && !env.SITE_URL.includes("localhost")) {
    return env.SITE_URL;
  }
  if (process.env.VERCEL_URL && isProd) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return env.SITE_URL && !env.SITE_URL.includes("localhost") ? env.SITE_URL : SITE.url;
}
