import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoExpireQuotations, confirmOrder } from "../orders-service";
import { prisma } from "@/lib/core/prisma";
import { SalesOrderStatus } from "@prisma/client";

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findUnique: vi.fn().mockResolvedValue({ creditLimit: { toNumber: () => 100000000 } }),
    },
    inventory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    stockReservation: {
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    bom: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    logActivity: vi.fn(),
    $transaction: vi.fn((callback: any) => callback(prisma)),
  },
}));

describe("autoExpireQuotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 0 when no expired quotations found", async () => {
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);
    const count = await autoExpireQuotations();
    expect(count).toBe(0);
    expect(prisma.salesOrder.updateMany).not.toHaveBeenCalled();
  });

  it("should update expired QUOTATION_SENT orders to QUOTATION_EXPIRED", async () => {
    vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
      { id: "so-1" },
      { id: "so-2" },
    ] as any);
    vi.mocked(prisma.salesOrder.updateMany).mockResolvedValue({ count: 2 });

    const count = await autoExpireQuotations();
    expect(count).toBe(2);
    expect(prisma.salesOrder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["so-1", "so-2"] } },
      data: { status: SalesOrderStatus.QUOTATION_EXPIRED },
    });
  });
});

describe("confirmOrder price gate with isFreeItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow confirm if zero-price item is marked as isFreeItem", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-free",
      status: SalesOrderStatus.DRAFT,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          unitPrice: 0,
          isFreeItem: true,
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 },
          productVariant: {
            name: "Sample Box",
            product: { productType: "FINISHED_GOODS" },
          },
        },
      ],
    } as any);

    vi.mocked(prisma.salesOrder.update).mockResolvedValue({
      id: "so-free",
      status: SalesOrderStatus.CONFIRMED,
    } as any);

    const result = await confirmOrder("so-free", "user-1");
    expect(result).toBeDefined();
  });

  it("should reject confirm if zero-price item is NOT marked as isFreeItem", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-zero",
      status: SalesOrderStatus.DRAFT,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          unitPrice: 0,
          isFreeItem: false,
          productVariant: { name: "Regular Product" },
        },
      ],
    } as any);

    await expect(confirmOrder("so-zero", "user-1")).rejects.toThrow(
      /Lengkapi harga semua item sebelum konfirmasi order/,
    );
  });
});
