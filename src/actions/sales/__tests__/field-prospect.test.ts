import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    customerSalesAssignment: {
      create: vi.fn().mockResolvedValue({ id: "a1" }),
    },
  },
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

vi.mock("@/lib/auth/roles", () => ({
  hasAnyRole: vi.fn().mockReturnValue(true),
}));

vi.mock("@/services/sales/field-prospect-service", () => ({
  checkCustomerDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false, matches: [] }),
  createProspectWithAssignment: vi.fn().mockResolvedValue({ id: "cus-new", name: "Toko Baru", code: "CUS-001" }),
  verifyProspect: vi.fn().mockResolvedValue({ id: "cus-1", lifecycleStatus: "ACTIVE" }),
}));

import {
  checkCustomerDuplicateAction,
  createProspectAction,
  verifyProspectAction,
} from "../field-prospect";

describe("field-prospect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkCustomerDuplicateAction returns result", async () => {
    const result = await checkCustomerDuplicateAction({
      name: "Toko Maju",
    });
    expect(result).toBeDefined();
  });

  it("createProspectAction creates prospect", async () => {
    const result = await createProspectAction({
      name: "Toko Baru",
    });
    expect(result).toBeDefined();
  });

  it("createProspectAction rejects short name", async () => {
    const result = await createProspectAction({
      name: "A",
    });
    expect(result.success).toBe(false);
  });

  it("verifyProspectAction works for admin", async () => {
    const result = await verifyProspectAction("cus-1");
    expect(result).toBeDefined();
  });
});
