import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    deliveryOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesVisit: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/sales-access", () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: "u1", role: "SALES", roles: ["SALES"] } }),
}));

vi.mock("@/lib/core/tenant", () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/lib/errors/errors", () => ({
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
  BusinessRuleError: class extends Error {
    constructor(msg: string) { super(msg); this.name = "BusinessRuleError"; }
  },
}));

import { requireSalesAccess } from "@/lib/auth/sales-access";
import {
  listCustomerInvoices,
  listCustomerReturns,
  listCustomerDeliveries,
  listCustomerQuotations,
  listCustomerVisits,
  getCustomerSalesAnalytics,
} from "../customer-360";

describe("customer-360 actions — sales-access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSalesAccess).mockResolvedValue({ user: { id: "u1", role: "SALES", roles: ["SALES"] } } as any);
  });

  it("listCustomerInvoices allows SALES", async () => {
    const result = await listCustomerInvoices("cus-1");
    expect(result.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("listCustomerInvoices rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await listCustomerInvoices("cus-1");
    expect(result.success).toBe(false);
  });

  it("listCustomerReturns allows MARKETING", async () => {
    vi.mocked(requireSalesAccess).mockResolvedValue({ user: { id: "u2", role: "MARKETING", roles: ["MARKETING"] } } as any);
    const result = await listCustomerReturns("cus-1");
    expect(result.success).toBe(true);
  });

  it("listCustomerReturns rejects FINANCE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await listCustomerReturns("cus-1");
    expect(result.success).toBe(false);
  });

  it("listCustomerDeliveries allows ADMIN", async () => {
    vi.mocked(requireSalesAccess).mockResolvedValue({ user: { id: "a", role: "ADMIN", roles: ["ADMIN"] } } as any);
    const result = await listCustomerDeliveries("cus-1");
    expect(result.success).toBe(true);
  });

  it("listCustomerDeliveries rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await listCustomerDeliveries("cus-1");
    expect(result.success).toBe(false);
  });

  it("listCustomerQuotations requires sales access", async () => {
    const ok = await listCustomerQuotations("cus-1");
    expect(ok.success).toBe(true);
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const bad = await listCustomerQuotations("cus-1");
    expect(bad.success).toBe(false);
  });

  it("listCustomerVisits requires sales access", async () => {
    const ok = await listCustomerVisits("cus-1");
    expect(ok.success).toBe(true);
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const bad = await listCustomerVisits("cus-1");
    expect(bad.success).toBe(false);
  });

  it("getCustomerSalesAnalytics requires sales access", async () => {
    const ok = await getCustomerSalesAnalytics("cus-1");
    expect(ok.success).toBe(true);
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const bad = await getCustomerSalesAnalytics("cus-1");
    expect(bad.success).toBe(false);
  });
});
