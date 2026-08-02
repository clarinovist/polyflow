import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customerSalesAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "a1" }),
      update: vi.fn().mockResolvedValue({ id: "a1" }),
    },
  },
}));

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "u1", role: "SALES", roles: null },
  }),
}));

vi.mock("@/lib/auth/sales-access", () => ({
  requireSalesManager: vi.fn().mockResolvedValue({
    user: { id: "u1", role: "ADMIN", roles: ["ADMIN"] },
  }),
}));

vi.mock("@/lib/utils/utils", () => ({
  serializeData: (data: unknown) => data,
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
    constructor(msg: string) {
      super(msg);
      this.name = "BusinessRuleError";
    }
  },
}));

vi.mock("@/services/sales/customer-assignment-service", () => ({
  assignCustomerToSales: vi.fn().mockResolvedValue({ id: "a1" }),
  unassignCustomerFromSales: vi.fn().mockResolvedValue({ id: "a1" }),
  getCustomerAssignments: vi.fn().mockResolvedValue([]),
  getAssignedCustomers: vi.fn().mockResolvedValue([]),
}));

import { requireAuth } from "@/lib/tools/auth-checks";
import { requireSalesManager } from "@/lib/auth/sales-access";
import {
  assignCustomerAction,
  unassignCustomerAction,
  getMyAssignedCustomers,
  getCustomerAssignmentsAction,
} from "../customer-assignment";

describe("customer-assignment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "u1", role: "SALES", roles: null },
    } as any);
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: "u1", role: "ADMIN", roles: ["ADMIN"] },
    } as any);
  });

  it("assignCustomerAction works for admin", async () => {
    const result = await assignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(true);
    expect(requireSalesManager).toHaveBeenCalled();
  });

  it("assignCustomerAction rejects non-admin/non-marketing", async () => {
    vi.mocked(requireSalesManager).mockRejectedValue(new Error("Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini."));
    const result = await assignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(false);
  });

  it("unassignCustomerAction works for marketing", async () => {
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: "u2", role: "MARKETING", roles: ["MARKETING"] },
    } as any);
    const result = await unassignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(true);
    expect(requireSalesManager).toHaveBeenCalled();
  });

  it("unassignCustomerAction rejects SALES", async () => {
    vi.mocked(requireSalesManager).mockRejectedValue(new Error("Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini."));
    const result = await unassignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(false);
  });

  it("getMyAssignedCustomers returns list (requireAuth, no manager guard)", async () => {
    const result = await getMyAssignedCustomers();
    expect(result).toBeDefined();
    expect(requireAuth).toHaveBeenCalled();
  });

  it("getCustomerAssignmentsAction works (requireAuth)", async () => {
    const result = await getCustomerAssignmentsAction("cus-1");
    expect(result).toBeDefined();
    expect(requireAuth).toHaveBeenCalled();
  });

  it("assign uses requireSalesManager not hasAnyRole inline", async () => {
    await assignCustomerAction({ customerId: "cus-1", userId: "u1" });
    expect(requireSalesManager).toHaveBeenCalledTimes(1);
  });

  it("unassign uses requireSalesManager not hasAnyRole inline", async () => {
    await unassignCustomerAction({ customerId: "cus-1", userId: "u1" });
    expect(requireSalesManager).toHaveBeenCalledTimes(1);
  });
});
