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

vi.mock("@/lib/auth/roles", () => ({
  hasAnyRole: vi.fn(),
}));

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: "u1", role: "SALES", roles: null },
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

import { hasAnyRole } from "@/lib/auth/roles";
import {
  assignCustomerAction,
  unassignCustomerAction,
  getMyAssignedCustomers,
} from "../customer-assignment";

describe("customer-assignment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assignCustomerAction works for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    const result = await assignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result).toBeDefined();
  });

  it("assignCustomerAction rejects non-admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    const result = await assignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(false);
  });

  it("unassignCustomerAction works for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    const result = await unassignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result).toBeDefined();
  });

  it("unassignCustomerAction rejects non-admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    const result = await unassignCustomerAction({
      customerId: "cus-1",
      userId: "u1",
    });
    expect(result.success).toBe(false);
  });

  it("getMyAssignedCustomers returns list", async () => {
    const result = await getMyAssignedCustomers();
    expect(result).toBeDefined();
  });

  it("assignCustomerAction passes MARKETING role to hasAnyRole guard", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    await assignCustomerAction({ customerId: "cus-1", userId: "u1" });
    expect(hasAnyRole).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["MARKETING"]),
    );
  });

  it("unassignCustomerAction passes MARKETING role to hasAnyRole guard", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    await unassignCustomerAction({ customerId: "cus-1", userId: "u1" });
    expect(hasAnyRole).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["MARKETING"]),
    );
  });

  it("assignCustomerAction guard does not include SALES_ADMIN", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    await assignCustomerAction({ customerId: "cus-1", userId: "u1" });
    const callArgs = vi.mocked(hasAnyRole).mock.calls[0];
    const roles = callArgs[1] as string[];
    expect(roles).not.toContain("SALES_ADMIN");
  });
});
