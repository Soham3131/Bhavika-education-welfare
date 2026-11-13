import { NextRequest, NextResponse } from "next/server";
import { handleRechargeWebhookCallback } from "@/server/store/services/recharge.service";
import crypto from "node:crypto";

export const runtime = "nodejs";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyTokenOrSignature(
  req: NextRequest,
  rawPayload: string,
  configuredSecret?: string,
): boolean {
  if (!configuredSecret) {
    // If provider has not configured callback authentication, we will rely on Status API reconciliation
    return true;
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") || url.searchParams.get("secret");
  const headerToken = req.headers.get("x-callback-token") || req.headers.get("x-webhook-secret");
  const signature = req.headers.get("x-provider-signature") || req.headers.get("x-signature");

  if (queryToken && safeCompare(queryToken, configuredSecret)) return true;
  if (headerToken && safeCompare(headerToken, configuredSecret)) return true;

  if (signature) {
    const expectedHex = crypto
      .createHmac("sha256", configuredSecret)
      .update(rawPayload)
      .digest("hex");
    if (safeCompare(signature.toLowerCase(), expectedHex.toLowerCase())) return true;
  }

  return false;
}

async function processCallback(req: NextRequest) {
  const configuredSecret =
    process.env.A1TOPUP_CALLBACK_TOKEN || process.env.RECHARGE_WEBHOOK_SECRET;

  const url = new URL(req.url);
  let txid = url.searchParams.get("txid") || "";
  let status = url.searchParams.get("status") || "";
  let opid = url.searchParams.get("opid") || "";
  let orderid = url.searchParams.get("orderid") || "";

  let rawBody = "";
  if (req.method === "POST") {
    try {
      rawBody = await req.text();
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = JSON.parse(rawBody);
        txid = json.txid || json.providerRef || txid;
        status = json.status || status;
        opid = json.opid || opid;
        orderid = json.orderid || json.rechargeRef || orderid;
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = new URLSearchParams(rawBody);
        txid = form.get("txid") || form.get("providerRef") || txid;
        status = form.get("status") || status;
        opid = form.get("opid") || opid;
        orderid = form.get("orderid") || form.get("rechargeRef") || orderid;
      }
    } catch {
      // Fall back to query parameters
    }
  }

  // 1. Authentication check
  const isAuthValid = verifyTokenOrSignature(req, rawBody, configuredSecret);
  if (!isAuthValid) {
    return NextResponse.json(
      { error: "Unauthorized callback: invalid token or signature." },
      { status: 401 },
    );
  }

  if (!txid && !orderid) {
    return NextResponse.json(
      { error: "Missing required parameter: txid or orderid required." },
      { status: 400 },
    );
  }

  // Normalize status
  const normalizedStatusUpper = status.trim().toUpperCase();
  let normalizedStatus: "SUCCESS" | "FAILED" | "PENDING" = "PENDING";
  if (normalizedStatusUpper === "SUCCESS") normalizedStatus = "SUCCESS";
  else if (normalizedStatusUpper === "FAILED") normalizedStatus = "FAILED";

  // Ambiguity Resolution:
  // In documentation, txid can be provider txid OR merchant recharge id
  const isTxidMerchantRef = txid.startsWith("JMD-RCH-");
  const resolvedOrderId = orderid || (isTxidMerchantRef ? txid : undefined);
  const resolvedProviderRef = isTxidMerchantRef ? undefined : txid;

  // 2. Process with mandatory Status API reconciliation before financial mutations
  // (guards against spoofed parameters or unauthenticated callbacks)
  const result = await handleRechargeWebhookCallback({
    orderId: resolvedOrderId,
    providerRef: resolvedProviderRef,
    status: normalizedStatus,
    operatorRef: opid || undefined,
    reconcileWithStatusApi: true,
  });

  return NextResponse.json({
    success: true,
    processed: result.processed,
    isDuplicate: result.isDuplicate,
    message: result.message,
    orderRef: result.order?.rechargeRef,
    status: result.order?.status,
  });
}

export async function GET(req: NextRequest) {
  return processCallback(req);
}

export async function POST(req: NextRequest) {
  return processCallback(req);
}

