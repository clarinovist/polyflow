import { describe, it, expect, vi, beforeEach } from "vitest";
import { deliverOrder } from "../fulfillment-service";
import { prisma } from "@/lib/core/prisma";
import { SalesOrderStatus, SalesOrderType } from "@prisma/client";
import { logActivity } from "@/lib/tools/audit";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    deliveryOrder: {
      updateMany: vi.fn(),
    },
    stockReservation: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

describe("deliverOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates SalesOrder and open DeliveryOrders to DELIVERED", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-2026-0001",
      orderType: SalesOrderType.MAKE_TO_ORDER,
      status: SalesOrderStatus.SHIPPED,
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.deliveryOrder.updateMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);

    await deliverOrder("so-1", "user-1");

    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: "so-1" },
      data: { status: SalesOrderStatus.DELIVERED },
    });

    expect(prisma.deliveryOrder.updateMany).toHaveBeenCalledWith({
      where: {
        salesOrderId: "so-1",
        status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] },
      },
      data: { status: "DELIVERED" },
    });

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "UPDATE_SALES_STATUS",
        entityType: "SalesOrder",
        entityId: "so-1",
        details: expect.stringContaining("2 delivery order(s) set to DELIVERED"),
      }),
    );
  });

  it("still delivers SalesOrder when no open DeliveryOrders exist", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-2",
      orderNumber: "SO-2026-0002",
      orderType: SalesOrderType.MAKLON_JASA,
      status: SalesOrderStatus.SHIPPED,
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.deliveryOrder.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);

    await deliverOrder("so-2", "user-1");

    expect(prisma.deliveryOrder.updateMany).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: "Sales Order SO-2026-0002 marked as Service Delivered",
      }),
    );
  });

  it("throws when SalesOrder is not found", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

    await expect(deliverOrder("missing", "user-1")).rejects.toThrow(/tidak ditemukan/i);
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });
});
