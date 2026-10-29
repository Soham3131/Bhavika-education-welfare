import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleProxyRoute } from "../proxy";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: <T>(fn: T): T => fn,
  }),
}));

vi.mock("@/server/auth/session", () => ({
  AuthError: class AuthError extends Error {
    code: string;
    constructor(message: string, code = "UNAUTHENTICATED") {
      super(message);
      this.code = code;
    }
  },
  getSessionUser: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/server/cron-auth", () => ({
  isCronAuthorized: vi.fn(() => true),
}));

vi.mock("@/server/services/coupon.service", () => ({
  expireCoupons: vi.fn(async () => ({ expiredCount: 0, scannedCount: 0 })),
}));

vi.mock("@/server/store/services/payment.service", () => ({
  sweepPendingRefunds: vi.fn(async () => ({ sweptCount: 0, settledCount: 0, failedCount: 0 })),
}));

describe("Multi-Deployment Storefront Routing & Cron Guards", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Proxy Root Storefront Routing", () => {
    it("rewrites root '/' to '/store' when JMD_SITE_MODE is 'true'", () => {
      process.env.JMD_SITE_MODE = "true";
      const req = { nextUrl: new URL("http://localhost:3000/") };
      const res = handleProxyRoute(req);

      expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/store");
    });

    it("does not rewrite root '/' when JMD_SITE_MODE is 'false' (Bhavika deployment)", () => {
      process.env.JMD_SITE_MODE = "false";
      const req = { nextUrl: new URL("http://localhost:3000/") };
      const res = handleProxyRoute(req);

      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("does not rewrite root '/' when JMD_SITE_MODE is unset", () => {
      delete process.env.JMD_SITE_MODE;
      const req = { nextUrl: new URL("http://localhost:3000/") };
      const res = handleProxyRoute(req);

      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("does not rewrite non-root routes like /api or /store even if called", () => {
      process.env.JMD_SITE_MODE = "true";
      const req = { nextUrl: new URL("http://localhost:3000/api/cron/expire-coupons") };
      const res = handleProxyRoute(req);

      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    });
  });

  describe("Coupon Expiry Cron Guard (/api/cron/expire-coupons)", () => {
    it("preserves existing Bhavika deployment behavior when ENABLE_CRON_JOBS is unset", async () => {
      delete process.env.ENABLE_CRON_JOBS;
      delete process.env.ENABLE_COUPON_EXPIRY_CRON;

      const { expireCoupons } = await import("@/server/services/coupon.service");
      const { GET } = await import("../app/api/cron/expire-coupons/route");

      const req = new Request("http://localhost:3000/api/cron/expire-coupons", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(expireCoupons).toHaveBeenCalledTimes(1);
      expect(json.skipped).toBeUndefined();
    });

    it("safely skips coupon expiry when ENABLE_CRON_JOBS is explicitly 'false'", async () => {
      process.env.ENABLE_CRON_JOBS = "false";

      const { expireCoupons } = await import("@/server/services/coupon.service");
      const { GET } = await import("../app/api/cron/expire-coupons/route");

      const req = new Request("http://localhost:3000/api/cron/expire-coupons", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(expireCoupons).not.toHaveBeenCalled();
      expect(json.skipped).toBe(true);
      expect(json.reason).toContain("ENABLE_CRON_JOBS=false");
    });

    it("safely skips when ENABLE_COUPON_EXPIRY_CRON is explicitly 'false'", async () => {
      delete process.env.ENABLE_CRON_JOBS;
      process.env.ENABLE_COUPON_EXPIRY_CRON = "false";

      const { expireCoupons } = await import("@/server/services/coupon.service");
      const { GET } = await import("../app/api/cron/expire-coupons/route");

      const req = new Request("http://localhost:3000/api/cron/expire-coupons", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(expireCoupons).not.toHaveBeenCalled();
      expect(json.skipped).toBe(true);
      expect(json.reason).toContain("ENABLE_COUPON_EXPIRY_CRON=false");
    });
  });

  describe("Refund Reconciliation Cron Guard (/api/cron/reconcile-refunds)", () => {
    it("preserves existing Bhavika deployment behavior when ENABLE_CRON_JOBS is unset", async () => {
      delete process.env.ENABLE_CRON_JOBS;
      delete process.env.ENABLE_REFUND_RECONCILE_CRON;

      const { sweepPendingRefunds } = await import("@/server/store/services/payment.service");
      const { GET } = await import("../app/api/cron/reconcile-refunds/route");

      const req = new Request("http://localhost:3000/api/cron/reconcile-refunds", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(sweepPendingRefunds).toHaveBeenCalledTimes(1);
      expect(json.skipped).toBeUndefined();
    });

    it("safely skips refund reconciliation when ENABLE_CRON_JOBS is explicitly 'false'", async () => {
      process.env.ENABLE_CRON_JOBS = "false";

      const { sweepPendingRefunds } = await import("@/server/store/services/payment.service");
      const { GET } = await import("../app/api/cron/reconcile-refunds/route");

      const req = new Request("http://localhost:3000/api/cron/reconcile-refunds", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(sweepPendingRefunds).not.toHaveBeenCalled();
      expect(json.skipped).toBe(true);
      expect(json.reason).toContain("ENABLE_CRON_JOBS=false");
    });

    it("safely skips when ENABLE_REFUND_RECONCILE_CRON is explicitly 'false'", async () => {
      delete process.env.ENABLE_CRON_JOBS;
      process.env.ENABLE_REFUND_RECONCILE_CRON = "false";

      const { sweepPendingRefunds } = await import("@/server/store/services/payment.service");
      const { GET } = await import("../app/api/cron/reconcile-refunds/route");

      const req = new Request("http://localhost:3000/api/cron/reconcile-refunds", {
        headers: { authorization: "Bearer test" },
      });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(sweepPendingRefunds).not.toHaveBeenCalled();
      expect(json.skipped).toBe(true);
      expect(json.reason).toContain("ENABLE_REFUND_RECONCILE_CRON=false");
    });
  });
});
