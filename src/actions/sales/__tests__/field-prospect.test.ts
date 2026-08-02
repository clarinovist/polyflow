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

vi.mock("@/lib/auth/sales-access", () => ({
  requireSalesAccess: vi.fn().mockResolvedValue({
    user: { id: "u1", role: "SALES", roles: ["SALES"] },
  }),
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

vi.mock("@/services/sales/field-prospect-service", () => ({
  checkCustomerDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false, matches: [] }),
  createProspectWithAssignment: vi.fn().mockResolvedValue({ id: "cus-new", name: "Toko Baru", code: "CUS-001" }),
  verifyProspect: vi.fn().mockResolvedValue({ id: "cus-1", lifecycleStatus: "ACTIVE" }),
  listProspects: vi.fn().mockResolvedValue({ customers: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
  rejectProspect: vi.fn().mockResolvedValue({ id: "cus-1", lifecycleStatus: "INACTIVE" }),
}));

import {
  checkCustomerDuplicateAction,
  createProspectAction,
  verifyProspectAction,
  listProspectsAction,
  rejectProspectAction,
} from "../field-prospect";
import { requireSalesAccess, requireSalesManager } from "@/lib/auth/sales-access";

describe("field-prospect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSalesAccess).mockResolvedValue({
      user: { id: "u1", role: "SALES", roles: ["SALES"] },
    } as any);
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: "u1", role: "ADMIN", roles: ["ADMIN"] },
    } as any);
  });

  it("checkCustomerDuplicateAction returns result with SALES role", async () => {
    const result = await checkCustomerDuplicateAction({
      name: "Toko Maju",
    });
    expect(result.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("checkCustomerDuplicateAction rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized: Akses sales hanya untuk admin atau sales."));
    const result = await checkCustomerDuplicateAction({ name: "Toko Maju" });
    expect(result.success).toBe(false);
  });

  it("createProspectAction creates prospect with SALES role", async () => {
    const result = await createProspectAction({
      name: "Toko Baru",
    });
    expect(result.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("createProspectAction rejects short name", async () => {
    const result = await createProspectAction({
      name: "A",
    });
    expect(result.success).toBe(false);
  });

  it("createProspectAction rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await createProspectAction({ name: "Toko Baru" });
    expect(result.success).toBe(false);
  });

  it("verifyProspectAction works for admin/manager", async () => {
    const result = await verifyProspectAction("cus-1");
    expect(result.success).toBe(true);
    expect(requireSalesManager).toHaveBeenCalled();
  });

  it("verifyProspectAction rejects SALES", async () => {
    vi.mocked(requireSalesManager).mockRejectedValue(new Error("Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini."));
    const result = await verifyProspectAction("cus-1");
    expect(result.success).toBe(false);
  });

  it("verifyProspectAction allows MARKETING", async () => {
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: "u2", role: "MARKETING", roles: ["MARKETING"] },
    } as any);
    const result = await verifyProspectAction("cus-1");
    expect(result.success).toBe(true);
  });

  it("listProspectsAction returns list with SALES role", async () => {
    const result = await listProspectsAction({ page: 1, pageSize: 10 });
    expect(result.success).toBe(true);
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("listProspectsAction rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await listProspectsAction({ page: 1 });
    expect(result.success).toBe(false);
  });

  it("rejectProspectAction works for ADMIN", async () => {
    const result = await rejectProspectAction("cus-1");
    expect(result.success).toBe(true);
    expect(requireSalesManager).toHaveBeenCalled();
  });

  it("rejectProspectAction rejects SALES", async () => {
    vi.mocked(requireSalesManager).mockRejectedValue(new Error("Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini."));
    const result = await rejectProspectAction("cus-1");
    expect(result.success).toBe(false);
  });

  it("rejectProspectAction allows MARKETING", async () => {
    vi.mocked(requireSalesManager).mockResolvedValue({
      user: { id: "u2", role: "MARKETING", roles: ["MARKETING"] },
    } as any);
    const result = await rejectProspectAction("cus-1");
    expect(result.success).toBe(true);
  });
});
