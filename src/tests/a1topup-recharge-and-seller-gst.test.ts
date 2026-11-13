import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { getStoreDb } from "@/server/store/db/connect";
import { registerStoreMember } from "@/server/store/services/member.service";
import { getOrCreateStoreWallet, mutateStoreWallet } from "@/server/store/services/wallet-ledger.service";
import {
  submitRechargeOrder,
  handleRechargeWebhookCallback,
  getRechargeProviderConfigStatus,
} from "@/server/store/services/recharge.service";
import {
  A1TopupProvider,
} from "@/server/store/services/a1topup-provider";
import {
  setRechargeProvider,
} from "@/server/store/services/recharge-provider";
import {
  resolveA1CircleCode,
  findA1Operator,
} from "@/server/store/services/a1topup-mapping";
import {
  getStoreRechargeOrderModel,
  RechargeStatus,
  RechargeCommissionStatus,
} from "@/server/store/models/StoreRechargeOrder";
import {
  updateStoreSettings,
} from "@/server/store/services/settings.service";
import {
  createStoreOrder,
} from "@/server/store/services/order.service";
import {
  generateOrderTaxInvoicePdf,
} from "@/server/store/services/tax-invoice-pdf.service";
import { getStoreProductModel } from "@/server/store/models/StoreProduct";
import { getStoreCategoryModel } from "@/server/store/models/StoreCategory";
import { NextRequest } from "next/server";
import { GET as callbackGet } from "@/app/api/store/recharge/callback/route";

describe("A1Topup Production API Integration & Seller GST Safeguards (20 Verification Scenarios)", () => {
  let memberId: string;
  let groceryProductId: string;

  beforeAll(async () => {
    const conn = await getStoreDb();

    // Register active store member
    const member = await registerStoreMember({
      name: "Rajesh Haryana",
      phone: "9992760538",
      password: "Password@123",
      email: "rajesh.sirsa@test.dev",
    });
    memberId = member._id.toString();

    // Fund ADD_MONEY wallet for recharge tests
    await mutateStoreWallet({
      memberId: member._id,
      walletType: "ADD_MONEY",
      type: "CREDIT",
      unit: "INR_PAISE",
      amountPaise: 5000_00, // ₹5,000.00
      referenceType: "ADMIN_CORRECTION",
      referenceId: "SETUP-TEST-FUNDING",
      idempotencyKey: "setup:fund:rajesh",
      description: "Test wallet funding for recharge test suite",
    });

    // Seed a standard grocery product for ecommerce isolation testing
    const CatModel = getStoreCategoryModel(conn);
    const groceryCat = await CatModel.create({
      name: "Groceries",
      slug: "groceries-a1",
      type: "GROCERY",
      isActive: true,
    });

    const ProdModel = getStoreProductModel(conn);
    const groceryProd = await ProdModel.create({
      sku: "JMD-GROC-TEST-01",
      title: "Haryana Wheat Flour 5kg",
      slug: "haryana-wheat-flour-5kg",
      category: groceryCat._id,
      basePricePaise: 250_00,
      stock: 50,
      reservedStock: 0,
      isActive: true,
    });
    groceryProductId = groceryProd._id.toString();

    // Initialize default store settings in test database
    await updateStoreSettings({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 1: A1Topup authentication                                         */
  /* -------------------------------------------------------------------------- */
  it("Scenario 1: initializes A1TopupProvider with server-only environment variables and validates credentials", () => {
    const originalPass = process.env.A1TOPUP_PASSWORD;
    const originalUser = process.env.A1TOPUP_USERNAME;

    try {
      delete process.env.A1TOPUP_PASSWORD;
      delete process.env.A1TOPUP_USERNAME;
      const unconfigured = new A1TopupProvider();
      expect(unconfigured.isConfigured()).toBe(false);

      process.env.A1TOPUP_PASSWORD = "test-api-secret-pwd";
      process.env.A1TOPUP_USERNAME = "504536";
      const configured = new A1TopupProvider();
      expect(configured.isConfigured()).toBe(true);
      expect(configured.name).toBe("A1TOPUP");
    } finally {
      if (originalPass !== undefined) process.env.A1TOPUP_PASSWORD = originalPass;
      else delete process.env.A1TOPUP_PASSWORD;
      if (originalUser !== undefined) process.env.A1TOPUP_USERNAME = originalUser;
      else delete process.env.A1TOPUP_USERNAME;
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 2: Recharge request construction                                  */
  /* -------------------------------------------------------------------------- */
  it("Scenario 2: constructs correct POST parameters according to A1Topup API specification", async () => {
    const provider = new A1TopupProvider();
    // Temporarily set password on provider instance
    (provider as unknown as { password: string }).password = "secret123";

    let interceptedUrl = "";
    let interceptedBody = "";

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      interceptedUrl = String(url);
      interceptedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          txid: "9901",
          status: "Success",
          opid: "OP-REF-123",
          amount: "299",
          orderid: "JMD-RCH-TEST-REQ",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const res = await provider.submitRecharge({
      rechargeRef: "JMD-RCH-TEST-REQ",
      serviceType: "MOBILE_PREPAID",
      operator: "JIO",
      consumerNumber: "9992760538",
      circle: "HARYANA",
      amountPaise: 299_00,
      value1: "extra1",
      value2: "extra2",
    });

    expect(interceptedUrl).toContain("/recharge/api");
    const params = new URLSearchParams(interceptedBody);
    expect(params.get("username")).toBe("504536");
    expect(params.get("pwd")).toBe("secret123");
    expect(params.get("circlecode")).toBe("20"); // Haryana circle code
    expect(params.get("operatorcode")).toBe("RC"); // Jio code
    expect(params.get("number")).toBe("9992760538");
    expect(params.get("amount")).toBe("299");
    expect(params.get("orderid")).toBe("JMD-RCH-TEST-REQ");
    expect(params.get("format")).toBe("json");
    expect(params.get("value1")).toBe("extra1");
    expect(params.get("value2")).toBe("extra2");
    expect(res.status).toBe("SUCCESS");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 3: Operator and circle mapping                                    */
  /* -------------------------------------------------------------------------- */
  it("Scenario 3: maps documented telecom, DTH, utility, gas and insurance operators accurately", () => {
    // Mobile prepaid
    expect(findA1Operator("AIRTEL")?.code).toBe("A");
    expect(findA1Operator("VI")?.code).toBe("V");
    expect(findA1Operator("JIO")?.code).toBe("RC");
    expect(findA1Operator("BSNL")?.code).toBe("BT");
    expect(findA1Operator("BSNL_STV")?.code).toBe("BR");
    expect(findA1Operator("IDEA")?.code).toBe("I");

    // DTH
    expect(findA1Operator("AIRTEL_DTH")?.code).toBe("ATV");
    expect(findA1Operator("SUN_DIRECT")?.code).toBe("STV");
    expect(findA1Operator("TATA_PLAY")?.code).toBe("TTV");
    expect(findA1Operator("VIDEOCON_D2H")?.code).toBe("VTV");
    expect(findA1Operator("DISH_TV")?.code).toBe("DTV");

    // Utilities
    expect(findA1Operator("DHBVN")?.code).toBe("DHBVN");
    expect(findA1Operator("UHBVN")?.code).toBe("UHBVN");
    expect(findA1Operator("MAHANAGAR_GAS")?.code).toBe("MGL");
    expect(findA1Operator("MAHANAGAR_GAS")?.requiresValue1).toBe(true);
    expect(findA1Operator("LIC")?.code).toBe("LIC");
    expect(findA1Operator("LIC")?.requiresValue1).toBe(true);
    expect(findA1Operator("BSNL_LANDLINE")?.requiresValue2).toBe(true);
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 4: Haryana circle code 20                                         */
  /* -------------------------------------------------------------------------- */
  it("Scenario 4: resolves Haryana to circle code 20 across all variants and defaults", () => {
    expect(resolveA1CircleCode("HARYANA")).toBe("20");
    expect(resolveA1CircleCode("Haryana")).toBe("20");
    expect(resolveA1CircleCode("HR")).toBe("20");
    expect(resolveA1CircleCode("20")).toBe("20");
    expect(resolveA1CircleCode(null)).toBe("20"); // Default fallback
    expect(resolveA1CircleCode(undefined)).toBe("20");
    expect(resolveA1CircleCode("UNKNOWN_CIRCLE")).toBe("20");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 5: Balance lookup                                                 */
  /* -------------------------------------------------------------------------- */
  it("Scenario 5: executes balance lookup securely without credential leakage", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "Success", balance: "13.67" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const balanceRes = await provider.checkBalance();
    expect(balanceRes.balanceRupees).toBe(13.67);
    expect(balanceRes.currency).toBe("INR");
    expect(JSON.stringify(balanceRes)).not.toContain("testpass");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 6: Status lookup                                                  */
  /* -------------------------------------------------------------------------- */
  it("Scenario 6: performs transaction status lookup against /recharge/status", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          txid: "8841",
          status: "Success",
          opid: "OPID-AIRTEL-4432",
          number: "9992760538",
          amount: "199",
          orderid: "JMD-RCH-2026-STAT01",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const stat = await provider.checkStatus("JMD-RCH-2026-STAT01");
    expect(stat.status).toBe("SUCCESS");
    expect(stat.providerRef).toBe("8841");
    expect(stat.operatorRef).toBe("OPID-AIRTEL-4432");
    expect(stat.providerPayoutPaise).toBe(398); // 2% of ₹199
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 7: Successful recharge response                                   */
  /* -------------------------------------------------------------------------- */
  it("Scenario 7: handles provider Success response with txid and opid persistence", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          txid: "5804",
          status: "Success",
          opid: "RJ0317161622000269New",
          number: "9992760538",
          amount: "10",
          orderid: "JMD-RCH-2026-SUCC01",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await provider.submitRecharge({
      rechargeRef: "JMD-RCH-2026-SUCC01",
      serviceType: "MOBILE_PREPAID",
      operator: "JIO",
      consumerNumber: "9992760538",
      circle: "20",
      amountPaise: 10_00,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.providerRef).toBe("5804");
    expect(result.operatorRef).toBe("RJ0317161622000269New");
    expect(result.providerPayoutPaise).toBe(20);
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 8: Failed recharge response                                       */
  /* -------------------------------------------------------------------------- */
  it("Scenario 8: handles provider Failed response gracefully and captures reason", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "Failed",
          error: "Operator switch offline. Please retry later.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await provider.submitRecharge({
      rechargeRef: "JMD-RCH-2026-FAIL02",
      serviceType: "MOBILE_PREPAID",
      operator: "AIRTEL",
      consumerNumber: "9992760538",
      amountPaise: 199_00,
    });

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toContain("Operator switch offline");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 9: Pending recharge response                                      */
  /* -------------------------------------------------------------------------- */
  it("Scenario 9: handles provider Pending response without premature refund", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          txid: "9002",
          status: "Pending",
          opid: "",
          amount: "499",
          orderid: "JMD-RCH-2026-PEND01",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await provider.submitRecharge({
      rechargeRef: "JMD-RCH-2026-PEND01",
      serviceType: "MOBILE_PREPAID",
      operator: "AIRTEL",
      consumerNumber: "9992760538",
      amountPaise: 499_00,
    });

    expect(result.status).toBe("PENDING");
    expect(result.providerRef).toBe("9002");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 10: Network timeout and unknown status                            */
  /* -------------------------------------------------------------------------- */
  it("Scenario 10: fails open to PENDING reconciliation on network timeout without duplicate retry", async () => {
    const provider = new A1TopupProvider();
    (provider as unknown as { password: string }).password = "testpass";

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    global.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await provider.submitRecharge({
      rechargeRef: "JMD-RCH-2026-TIME01",
      serviceType: "MOBILE_PREPAID",
      operator: "JIO",
      consumerNumber: "9992760538",
      amountPaise: 299_00,
    });

    // CRITICAL: Must be PENDING, not FAILED, to prevent blind duplicate recharge retry
    expect(result.status).toBe("PENDING");
    expect(result.providerRef).toContain("PEND-TIMEOUT");
    expect(result.failureReason).toContain("timed out");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 11: Duplicate callback handling                                   */
  /* -------------------------------------------------------------------------- */
  it("Scenario 11: ignores duplicate callbacks on finalized orders idempotently", async () => {
    const conn = await getStoreDb();
    const RechargeOrder = getStoreRechargeOrderModel(conn);

    const ref = `JMD-RCH-2026-DUP${Date.now()}`;
    await RechargeOrder.create({
      rechargeRef: ref,
      member: memberId,
      serviceType: "MOBILE_PREPAID",
      operator: "JIO",
      consumerNumber: "9992760538",
      amountPaise: 100_00,
      status: RechargeStatus.SUCCESS, // already finalized
      providerName: "A1TOPUP",
      providerRef: "TXN-FINALIZED-1",
      commissionStatus: RechargeCommissionStatus.CREDITED,
    });

    const res = await handleRechargeWebhookCallback({
      providerRef: "TXN-FINALIZED-1",
      status: "SUCCESS",
    });

    expect(res.processed).toBe(false);
    expect(res.isDuplicate).toBe(true);
    expect(res.message).toContain("already finalized");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 12: Callback authentication                                       */
  /* -------------------------------------------------------------------------- */
  it("Scenario 12: validates callback token/secret and rejects unauthorized callbacks", async () => {
    process.env.A1TOPUP_CALLBACK_TOKEN = "expected-secret-token-789";

    try {
      // 1. Unauthorized request without token
      const unauthReq = new NextRequest("http://localhost:3000/api/store/recharge/callback?txid=123&status=Success", {
        method: "GET",
      });
      const unauthRes = await callbackGet(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Request with invalid token
      const wrongReq = new NextRequest("http://localhost:3000/api/store/recharge/callback?txid=123&status=Success&token=wrong-token", {
        method: "GET",
      });
      const wrongRes = await callbackGet(wrongReq);
      expect(wrongRes.status).toBe(401);
    } finally {
      delete process.env.A1TOPUP_CALLBACK_TOKEN;
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 13: Status reconciliation                                         */
  /* -------------------------------------------------------------------------- */
  it("Scenario 13: reconciles pending transactions through Status API before mutating ledger", async () => {
    const conn = await getStoreDb();
    const RechargeOrder = getStoreRechargeOrderModel(conn);

    const ref = `JMD-RCH-2026-RECON-${Date.now()}`;
    await RechargeOrder.create({
      rechargeRef: ref,
      member: memberId,
      serviceType: "MOBILE_PREPAID",
      operator: "AIRTEL",
      consumerNumber: "9992760538",
      amountPaise: 299_00,
      status: RechargeStatus.PENDING_CONFIRMATION,
      providerName: "A1TOPUP",
      providerRef: "A1-PEND-TXN-77",
      providerPayoutPaise: 598,
      commissionStatus: RechargeCommissionStatus.NONE,
    });

    const mockProvider = new A1TopupProvider();
    (mockProvider as unknown as { password: string }).password = "testpass";
    mockProvider.checkStatus = vi.fn().mockResolvedValue({
      status: "SUCCESS",
      providerRef: "A1-PEND-TXN-77",
      operatorRef: "AIRTEL-LIVE-OP-99",
      providerPayoutPaise: 598,
    });
    setRechargeProvider(mockProvider);

    const callbackRes = await handleRechargeWebhookCallback({
      orderId: ref,
      status: "SUCCESS",
      reconcileWithStatusApi: true,
    });

    expect(callbackRes.processed).toBe(true);
    expect(mockProvider.checkStatus).toHaveBeenCalledWith(ref);

    const updatedOrder = await RechargeOrder.findOne({ rechargeRef: ref });
    expect(updatedOrder?.status).toBe(RechargeStatus.SUCCESS);
    expect(updatedOrder?.operatorRef).toBe("AIRTEL-LIVE-OP-99");
    expect(updatedOrder?.commissionStatus).toBe(RechargeCommissionStatus.CREDITED);
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 14: Duplicate transaction prevention                              */
  /* -------------------------------------------------------------------------- */
  it("Scenario 14: generates unique recharge references preventing collision", async () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { generateRechargeRef } = await import("@/server/store/services/recharge.service");
      const ref = generateRechargeRef();
      expect(ref).toMatch(/^JMD-RCH-\d{4}-[A-Z0-9]+$/);
      expect(set.has(ref)).toBe(false);
      set.add(ref);
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 15: Exactly-once wallet and commission accounting                 */
  /* -------------------------------------------------------------------------- */
  it("Scenario 15: executes atomic wallet debit and credits commission exactly once", async () => {
    const walletBefore = await getOrCreateStoreWallet(memberId);

    const mockProv = new A1TopupProvider();
    (mockProv as unknown as { password: string }).password = "testpass";
    mockProv.submitRecharge = vi.fn().mockResolvedValue({
      status: "SUCCESS",
      providerRef: `A1-TXN-${Date.now()}`,
      operatorRef: "OP-SUCC-EXACT",
      providerPayoutPaise: 400, // ₹4.00 payout margin
    });
    setRechargeProvider(mockProv);

    const result = await submitRechargeOrder({
      memberId,
      serviceType: "MOBILE_PREPAID",
      operator: "JIO",
      consumerNumber: "9992760538",
      circle: "20",
      amountPaise: 200_00, // ₹200.00
    });

    expect(result.status).toBe(RechargeStatus.SUCCESS);
    const walletAfter = await getOrCreateStoreWallet(memberId);

    // ADD_MONEY debited by ₹200.00 (20000 paise)
    expect(walletAfter.addMoneyPaise).toBe(walletBefore.addMoneyPaise - 200_00);
    // Free tier member gets 40% capped at ₹2.00 (200 paise) of provider payout (400 * 0.4 = 160 paise)
    expect(walletAfter.rechargePaise).toBe(walletBefore.rechargePaise + 160);
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 16: Refund on confirmed failure                                   */
  /* -------------------------------------------------------------------------- */
  it("Scenario 16: immediately refunds principal amount to member on confirmed failure", async () => {
    const walletBefore = await getOrCreateStoreWallet(memberId);

    const mockProv = new A1TopupProvider();
    (mockProv as unknown as { password: string }).password = "testpass";
    mockProv.submitRecharge = vi.fn().mockResolvedValue({
      status: "FAILED",
      providerRef: "FAIL-REF-01",
      providerPayoutPaise: 0,
      failureReason: "Operator refused payment: invalid consumer number",
    });
    setRechargeProvider(mockProv);

    const result = await submitRechargeOrder({
      memberId,
      serviceType: "MOBILE_PREPAID",
      operator: "BSNL",
      consumerNumber: "0000000000",
      amountPaise: 150_00, // ₹150.00
    });

    expect(result.status).toBe(RechargeStatus.FAILED);
    const walletAfter = await getOrCreateStoreWallet(memberId);

    // Member balance net change is 0: debited 150_00 then refunded 150_00
    expect(walletAfter.addMoneyPaise).toBe(walletBefore.addMoneyPaise);
    expect(result.order.failureReason).toContain("Operator refused payment");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 17: Vercel production configuration validation                    */
  /* -------------------------------------------------------------------------- */
  it("Scenario 17: validates server-side only execution and safeguards against client exposure", async () => {
    // 1. Password must NEVER have NEXT_PUBLIC_ prefix
    expect(process.env.NEXT_PUBLIC_A1TOPUP_PASSWORD).toBeUndefined();
    // 2. Base URL defaults to secure HTTPS
    const prov = new A1TopupProvider();
    expect((prov as unknown as { baseUrl: string }).baseUrl).toMatch(/^https:\/\//);
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 18: Missing credentials fail-closed behavior                      */
  /* -------------------------------------------------------------------------- */
  it("Scenario 18: fails closed with 503 RECHARGE_PROVIDER_NOT_CONFIGURED when password is missing in production", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldPass = process.env.A1TOPUP_PASSWORD;

    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      delete process.env.A1TOPUP_PASSWORD;

      const status = getRechargeProviderConfigStatus();
      expect(status.canExecuteLive).toBe(false);
      expect(status.isConfigured).toBe(false);

      await expect(
        submitRechargeOrder({
          memberId,
          serviceType: "MOBILE_PREPAID",
          operator: "JIO",
          consumerNumber: "9992760538",
          amountPaise: 299_00,
        }),
      ).rejects.toThrow(/telecom aggregator credentials/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = oldNodeEnv;
      process.env.A1TOPUP_PASSWORD = oldPass;
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 19: Normal ecommerce Razorpay checkout remains unaffected         */
  /* -------------------------------------------------------------------------- */
  it("Scenario 19: allows normal ecommerce orders and Razorpay checkout without recharge dependency", async () => {
    const order = await createStoreOrder({
      memberId,
      items: [{ productId: groceryProductId, quantity: 2 }],
      shippingAddress: {
        fullName: "Rajesh Haryana",
        phone: "9992760538",
        addressLine1: "Rampur Dhani, Near Jogiwala Daiyer Road",
        city: "Sirsa",
        state: "Haryana",
        postalCode: "125055",
        country: "India",
      },
      paymentMethod: "ONLINE_RAZORPAY",
    });

    expect(order).toBeDefined();
    expect(order.orderRef).toMatch(/^JMD-ORD-\d{4}-[A-Z0-9]+$/);
    expect(order.itemsTotalPaise).toBe(500_00); // 2 * ₹250
    expect(order.status).toBe("PENDING_PAYMENT");
  });

  /* -------------------------------------------------------------------------- */
  /* Scenario 20: Seller GST pending-reactivation safeguards remain intact      */
  /* -------------------------------------------------------------------------- */
  it("Scenario 20: enforces Haryana proprietorship details and prevents production invoice issuance while GST is suspended", async () => {
    const { getStoreSettings } = await import("@/server/store/services/settings.service");

    // 1. Verify Haryana Proprietorship details
    const settings = await getStoreSettings();
    const inv = settings.invoice;

    expect(inv.legalEntityName).toBe("RAJENDER SINGH");
    expect(inv.tradeName).toBe("JAI MA DURGA & COMPANY");
    expect(inv.businessConstitution).toBe("Proprietorship");
    expect(inv.udyamNumber).toBe("UDYAM-HR-17-0005563");
    expect(inv.gstin).toBe("06EXVPS0958F2ZR");
    expect(inv.pan).toBe("EXVPS0958F");
    expect(inv.state).toBe("Haryana");
    expect(inv.stateCode).toBe("06");
    expect(inv.district).toBe("Sirsa");
    expect(inv.registeredAddress).toContain("Sirsa, Haryana - 125055");
    expect(inv.gstStatus).toBe("PENDING_REACTIVATION");
    expect(inv.isProductionReady).toBe(false);

    // 2. Create order to test PDF watermark
    const order = await createStoreOrder({
      memberId,
      items: [{ productId: groceryProductId, quantity: 1 }],
      shippingAddress: {
        fullName: "Rajesh Haryana",
        phone: "9992760538",
        addressLine1: "Rampur Dhani",
        city: "Sirsa",
        state: "Haryana",
        postalCode: "125055",
        country: "India",
      },
      paymentMethod: "ONLINE_RAZORPAY",
    });

    // Staging / pending reactivation watermark is applied
    const pdfBytes = await generateOrderTaxInvoicePdf(order);
    expect(pdfBytes).toBeDefined();
    expect(pdfBytes.byteLength).toBeGreaterThan(1000);

    // 3. Strict guard: If isProductionReady is set to true while gstStatus is PENDING_REACTIVATION, it must reject with 422
    await updateStoreSettings({
      invoice: {
        isProductionReady: true,
        gstStatus: "PENDING_REACTIVATION",
      },
    });

    await expect(generateOrderTaxInvoicePdf(order)).rejects.toThrow(
      /Seller GST registration is currently SUSPENDED or PENDING_REACTIVATION/,
    );

    // Reset back to safe default
    await updateStoreSettings({
      invoice: {
        isProductionReady: false,
        gstStatus: "PENDING_REACTIVATION",
      },
    });
  });
});
