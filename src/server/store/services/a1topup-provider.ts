import "server-only";
import {
  RechargeProvider,
  RechargeRequest,
  RechargeSubmissionResult,
  RechargeStatusResult,
  Operator,
  RechargePlan,
} from "./recharge-provider";
import { RechargeServiceType } from "../models/StoreRechargeOrder";
import {
  findA1Operator,
  resolveA1CircleCode,
  getA1OperatorsForService,
} from "./a1topup-mapping";
import { DomainError } from "@/server/errors";

export class A1TopupProvider implements RechargeProvider {
  name = "A1TOPUP";

  private username: string;
  private password?: string;
  private baseUrl: string;

  constructor() {
    this.username =
      process.env.A1TOPUP_USERNAME?.trim() || "504536";
    this.password = process.env.A1TOPUP_PASSWORD?.trim();
    this.baseUrl =
      process.env.A1TOPUP_API_BASE_URL?.trim() || "https://business.a1topup.com";
  }

  isConfigured(): boolean {
    return Boolean(this.username && this.password);
  }

  async fetchOperators(service: RechargeServiceType): Promise<Operator[]> {
    const list = getA1OperatorsForService(service);
    return list.map((op) => ({
      id: op.id,
      name: op.name,
      serviceType: op.serviceType,
      category: op.category,
    }));
  }

  async fetchPlans(operator: string, circle?: string): Promise<RechargePlan[]> {
    const resolvedCircle = resolveA1CircleCode(circle);
    const circleLabel = resolvedCircle === "20" ? "Haryana" : `Circle ${resolvedCircle}`;

    return [
      {
        id: `${operator}-199`,
        amountRupees: 199,
        amountPaise: 19900,
        validity: "28 Days",
        description: `1.5GB/day + Unlimited Calls + 100 SMS/day (${circleLabel})`,
        category: "UNLIMITED",
      },
      {
        id: `${operator}-299`,
        amountRupees: 299,
        amountPaise: 29900,
        validity: "28 Days",
        description: `2GB/day + 5G Unlimited Data (${circleLabel})`,
        category: "UNLIMITED",
      },
      {
        id: `${operator}-666`,
        amountRupees: 666,
        amountPaise: 66600,
        validity: "84 Days",
        description: `1.5GB/day + Unlimited Calls for 84 Days (${circleLabel})`,
        category: "UNLIMITED",
      },
      {
        id: `${operator}-19`,
        amountRupees: 19,
        amountPaise: 1900,
        validity: "1 Day",
        description: "1GB High Speed Data Booster",
        category: "DATA",
      },
    ];
  }

  /**
   * Submits a recharge request to A1Topup:
   * POST https://business.a1topup.com/recharge/api
   * Parameters: username, pwd, circlecode, operatorcode, number, amount, orderid, format=json, value1, value2
   */
  async submitRecharge(request: RechargeRequest): Promise<RechargeSubmissionResult> {
    if (!this.password) {
      throw new DomainError(
        "Recharge services are currently offline: production telecom aggregator credentials (A1TOPUP_PASSWORD) have not been configured.",
        503,
        "RECHARGE_PROVIDER_NOT_CONFIGURED",
      );
    }

    const matchedOp = findA1Operator(request.operator);
    const operatorCode = matchedOp?.code || request.operator;
    const circleCode = resolveA1CircleCode(request.circle);
    const amountRupees = Math.floor(request.amountPaise / 100);

    const params = new URLSearchParams();
    params.set("username", this.username);
    params.set("pwd", this.password);
    params.set("circlecode", circleCode);
    params.set("operatorcode", operatorCode);
    params.set("number", request.consumerNumber.trim());
    params.set("amount", String(amountRupees));
    params.set("orderid", request.rechargeRef);
    params.set("format", "json");

    if (request.value1) params.set("value1", request.value1.trim());
    if (request.value2) params.set("value2", request.value2.trim());

    const endpoint = `${this.baseUrl}/recharge/api`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        // Non-JSON response or HTML error from gateway
        return {
          status: "PENDING",
          providerRef: `PEND-PARSE-${request.rechargeRef}`,
          providerPayoutPaise: 0,
          failureReason: `Gateway returned non-JSON response: ${rawText.slice(0, 100)}`,
        };
      }

      const statusStr = String(data.status || "").trim().toUpperCase();
      const providerRef = String(data.txid || data.orderid || request.rechargeRef);
      const operatorRef = data.opid ? String(data.opid) : undefined;

      // Payout margin to JMD: 2% standard telecom revenue split
      const providerPayoutPaise = Math.round(request.amountPaise * 0.02);

      if (statusStr === "SUCCESS") {
        return {
          status: "SUCCESS",
          providerRef,
          operatorRef,
          providerPayoutPaise,
          rawResponse: data,
        };
      }

      if (statusStr === "FAILED") {
        return {
          status: "FAILED",
          providerRef,
          operatorRef,
          providerPayoutPaise: 0,
          failureReason:
            typeof data.error === "string"
              ? data.error
              : typeof data.message === "string"
              ? data.message
              : "Provider rejected recharge transaction.",
          rawResponse: data,
        };
      }

      // If "Pending" or uncertain response, never mark FAILED or retry blindly
      return {
        status: "PENDING",
        providerRef,
        operatorRef,
        providerPayoutPaise: 0,
        rawResponse: data,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      // Network timeout / connection drop must fail open to PENDING reconciliation, NEVER refund prematurely or retry blindly
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        status: "PENDING",
        providerRef: `PEND-TIMEOUT-${request.rechargeRef}`,
        providerPayoutPaise: 0,
        failureReason: isAbort
          ? "Provider HTTP request timed out. Queued for status reconciliation."
          : `Network error reaching telecom gateway: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Reconciles transaction status against A1Topup Status API:
   * POST https://business.a1topup.com/recharge/status
   * Parameters: username, pwd, orderid, format=json
   */
  async checkStatus(orderIdOrProviderRef: string): Promise<RechargeStatusResult> {
    if (!this.password) {
      return {
        status: "PENDING",
        providerRef: orderIdOrProviderRef,
        providerPayoutPaise: 0,
        failureReason: "A1TOPUP_PASSWORD not configured",
      };
    }

    const params = new URLSearchParams();
    params.set("username", this.username);
    params.set("pwd", this.password);
    params.set("orderid", orderIdOrProviderRef);
    params.set("format", "json");

    const endpoint = `${this.baseUrl}/recharge/status`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        return {
          status: "PENDING",
          providerRef: orderIdOrProviderRef,
          providerPayoutPaise: 0,
          failureReason: "Non-JSON status response from provider",
        };
      }

      const statusStr = String(data.status || "").trim().toUpperCase();
      const providerRef = String(data.txid || data.orderid || orderIdOrProviderRef);
      const operatorRef = data.opid ? String(data.opid) : undefined;
      const amountNum = Number(data.amount) || 0;
      const amountPaise = amountNum * 100;
      const providerPayoutPaise = Math.round(amountPaise * 0.02);

      if (statusStr === "SUCCESS") {
        return {
          status: "SUCCESS",
          providerRef,
          operatorRef,
          providerPayoutPaise,
          rawResponse: data,
        };
      }

      if (statusStr === "FAILED") {
        return {
          status: "FAILED",
          providerRef,
          operatorRef,
          providerPayoutPaise: 0,
          failureReason:
            typeof data.error === "string"
              ? data.error
              : typeof data.message === "string"
              ? data.message
              : "Provider confirmed transaction failed.",
          rawResponse: data,
        };
      }

      return {
        status: "PENDING",
        providerRef,
        operatorRef,
        providerPayoutPaise: 0,
        rawResponse: data,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      return {
        status: "PENDING",
        providerRef: orderIdOrProviderRef,
        providerPayoutPaise: 0,
        failureReason: `Status API network error: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Queries merchant wallet balance at A1Topup:
   * POST https://business.a1topup.com/recharge/balance
   * Parameters: username, pwd, format=json
   */
  async checkBalance(): Promise<{ balanceRupees: number; currency: string; raw?: unknown }> {
    if (!this.password) {
      throw new DomainError(
        "A1Topup API password (A1TOPUP_PASSWORD) is not configured.",
        503,
        "RECHARGE_PROVIDER_NOT_CONFIGURED",
      );
    }

    const params = new URLSearchParams();
    params.set("username", this.username);
    params.set("pwd", this.password);
    params.set("format", "json");

    const endpoint = `${this.baseUrl}/recharge/balance`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new DomainError(
          `Failed to parse balance response: ${rawText.slice(0, 100)}`,
          502,
          "PROVIDER_RESPONSE_INVALID",
        );
      }

      const balanceRupees = Number(data.balance ?? data.Balance ?? 0);
      return {
        balanceRupees,
        currency: "INR",
        raw: {
          status: data.status,
          balance: data.balance ?? data.Balance,
        },
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof DomainError) throw err;
      throw new DomainError(
        `Error querying provider balance: ${err instanceof Error ? err.message : "Unknown"}`,
        502,
        "PROVIDER_UNREACHABLE",
      );
    }
  }
}

