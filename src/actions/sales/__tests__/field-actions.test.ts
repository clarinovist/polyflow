import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
    },
    salesOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    collectionActivity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesRoutePlanItem: { count: vi.fn().mockResolvedValue(3) },
    salesVisit: { count: vi.fn().mockResolvedValue(1) },
  },
}));

vi.mock("@/lib/auth/roles", () => ({
  hasAnyRole: vi.fn().mockReturnValue(false),
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
}));

vi.mock("@/lib/utils/utils", () => ({
  serializeData: (data: unknown) => data,
}));

vi.mock("@/lib/core/tenant", () => ({
  withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { prisma } from "@/lib/core/prisma";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireSalesAccess } from "@/lib/auth/sales-access";
import {
  getMyFieldCustomers,
  searchFieldCustomers,
  getMyFieldSalesOrders,
  getFieldSalesOrderById,
  getMyFieldPipelineStats,
  getMyFieldReceivables,
  getMyFieldComplianceStats,
  getFieldCustomerById,
} from "../field-actions";

describe("field-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSalesAccess).mockResolvedValue({
      user: { id: "u1", role: "SALES", roles: ["SALES"] },
    } as any);
    vi.mocked(hasAnyRole).mockReturnValue(false);
  });

  it("getMyFieldCustomers returns scoped customers for sales", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1", name: "A" }] as never);
    const result = await getMyFieldCustomers();
    expect(result).toBeDefined();
    expect(prisma.customer.findMany).toHaveBeenCalled();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("getMyFieldCustomers allows ADMIN", async () => {
    vi.mocked(requireSalesAccess).mockResolvedValue({
      user: { id: "admin", role: "ADMIN", roles: ["ADMIN"] },
    } as any);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    const result = await getMyFieldCustomers();
    expect(result).toBeDefined();
  });

  it("getMyFieldCustomers rejects WAREHOUSE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    let result: any;
    try {
      result = await getMyFieldCustomers();
    } catch (e) {
      result = { success: false, error: (e as Error).message };
    }
    expect(requireSalesAccess).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("searchFieldCustomers returns wrapped result for short query", async () => {
    const result = await searchFieldCustomers("a");
    expect(result).toEqual({ success: true, data: [] });
  });

  it("searchFieldCustomers searches with valid query", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1", name: "Toko" }] as never);
    const result = await searchFieldCustomers("Toko");
    expect(result).toBeDefined();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("searchFieldCustomers requires sales access", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await searchFieldCustomers("Toko Valid");
    expect(result.success).toBe(false);
  });

  it("getMyFieldSalesOrders returns scoped orders", async () => {
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "o1", orderNumber: "SO-001", customer: { name: "A" }, _count: { items: 2 } },
    ] as never);
    const result = await getMyFieldSalesOrders();
    expect(result).toBeDefined();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("getMyFieldSalesOrders rejects non-sales", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getMyFieldSalesOrders();
    expect(result.success).toBe(false);
  });

  it("getFieldSalesOrderById returns order for authorized user", async () => {
    vi.mocked(prisma.salesOrder.count).mockResolvedValue(1);
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "o1", orderNumber: "SO-001", items: [], deliveryOrders: [],
    } as never);
    const result = await getFieldSalesOrderById("o1");
    expect(result).toBeDefined();
  });

  it("getFieldSalesOrderById throws for unauthorized scope (business logic)", async () => {
    vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
    const result = await getFieldSalesOrderById("o-other");
    expect(result.success).toBe(false);
  });

  it("getFieldSalesOrderById returns order for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(requireSalesAccess).mockResolvedValue({
      user: { id: "admin", role: "ADMIN", roles: ["ADMIN"] },
    } as any);
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "o1", orderNumber: "SO-001", items: [], deliveryOrders: [],
    } as never);
    const result = await getFieldSalesOrderById("o1");
    expect(result).toBeDefined();
  });

  it("getFieldSalesOrderById requires sales access", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getFieldSalesOrderById("o1");
    expect(result.success).toBe(false);
  });

  it("getMyFieldPipelineStats returns stats with DRAFT status", async () => {
    vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
      { status: "DRAFT", _count: { status: 2 }, _sum: { totalAmount: 1000 } },
    ] as never);
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "o1", orderNumber: "SO-001", totalAmount: 500, status: "DRAFT", orderDate: new Date(), customer: { name: "A" } },
    ] as never);
    const result = await getMyFieldPipelineStats();
    expect(result).toBeDefined();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("getMyFieldPipelineStats handles QUOTATION status", async () => {
    vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
      { status: "QUOTATION", _count: { status: 1 }, _sum: { totalAmount: 500 } },
      { status: "QUOTATION_SENT", _count: { status: 1 }, _sum: { totalAmount: 300 } },
      { status: "DELIVERED", _count: { status: 1 }, _sum: { totalAmount: 200 } },
    ] as never);
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "o1", orderNumber: "SO-001", totalAmount: null, status: "QUOTATION", orderDate: new Date(), customer: null },
    ] as never);
    const result = await getMyFieldPipelineStats();
    expect(result).toBeDefined();
  });

  it("getMyFieldPipelineStats rejects non-sales", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getMyFieldPipelineStats();
    expect(result.success).toBe(false);
  });

  it("getMyFieldReceivables returns invoices", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { id: "inv-1", status: "UNPAID", dueDate: new Date(), invoiceDate: new Date(), salesOrder: { orderNumber: "SO-1", customer: { name: "A" } } },
    ] as never);
    (prisma as any).collectionActivity = { findMany: vi.fn().mockResolvedValue([]) };
    const result = await getMyFieldReceivables();
    expect(result).toBeDefined();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("getMyFieldReceivables returns daysOverdue + lastPromise and no N+1", async () => {
    const now = new Date();
    const dueOld = new Date(now.getTime() - 5 * 86400 * 1000);
    const dueFuture = new Date(now.getTime() + 2 * 86400 * 1000);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { id: "inv-1", status: "UNPAID", dueDate: dueOld, invoiceDate: now, totalAmount: 1000, paidAmount: 0, salesOrder: { orderNumber: "SO-1", customer: { name: "A" } } },
      { id: "inv-2", status: "UNPAID", dueDate: dueFuture, invoiceDate: now, totalAmount: 500, paidAmount: 0, salesOrder: { orderNumber: "SO-2", customer: { name: "B" } } },
      { id: "inv-3", status: "OVERDUE", dueDate: null, invoiceDate: dueOld, totalAmount: 200, paidAmount: 0, salesOrder: { orderNumber: "SO-3", customer: { name: "C" } } },
    ] as never);

    const caFindMany = vi.fn().mockResolvedValue([
      { id: "ca-1", invoiceId: "inv-1", type: "PROMISE_TO_PAY", activityDate: new Date(now.getTime() - 1000), promisedDate: new Date(), promisedAmount: 500, notes: "janji" },
      { id: "ca-2", invoiceId: "inv-1", type: "PROMISE_TO_PAY", activityDate: new Date(now.getTime() - 2000), promisedDate: new Date(), promisedAmount: 300, notes: "lama" },
      { id: "ca-3", invoiceId: "inv-2", type: "PROMISE_TO_PAY", activityDate: new Date(), promisedDate: new Date(), promisedAmount: 100, notes: "n2" },
      { id: "ca-other", invoiceId: "inv-1", type: "CALL", activityDate: new Date(), notes: "call" },
    ]);
    (prisma as any).collectionActivity = { findMany: caFindMany };

    const result = await getMyFieldReceivables();
    expect(result.success).toBe(true);
    const data = (result as any).data as any[];

    // Shape: existing fields preserved + new fields
    expect(data.length).toBe(3);
    expect(data[0]).toHaveProperty('daysOverdue');
    expect(data[0]).toHaveProperty('lastPromise');
    // daysOverdue: inv-1 should be ~5 (overdue positive), inv-2 negative (future)
    expect(data.find((i: any) => i.id === 'inv-1').daysOverdue).toBeGreaterThanOrEqual(4);
    expect(data.find((i: any) => i.id === 'inv-2').daysOverdue).toBeLessThan(0);

    // lastPromise: latest per invoice (inv-1 should be ca-1, not ca-2, and not CALL)
    expect(data.find((i: any) => i.id === 'inv-1').lastPromise).not.toBeNull();
    expect(data.find((i: any) => i.id === 'inv-1').lastPromise.id).toBe('ca-1');
    expect(data.find((i: any) => i.id === 'inv-2').lastPromise.id).toBe('ca-3');
    expect(data.find((i: any) => i.id === 'inv-3').lastPromise).toBeNull();

    // No N+1: collectionActivity.findMany called exactly once (or at most once) regardless of invoice count
    expect(caFindMany).toHaveBeenCalledTimes(1);
    const args = caFindMany.mock.calls[0][0] as any;
    expect(args.where.invoiceId.in.length).toBe(3);
  });

  it("getMyFieldReceivables rejects FINANCE", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getMyFieldReceivables();
    expect(result.success).toBe(false);
  });

  it("getMyFieldComplianceStats for sales", async () => {
    vi.mocked(prisma.salesRoutePlanItem.count).mockResolvedValue(5);
    vi.mocked(prisma.salesVisit.count).mockResolvedValue(1);
    const result = await getMyFieldComplianceStats();
    expect(result).toBeDefined();
    expect(requireSalesAccess).toHaveBeenCalled();
  });

  it("getMyFieldComplianceStats rejects non-sales", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getMyFieldComplianceStats();
    expect(result.success).toBe(false);
  });

  it("getFieldCustomerById returns customer", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(1);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ id: "c1", name: "Toko A" } as never);
    const result = await getFieldCustomerById("c1");
    expect(result).toBeDefined();
  });

  it("getFieldCustomerById requires sales access", async () => {
    vi.mocked(requireSalesAccess).mockRejectedValue(new Error("Unauthorized"));
    const result = await getFieldCustomerById("c1");
    expect(result.success).toBe(false);
  });

  it("getFieldCustomerById throws for unauthorized scope", async () => {
    vi.mocked(prisma.customer.count).mockResolvedValue(0);
    const result = await getFieldCustomerById("c-other");
    expect(result.success).toBe(false);
  });
});
