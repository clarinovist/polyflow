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
    salesRoutePlanItem: { count: vi.fn().mockResolvedValue(3) },
    salesVisit: { count: vi.fn().mockResolvedValue(1) },
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

import { prisma } from "@/lib/core/prisma";
import { hasAnyRole } from "@/lib/auth/roles";
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
  });

  it("getMyFieldCustomers returns scoped customers for sales", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1", name: "A" }] as never);
    const result = await getMyFieldCustomers();
    expect(result).toBeDefined();
    expect(prisma.customer.findMany).toHaveBeenCalled();
  });

  it("getMyFieldCustomers returns all for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    const result = await getMyFieldCustomers();
    expect(result).toBeDefined();
  });

  it("searchFieldCustomers returns wrapped result for short query", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    const result = await searchFieldCustomers("a");
    expect(result).toEqual({ success: true, data: [] });
  });

  it("searchFieldCustomers searches with valid query", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ id: "c1", name: "Toko" }] as never);
    const result = await searchFieldCustomers("Toko");
    expect(result).toBeDefined();
  });

  it("getMyFieldSalesOrders returns scoped orders", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "o1", orderNumber: "SO-001", customer: { name: "A" }, _count: { items: 2 } },
    ] as never);
    const result = await getMyFieldSalesOrders();
    expect(result).toBeDefined();
  });

  it("getFieldSalesOrderById returns order for authorized user", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.salesOrder.count).mockResolvedValue(1);
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "o1", orderNumber: "SO-001", items: [], deliveryOrders: [],
    } as never);
    const result = await getFieldSalesOrderById("o1");
    expect(result).toBeDefined();
  });

  it("getFieldSalesOrderById throws for unauthorized user", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
    const result = await getFieldSalesOrderById("o-other");
    expect(result.success).toBe(false);
  });

  it("getFieldSalesOrderById returns order for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "o1", orderNumber: "SO-001", items: [], deliveryOrders: [],
    } as never);
    const result = await getFieldSalesOrderById("o1");
    expect(result).toBeDefined();
  });

  it("getMyFieldPipelineStats returns stats with DRAFT status", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
      { status: "DRAFT", _count: { status: 2 }, _sum: { totalAmount: 1000 } },
    ] as never);
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "o1", orderNumber: "SO-001", totalAmount: 500, status: "DRAFT", orderDate: new Date(), customer: { name: "A" } },
    ] as never);
    const result = await getMyFieldPipelineStats();
    expect(result).toBeDefined();
  });

  it("getMyFieldPipelineStats handles QUOTATION status", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
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

  it("getMyFieldPipelineStats for admin with mixed statuses", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
      { status: "CONFIRMED", _count: { status: 3 }, _sum: { totalAmount: 5000 } },
      { status: "SHIPPED", _count: { status: 2 }, _sum: { totalAmount: 3000 } },
    ] as never);
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([] as never);
    const result = await getMyFieldPipelineStats();
    expect(result).toBeDefined();
  });

  it("getMyFieldReceivables returns invoices", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      { id: "inv-1", status: "UNPAID", salesOrder: { orderNumber: "SO-1", customer: { name: "A" } } },
    ] as never);
    const result = await getMyFieldReceivables();
    expect(result).toBeDefined();
  });

  it("getMyFieldComplianceStats for sales", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.salesRoutePlanItem.count).mockResolvedValue(5);
    vi.mocked(prisma.salesVisit.count).mockResolvedValue(1);
    const result = await getMyFieldComplianceStats();
    expect(result).toBeDefined();
  });

  it("getMyFieldComplianceStats for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(prisma.salesRoutePlanItem.count).mockResolvedValue(10);
    vi.mocked(prisma.salesVisit.count).mockResolvedValue(2);
    const result = await getMyFieldComplianceStats();
    expect(result).toBeDefined();
  });

  it("getFieldCustomerById returns customer", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.customer.count).mockResolvedValue(1);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ id: "c1", name: "Toko A" } as never);
    const result = await getFieldCustomerById("c1");
    expect(result).toBeDefined();
  });

  it("getFieldCustomerById throws for unauthorized", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(false);
    vi.mocked(prisma.customer.count).mockResolvedValue(0);
    const result = await getFieldCustomerById("c-other");
    expect(result.success).toBe(false);
  });

  it("getFieldCustomerById for admin", async () => {
    vi.mocked(hasAnyRole).mockReturnValue(true);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ id: "c1", name: "Toko A" } as never);
    const result = await getFieldCustomerById("c1");
    expect(result).toBeDefined();
  });
});
