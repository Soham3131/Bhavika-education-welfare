import crypto from "node:crypto";
import { handle, ok } from "@/server/http";
import { handleRechargeWebhookCallback } from "@/server/store/services/recharge.service";
import { DomainError } from "@/server/errors";
import { z } from "zod";

export const runtime = "nodejs";

const webhookSchema = z.object({
  providerRef: z.string().optional(),
  orderId: z.string().optional(),
  txid: z.string().optional(),
  status: z.enum(["SUCCESS", "FAILED"]),
  failureReason: z.string().optional(),
  providerPayoutPaise: z.number().int().optional(),
});

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (safeCompare(signature.toLowerCase(), expectedHex.toLowerCase())) {
    return true;
  }

  const expectedBase64 = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  return safeCompare(signature, expectedBase64);
}

export const POST = handle(async (req) => {
  const configuredSecret = process.env.RECHARGE_WEBHOOK_SECRET;

  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    throw new DomainError(
      "Webhook receiver unavailable: RECHARGE_WEBHOOK_SECRET is not configured in production.",
      503,
      "WEBHOOK_AUTH_UNCONFIGURED",
    );
  }

  const rawBody = await req.text();

  if (configuredSecret) {
    const signature =
      req.headers.get("x-provider-signature") ||
      req.headers.get("x-webhook-signature");
    const secretHeader = req.headers.get("x-webhook-secret");

    let isAuthenticated = false;

    if (signature) {
      isAuthenticated = verifyHmacSignature(rawBody, signature, configuredSecret);
    } else if (secretHeader) {
      isAuthenticated = safeCompare(secretHeader, configuredSecret);
    }

    if (!isAuthenticated) {
      throw new DomainError(
        "Unauthorized webhook callback: invalid or missing webhook signature/secret. Arbitrary Bearer secrets are rejected.",
        401,
        "UNAUTHORIZED_WEBHOOK",
      );
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new DomainError("Invalid JSON payload in webhook body", 400, "INVALID_JSON");
  }

  const parsed = webhookSchema.parse(body);

  const result = await handleRechargeWebhookCallback({
    providerRef: parsed.providerRef || parsed.txid,
    orderId: parsed.orderId,
    status: parsed.status,
    failureReason: parsed.failureReason,
    providerPayoutPaise: parsed.providerPayoutPaise,
  });

  return ok(result);
});
