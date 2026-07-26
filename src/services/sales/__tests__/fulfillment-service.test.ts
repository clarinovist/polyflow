import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deliverOrder,
  markReadyToShip,
  shipOrder,
} from "../fulfillment-service";
import { prisma } from "@/lib/core/prisma";
import { SalesOrderStatus, SalesOrderType, ProductType } from "@prisma/client";
import { logActivity } from "@/lib/tools/audit";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    deliveryOrder: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
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

const createDraftInvoiceFromOrder = vi.fn();
vi.mock("@/services/finance/invoice-service", () => ({
  InvoiceService: {
    createDraftInvoiceFromOrder: (...args: unknown[]) =>
      createDraftInvoiceFromOrder(...args),
  },
}));

const createDeliveryOrderFromSalesOrder = vi.fn();
const commitDeliveryShipment = vi.fn();
vi.mock("../delivery-fulfillment-service", () => ({
  createDeliveryOrderFromSalesOrder: (...args: unknown[]) =>
    createDeliveryOrderFromSalesOrder(...args),
  commitDeliveryShipment: (...args: unknown[]) =>
    commitDeliveryShipment(...args),
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
    vi.mocked(prisma.deliveryOrder.updateMany).mockResolvedValue({
      count: 2,
    } as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({
      count: 0,
    } as never);

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
        details: expect.stringContaining(
          "2 delivery order(s) set to DELIVERED",
        ),
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
    vi.mocked(prisma.deliveryOrder.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({
      count: 0,
    } as never);

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

    await expect(deliverOrder("missing", "user-1")).rejects.toThrow(
      /tidak ditemukan/i,
    );
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("markReadyToShip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a CONFIRMED order as READY_TO_SHIP", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-2026-0001",
      orderType: SalesOrderType.MAKE_TO_ORDER,
      status: SalesOrderStatus.CONFIRMED,
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);

    await markReadyToShip("so-1", "user-1");

    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: "so-1" },
      data: { status: SalesOrderStatus.READY_TO_SHIP },
    });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.stringContaining("Ready to Ship"),
      }),
    );
  });

  it("marks an IN_PRODUCTION order and uses service-closure wording for MAKLON_JASA", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-2",
      orderNumber: "SO-2026-0002",
      orderType: SalesOrderType.MAKLON_JASA,
      status: SalesOrderStatus.IN_PRODUCTION,
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);

    await markReadyToShip("so-2", "user-1");

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.stringContaining("Ready for Service Closure"),
      }),
    );
  });

  it("throws NotFound when order is missing", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
    await expect(markReadyToShip("missing", "user-1")).rejects.toThrow(
      /tidak ditemukan/i,
    );
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it("throws BusinessRule when status is not shippable", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-3",
      orderNumber: "SO-2026-0003",
      orderType: SalesOrderType.MAKE_TO_ORDER,
      status: SalesOrderStatus.DRAFT,
    } as never);
    await expect(markReadyToShip("so-3", "user-1")).rejects.toThrow(
      /IN_PRODUCTION or CONFIRMED/i,
    );
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });
});

describe("shipOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const serviceItem = {
    productVariant: { product: { productType: ProductType.SERVICE } },
  };
  const physicalItem = {
    productVariant: { product: { productType: ProductType.FINISHED_GOOD } },
  };

  it("throws NotFound when order is missing", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
    await expect(shipOrder("missing", "user-1")).rejects.toThrow(
      /tidak ditemukan/i,
    );
  });

  it("throws BusinessRule when status is not shippable", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      sourceLocationId: "loc-1",
      items: [physicalItem],
    } as never);
    await expect(shipOrder("so-1", "user-1")).rejects.toThrow(
      /CONFIRMED, IN_PRODUCTION, or READY_TO_SHIP/i,
    );
  });

  it("throws BusinessRule when sourceLocationId is missing", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      status: SalesOrderStatus.CONFIRMED,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      sourceLocationId: null,
      items: [physicalItem],
    } as never);
    await expect(shipOrder("so-1", "user-1")).rejects.toThrow(
      /Source location is required/i,
    );
  });

  it("closes a maklon service-only order without a physical DO", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-svc",
      orderNumber: "SO-2026-0009",
      status: SalesOrderStatus.CONFIRMED,
      orderType: SalesOrderType.MAKLON_JASA,
      sourceLocationId: "loc-1",
      items: [serviceItem],
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    const result = await shipOrder("so-svc", "user-1");

    expect(result).toEqual({
      doNumber: null,
      created: false,
      serviceOnly: true,
    });
    expect(createDraftInvoiceFromOrder).toHaveBeenCalledWith(
      "so-svc",
      "user-1",
    );
    expect(createDeliveryOrderFromSalesOrder).not.toHaveBeenCalled();
  });

  it("throws when multiple open delivery orders exist", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-multi",
      orderNumber: "SO-2026-0010",
      status: SalesOrderStatus.READY_TO_SHIP,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      sourceLocationId: "loc-1",
      items: [physicalItem],
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { id: "do-1", orderNumber: "DO-1" },
      { id: "do-2", orderNumber: "DO-2" },
    ] as never);

    await expect(shipOrder("so-multi", "user-1")).rejects.toThrow(
      /Surat Jalan aktif/i,
    );
    expect(commitDeliveryShipment).not.toHaveBeenCalled();
  });

  it("commits the existing open DO when exactly one exists", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-one",
      orderNumber: "SO-2026-0011",
      status: SalesOrderStatus.CONFIRMED,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      sourceLocationId: "loc-1",
      items: [physicalItem],
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { id: "do-1", orderNumber: "DO-1" },
    ] as never);

    const result = await shipOrder("so-one", "user-1", {
      carrier: "JNE",
      trackingNumber: "T1",
    });

    expect(result).toEqual({ doNumber: "DO-1", created: false });
    expect(commitDeliveryShipment).toHaveBeenCalledWith("do-1", "user-1", {
      carrier: "JNE",
      trackingNumber: "T1",
    });
    expect(createDeliveryOrderFromSalesOrder).not.toHaveBeenCalled();
  });

  it("creates a DO then commits when none are open", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-none",
      orderNumber: "SO-2026-0012",
      status: SalesOrderStatus.IN_PRODUCTION,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      sourceLocationId: "loc-1",
      items: [physicalItem],
    } as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([] as never);
    createDeliveryOrderFromSalesOrder.mockResolvedValue({
      id: "do-new",
      orderNumber: "DO-NEW",
    });

    const result = await shipOrder("so-none", "user-1");

    expect(result).toEqual({ doNumber: "DO-NEW", created: true });
    expect(createDeliveryOrderFromSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        salesOrderId: "so-none",
        sourceLocationId: "loc-1",
        userId: "user-1",
      }),
    );
    expect(commitDeliveryShipment).toHaveBeenCalledWith(
      "do-new",
      "user-1",
      undefined,
    );
  });
});
