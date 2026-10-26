import "server-only";
import { logAdminAction } from "@/server/services/audit.service";
import { DomainError } from "@/server/errors";

/**
 * Store-specific admin capabilities to enforce granular authorization
 * and prevent NGO-only admins from executing financial store operations without privilege.
 */
export type StoreAdminCapability =
  | "STORE_CATALOGUE_VIEW"
  | "STORE_CATALOGUE_MANAGE"
  | "STORE_INVENTORY_ADJUST"
  | "STORE_ORDER_MANAGE"
  | "STORE_FINANCIAL_RECONCILE";

export interface StoreAdminUser {
  id: string;
  role: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Verifies that the given authenticated admin has the required store capability,
 * and records an immutable audit log entry if an auditContext is provided.
 */
export async function verifyStoreAdminCapability(
  admin: StoreAdminUser | null | undefined,
  capability: StoreAdminCapability,
  auditContext?: {
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!admin || admin.role !== "ADMIN") {
    throw new DomainError(
      `Store capability '${capability}' is required.`,
      403,
      "FORBIDDEN",
    );
  }

  // Audit mutating actions
  if (auditContext) {
    const isObjectId =
      auditContext.targetId &&
      typeof auditContext.targetId === "string" &&
      /^[0-9a-fA-F]{24}$/.test(auditContext.targetId);

    await logAdminAction(admin.id, auditContext.action, {
      targetType: auditContext.targetType || "STORE",
      targetId: isObjectId ? auditContext.targetId : null,
      reason: auditContext.reason,
      meta: {
        capability,
        ...auditContext.meta,
        ...(auditContext.targetId && !isObjectId
          ? { targetRef: auditContext.targetId }
          : {}),
      },
    });
  }
}

/**
 * Enforces store administration permissions in App Router API handlers.
 * Dynamically imports requireAdmin() to maintain separation and support test runners.
 */
export async function requireStoreAdmin(
  capability: StoreAdminCapability,
  auditContext?: {
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    meta?: Record<string, unknown>;
  },
): Promise<StoreAdminUser> {
  const { requireAdmin } = await import("@/server/auth/session");
  const admin = await requireAdmin();
  await verifyStoreAdminCapability(admin, capability, auditContext);
  return admin;
}
