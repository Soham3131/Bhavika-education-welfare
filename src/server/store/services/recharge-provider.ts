import "server-only";
import { RechargeServiceType } from "../models/StoreRechargeOrder";

export interface Operator {
  id: string;
  name: string;
  serviceType: RechargeServiceType;
  category: string;
}

export interface RechargePlan {
  id: string;
  amountRupees: number;
  amountPaise: number;
  validity: string;
  description: string;
  category: "TOPUP" | "UNLIMITED" | "DATA" | "SPECIAL";
}

export interface RechargeRequest {
  rechargeRef: string;
  serviceType: RechargeServiceType;
  operator: string;
  consumerNumber: string;
  circle?: string | null;
  amountPaise: number;
}

export interface RechargeSubmissionResult {
  status: "SUCCESS" | "PENDING" | "FAILED";
  providerRef: string;
  providerPayoutPaise: number;
  failureReason?: string;
}

export interface RechargeStatusResult {
  status: "SUCCESS" | "PENDING" | "FAILED" | "REVERSED";
  providerRef: string;
  providerPayoutPaise: number;
  failureReason?: string;
}

export interface RechargeProvider {
  name: string;
  fetchOperators(service: RechargeServiceType): Promise<Operator[]>;
  fetchPlans(operator: string, circle?: string): Promise<RechargePlan[]>;
  submitRecharge(request: RechargeRequest): Promise<RechargeSubmissionResult>;
  checkStatus(providerRef: string): Promise<RechargeStatusResult>;
}

// In-memory mock database of provider references for asynchronous reconciliation testing
const mockProviderRecords = new Map<
  string,
  {
    status: "SUCCESS" | "PENDING" | "FAILED" | "REVERSED";
    providerPayoutPaise: number;
    failureReason?: string;
  }
>();

let forcedNextOutcome: "SUCCESS" | "PENDING" | "FAILED" | null = null;

export function setMockNextOutcome(outcome: "SUCCESS" | "PENDING" | "FAILED" | null) {
  forcedNextOutcome = outcome;
}

export function updateMockRecordStatus(
  providerRef: string,
  newStatus: "SUCCESS" | "FAILED" | "REVERSED",
  failureReason?: string,
) {
  const record = mockProviderRecords.get(providerRef);
  if (record) {
    record.status = newStatus;
    if (failureReason) record.failureReason = failureReason;
  }
}

export class MockRechargeProvider implements RechargeProvider {
  name = "MOCK_PROVIDER";

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[Security] MockRechargeProvider is strictly forbidden and not permitted in production under all circumstances.",
      );
    }
  }

  async fetchOperators(service: RechargeServiceType): Promise<Operator[]> {
    const catalogue: Record<RechargeServiceType, Operator[]> = {
      MOBILE_PREPAID: [
        { id: "JIO", name: "Reliance Jio", serviceType: "MOBILE_PREPAID", category: "Telecom" },
        { id: "AIRTEL", name: "Bharti Airtel", serviceType: "MOBILE_PREPAID", category: "Telecom" },
        { id: "VI", name: "Vodafone Idea", serviceType: "MOBILE_PREPAID", category: "Telecom" },
        { id: "BSNL", name: "BSNL", serviceType: "MOBILE_PREPAID", category: "Telecom" },
      ],
      DTH: [
        { id: "TATA_PLAY", name: "Tata Play", serviceType: "DTH", category: "Television" },
        { id: "AIRTEL_DTH", name: "Airtel Digital TV", serviceType: "DTH", category: "Television" },
        { id: "DISH_TV", name: "Dish TV", serviceType: "DTH", category: "Television" },
      ],
      FASTAG: [
        { id: "NHAI", name: "NHAI FASTag", serviceType: "FASTAG", category: "Toll" },
        { id: "ICICI_FASTAG", name: "ICICI Bank FASTag", serviceType: "FASTAG", category: "Toll" },
      ],
      ELECTRICITY: [
        { id: "BESCOM", name: "BESCOM Karnataka", serviceType: "ELECTRICITY", category: "Power" },
        { id: "TATA_POWER", name: "Tata Power Mumbai", serviceType: "ELECTRICITY", category: "Power" },
        { id: "BSES_DELHI", name: "BSES Rajdhani Delhi", serviceType: "ELECTRICITY", category: "Power" },
      ],
      GAS: [
        { id: "IGL", name: "Indraprastha Gas (IGL)", serviceType: "GAS", category: "Utilities" },
        { id: "MAHANAGAR_GAS", name: "Mahanagar Gas Ltd", serviceType: "GAS", category: "Utilities" },
      ],
      WATER: [
        { id: "DELHI_JAL", name: "Delhi Jal Board", serviceType: "WATER", category: "Water" },
        { id: "BWSSB", name: "BWSSB Bangalore", serviceType: "WATER", category: "Water" },
      ],
    };

    return catalogue[service] || [];
  }

  async fetchPlans(operator: string): Promise<RechargePlan[]> {
    return [
      {
        id: `${operator}-199`,
        amountRupees: 199,
        amountPaise: 19900,
        validity: "28 Days",
        description: "1.5GB/day + Unlimited Calls + 100 SMS/day",
        category: "UNLIMITED",
      },
      {
        id: `${operator}-299`,
        amountRupees: 299,
        amountPaise: 29900,
        validity: "28 Days",
        description: "2GB/day + 5G Unlimited + Disney+ Hotstar Mobile",
        category: "UNLIMITED",
      },
      {
        id: `${operator}-666`,
        amountRupees: 666,
        amountPaise: 66600,
        validity: "84 Days",
        description: "1.5GB/day + Unlimited Calls for 84 Days",
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

  async submitRecharge(request: RechargeRequest): Promise<RechargeSubmissionResult> {
    const providerRef = `PROV-MOCK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Payout margin to JMD: 2% of transaction amount (e.g. ₹299 -> ₹5.98 = 598 paise)
    const providerPayoutPaise = Math.round(request.amountPaise * 0.02);

    let status: "SUCCESS" | "PENDING" | "FAILED" = "SUCCESS";
    let failureReason: string | undefined;

    if (forcedNextOutcome) {
      status = forcedNextOutcome;
      forcedNextOutcome = null; // consume
      if (status === "FAILED") {
        failureReason = "Provider gateway rejected: Invalid consumer number or operator offline.";
      }
    } else {
      // Deterministic trigger: test numbers starting with '000' fail immediately
      if (request.consumerNumber.startsWith("000")) {
        status = "FAILED";
        failureReason = "Provider gateway rejected: Invalid consumer number.";
      } else if (request.consumerNumber.startsWith("999")) {
        // Test numbers starting with '999' return PENDING to test async reconciliation
        status = "PENDING";
      }
    }

    mockProviderRecords.set(providerRef, {
      status,
      providerPayoutPaise,
      failureReason,
    });

    return {
      status,
      providerRef,
      providerPayoutPaise,
      failureReason,
    };
  }

  async checkStatus(providerRef: string): Promise<RechargeStatusResult> {
    const record = mockProviderRecords.get(providerRef);
    if (!record) {
      return {
        status: "FAILED",
        providerRef,
        providerPayoutPaise: 0,
        failureReason: "Transaction reference not found at provider",
      };
    }

    return {
      status: record.status,
      providerRef,
      providerPayoutPaise: record.providerPayoutPaise,
      failureReason: record.failureReason,
    };
  }
}

let activeProvider: RechargeProvider | null = null;

export function getRechargeProvider(): RechargeProvider {
  if (!activeProvider) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[Security] No production recharge provider configured. MockRechargeProvider is strictly forbidden in production.",
      );
    }
    activeProvider = new MockRechargeProvider();
  }
  return activeProvider;
}

export function setRechargeProvider(provider: RechargeProvider) {
  activeProvider = provider;
}
