import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDeliveryOrderFromSalesOrder,
  commitDeliveryShipment,
  getDeliveryStockReadiness,
} from "../delivery-fulfillment-service";
import { prisma } from "@/lib/core/prisma";
import {
  SalesOrderStatus,
  SalesOrderType,
  ProductType,
  DeliveryStatus,
  ReservationStatus,
} from "@prisma/client";
import { InventoryCoreService } from "@/services/inventory/core-service";
import { AccountingService } from "@/services/accounting/accounting-service";
import { InvoiceService } from "@/services/finance/invoice-service";

// --- Mocks ---

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    salesOrderItem: {
      update: vi.fn(),
    },
    deliveryOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    inventory: {
      findFirst: vi.fn(),
    },
    stockReservation: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/services/inventory/core-service", () => ({
  InventoryCoreService: {
    validateAndLockStock: vi.fn(),
    deductStock: vi.fn(),
  },
}));

vi.mock("@/services/accounting/accounting-service", () => ({
  AccountingService: {
    recordInventoryMovement: vi.fn(),
  },
}));

vi.mock("@/services/finance/invoice-service", () => ({
  InvoiceService: {
    createDraftInvoiceFromOrder: vi.fn(),
  },
}));

// --- Helpers ---

function makeSalesOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "so-1",
    orderNumber: "SO-2026-0001",
    status: SalesOrderStatus.CONFIRMED,
    orderType: SalesOrderType.MAKE_TO_ORDER,
    sourceLocationId: "loc-1",
    items: [
      {
        id: "soi-1",
        productVariantId: "pv-1",
        quantity: { toNumber: () => 100 },
        deliveredQty: { toNumber: () => 0 },
        enteredQuantity: { toNumber: () => 100 },
        enteredUnit: "Kg",
        conversionFactorSnapshot: { toNumber: () => 1 },
        productVariant: {
          id: "pv-1",
          product: { id: "p-1", name: "Karung 50kg", productType: ProductType.FINISHED_GOOD },
        },
      },
      {
        id: "soi-2",
        productVariantId: "pv-2",
        quantity: { toNumber: () => 50 },
        deliveredQty: { toNumber: () => 0 },
        enteredQuantity: { toNumber: () => 50 },
        enteredUnit: "Kg",
        conversionFactorSnapshot: { toNumber: () => 1 },
        productVariant: {
          id: "pv-2",
          product: { id: "p-2", name: "Karung 25kg", productType: ProductType.FINISHED_GOOD },
        },
      },
    ],
    ...overrides,
  };
}

function makeDeliveryOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "do-1",
    orderNumber: "DO-2026-0001",
    salesOrderId: "so-1",
    sourceLocationId: "loc-1",
    status: DeliveryStatus.PENDING,
    loadVerifiedAt: new Date("2026-07-22T00:00:00.000Z"),
    items: [
      {
        id: "doi-1",
        productVariantId: "pv-1",
        quantity: { toNumber: () => 100 },
        enteredQuantity: { toNumber: () => 100 },
        enteredUnit: "Kg",
        conversionFactorSnapshot: { toNumber: () => 1 },
      },
      {
        id: "doi-2",
        productVariantId: "pv-2",
        quantity: { toNumber: () => 50 },
        enteredQuantity: { toNumber: () => 50 },
        enteredUnit: "Kg",
        conversionFactorSnapshot: { toNumber: () => 1 },
      },
    ],
    salesOrder: makeSalesOrder(),
    ...overrides,
  };
}

// =============================================================================
// createDeliveryOrderFromSalesOrder
// =============================================================================
describe("createDeliveryOrderFromSalesOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a PENDING DO from a CONFIRMED SO", async () => {
    const so = makeSalesOrder();
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryOrder.create).mockResolvedValue({
      id: "do-new",
      orderNumber: "DO-2026-0001",
      status: DeliveryStatus.PENDING,
    } as never);

    const result = await createDeliveryOrderFromSalesOrder({
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      userId: "user-1",
    });

    expect(result.status).toBe(DeliveryStatus.PENDING);
    expect(prisma.deliveryOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeliveryStatus.PENDING,
          salesOrderId: "so-1",
        }),
      })
    );
    expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
    expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
  });

  it("creates DO from IN_PRODUCTION SO (Melindo MTO use case)", async () => {
    const so = makeSalesOrder({ status: SalesOrderStatus.IN_PRODUCTION });
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryOrder.create).mockResolvedValue({
      id: "do-new",
      status: DeliveryStatus.PENDING,
    } as never);

    const result = await createDeliveryOrderFromSalesOrder({
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      userId: "user-1",
    });

    expect(result.status).toBe(DeliveryStatus.PENDING);
  });

  it("creates DO from READY_TO_SHIP SO", async () => {
    const so = makeSalesOrder({ status: SalesOrderStatus.READY_TO_SHIP });
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryOrder.create).mockResolvedValue({
      id: "do-new",
      status: DeliveryStatus.PENDING,
    } as never);

    const result = await createDeliveryOrderFromSalesOrder({
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      userId: "user-1",
    });

    expect(result.status).toBe(DeliveryStatus.PENDING);
  });

  it("rejects DRAFT SO", async () => {
    const so = makeSalesOrder({ status: SalesOrderStatus.DRAFT });
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);

    await expect(
      createDeliveryOrderFromSalesOrder({
        salesOrderId: "so-1",
        sourceLocationId: "loc-1",
        userId: "user-1",
      })
    ).rejects.toThrow(/CONFIRMED|IN_PRODUCTION|READY_TO_SHIP/);
  });

  it("rejects CANCELLED SO", async () => {
    const so = makeSalesOrder({ status: SalesOrderStatus.CANCELLED });
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);

    await expect(
      createDeliveryOrderFromSalesOrder({
        salesOrderId: "so-1",
        sourceLocationId: "loc-1",
        userId: "user-1",
      })
    ).rejects.toThrow(/CANCELLED|not allowed/i);
  });

  it("rejects SHIPPED SO (already fully shipped)", async () => {
    const so = makeSalesOrder({ status: SalesOrderStatus.SHIPPED });
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);

    await expect(
      createDeliveryOrderFromSalesOrder({
        salesOrderId: "so-1",
        sourceLocationId: "loc-1",
        userId: "user-1",
      })
    ).rejects.toThrow();
  });

  it("rejects when residual qty is 0 (fully delivered)", async () => {
    const so = makeSalesOrder();
    so.items[0].deliveredQty = { toNumber: () => 100 } as never;
    so.items[1].deliveredQty = { toNumber: () => 50 } as never;
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);

    await expect(
      createDeliveryOrderFromSalesOrder({
        salesOrderId: "so-1",
        sourceLocationId: "loc-1",
        userId: "user-1",
      })
    ).rejects.toThrow();
  });

  it("rejects when open DO already exists for same SO", async () => {
    const so = makeSalesOrder();
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([
      { id: "do-existing", orderNumber: "DO-2026-0001", status: DeliveryStatus.PENDING },
    ] as never);

    await expect(
      createDeliveryOrderFromSalesOrder({
        salesOrderId: "so-1",
        sourceLocationId: "loc-1",
        userId: "user-1",
      })
    ).rejects.toThrow();
  });

  it("skips SERVICE items — only physical items in DO", async () => {
    const so = makeSalesOrder();
    so.items.push({
      id: "soi-3",
      productVariantId: "pv-svc",
      quantity: { toNumber: () => 1 },
      deliveredQty: { toNumber: () => 0 },
      enteredQuantity: { toNumber: () => 1 },
      enteredUnit: "Pcs",
      conversionFactorSnapshot: { toNumber: () => 1 },
      productVariant: {
        id: "pv-svc",
        product: { id: "p-svc", name: "Jasa Maklon", productType: ProductType.SERVICE },
      },
    } as never);

    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryOrder.create).mockResolvedValue({
      id: "do-new",
      status: DeliveryStatus.PENDING,
    } as never);

    await createDeliveryOrderFromSalesOrder({
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      userId: "user-1",
    });

    const createCall = vi.mocked(prisma.deliveryOrder.create).mock.calls[0][0];
    const items = (createCall?.data?.items as any)?.create;
    expect(items).toHaveLength(2);
    expect(items.every((i: { productVariantId: string }) => i.productVariantId !== "pv-svc")).toBe(true);
  });

  it("writes residual qty on DO lines (qty - deliveredQty), not full SO qty", async () => {
    const so = makeSalesOrder();
    so.items[0].quantity = { toNumber: () => 100 } as never;
    so.items[0].deliveredQty = { toNumber: () => 30 } as never;
    so.items[0].conversionFactorSnapshot = { toNumber: () => 1 } as never;
    so.items[1].quantity = { toNumber: () => 50 } as never;
    so.items[1].deliveredQty = { toNumber: () => 50 } as never; // fully delivered — skipped

    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(so as never);
    vi.mocked(prisma.deliveryOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.deliveryOrder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.deliveryOrder.create).mockResolvedValue({
      id: "do-new",
      status: DeliveryStatus.PENDING,
    } as never);

    await createDeliveryOrderFromSalesOrder({
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      userId: "user-1",
    });

    const createCall = vi.mocked(prisma.deliveryOrder.create).mock.calls[0][0];
    const items = (createCall?.data?.items as any)?.create as Array<{ productVariantId: string; quantity: number }>;
    expect(items).toHaveLength(1);
    expect(items[0].productVariantId).toBe("pv-1");
    expect(items[0].quantity).toBe(70);
  });
});

// =============================================================================
// commitDeliveryShipment
// =============================================================================
describe("commitDeliveryShipment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits PENDING DO → stock OUT + SHIPPED + deliveredQty + invoice", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.PENDING });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);
    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);
    vi.mocked(InventoryCoreService.validateAndLockStock).mockResolvedValue(0);
    vi.mocked(InventoryCoreService.deductStock).mockResolvedValue(undefined);
    vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: "mv-1" } as never);
    vi.mocked(AccountingService.recordInventoryMovement).mockResolvedValue(undefined);
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrderItem.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(InvoiceService.createDraftInvoiceFromOrder).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await commitDeliveryShipment("do-1", "user-1");

    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "do-1" },
        data: expect.objectContaining({ status: DeliveryStatus.SHIPPED }),
      })
    );
    expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledTimes(2);
    expect(InventoryCoreService.deductStock).toHaveBeenCalledTimes(2);
    expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(AccountingService.recordInventoryMovement).toHaveBeenCalledTimes(2);
    expect(prisma.salesOrderItem.update).toHaveBeenCalledTimes(2);
    expect(prisma.salesOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "so-1" },
        data: expect.objectContaining({ status: SalesOrderStatus.SHIPPED }),
      })
    );
    expect(InvoiceService.createDraftInvoiceFromOrder).toHaveBeenCalledWith("so-1", "user-1");
    expect(result.success).toBe(true);
  });

  it("also commits LOADING DO", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.LOADING });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);
    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);
    vi.mocked(InventoryCoreService.validateAndLockStock).mockResolvedValue(0);
    vi.mocked(InventoryCoreService.deductStock).mockResolvedValue(undefined);
    vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: "mv-1" } as never);
    vi.mocked(AccountingService.recordInventoryMovement).mockResolvedValue(undefined);
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrderItem.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(InvoiceService.createDraftInvoiceFromOrder).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await commitDeliveryShipment("do-1", "user-1");

    expect(result.success).toBe(true);
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeliveryStatus.SHIPPED }),
      })
    );
  });

  it("rejects commit when load not verified", async () => {
    const doRecord = makeDeliveryOrder({ loadVerifiedAt: null });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);

    await expect(commitDeliveryShipment("do-1", "user-1")).rejects.toThrow(/Verifikasi muat/i);

    expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it("rejects when stock insufficient — no status change, no deliveredQty", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.PENDING });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);
    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);
    vi.mocked(InventoryCoreService.validateAndLockStock).mockRejectedValue(
      new Error("Insufficient stock: pv-1 needs 100, available 30")
    );

    await expect(commitDeliveryShipment("do-1", "user-1")).rejects.toThrow(/Insufficient stock/i);

    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
    expect(prisma.salesOrderItem.update).not.toHaveBeenCalled();
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    expect(InvoiceService.createDraftInvoiceFromOrder).not.toHaveBeenCalled();
  });

  it("rejects double commit (already SHIPPED)", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.SHIPPED });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);

    await expect(commitDeliveryShipment("do-1", "user-1")).rejects.toThrow();
    expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
    expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
  });

  it("rejects commit from DELIVERED status", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.DELIVERED });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);

    await expect(commitDeliveryShipment("do-1", "user-1")).rejects.toThrow();
    expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
  });

  it("rejects commit from CANCELLED status", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.CANCELLED });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);

    await expect(commitDeliveryShipment("do-1", "user-1")).rejects.toThrow();
    expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
  });

  it("consumes ACTIVE reservations before deducting stock", async () => {
    const doRecord = makeDeliveryOrder({ status: DeliveryStatus.PENDING });
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);
    vi.mocked(prisma.stockReservation.findMany)
      .mockResolvedValueOnce([
        { id: "res-1", quantity: { toNumber: () => 60 }, productVariantId: "pv-1" },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.stockReservation.update).mockResolvedValue({} as never);
    vi.mocked(InventoryCoreService.validateAndLockStock).mockResolvedValue(0);
    vi.mocked(InventoryCoreService.deductStock).mockResolvedValue(undefined);
    vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: "mv-1" } as never);
    vi.mocked(AccountingService.recordInventoryMovement).mockResolvedValue(undefined);
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrderItem.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(InvoiceService.createDraftInvoiceFromOrder).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 1 } as never);

    await commitDeliveryShipment("do-1", "user-1");

    expect(prisma.stockReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "res-1" },
        data: { status: ReservationStatus.FULFILLED },
      })
    );
  });

  it("skips SERVICE items — no stock deduction for services", async () => {
    const doRecord = makeDeliveryOrder();
    (doRecord.items as unknown[]).push({
      id: "doi-svc",
      productVariantId: "pv-svc",
      quantity: { toNumber: () => 1 },
      enteredQuantity: { toNumber: () => 1 },
      enteredUnit: "Pcs",
      conversionFactorSnapshot: { toNumber: () => 1 },
    });
    (doRecord.salesOrder.items as unknown[]).push({
      id: "soi-svc",
      productVariantId: "pv-svc",
      quantity: { toNumber: () => 1 },
      deliveredQty: { toNumber: () => 0 },
      productVariant: {
        id: "pv-svc",
        product: { id: "p-svc", name: "Jasa Maklon", productType: ProductType.SERVICE },
      },
    });

    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(doRecord as never);
    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);
    vi.mocked(InventoryCoreService.validateAndLockStock).mockResolvedValue(0);
    vi.mocked(InventoryCoreService.deductStock).mockResolvedValue(undefined);
    vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: "mv-1" } as never);
    vi.mocked(AccountingService.recordInventoryMovement).mockResolvedValue(undefined);
    vi.mocked(prisma.deliveryOrder.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrderItem.update).mockResolvedValue({} as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as never);
    vi.mocked(InvoiceService.createDraftInvoiceFromOrder).mockResolvedValue({} as never);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 0 } as never);

    await commitDeliveryShipment("do-1", "user-1");

    expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledTimes(2);
    expect(InventoryCoreService.deductStock).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// getDeliveryStockReadiness
// =============================================================================
describe("getDeliveryStockReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns readiness per line with available stock", async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
      id: "do-1",
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "doi-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 100 },
          productVariant: { id: "pv-1", product: { name: "Karung 50kg" } },
        },
      ],
    } as never);

    vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
      quantity: { toNumber: () => 150 },
    } as never);

    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);

    const result = await getDeliveryStockReadiness("do-1");

    expect(result).toHaveLength(1);
    expect(result[0].neededQty).toBe(100);
    expect(result[0].availableQty).toBe(150);
    expect(result[0].shortfall).toBe(0);
    expect(result[0].isReady).toBe(true);
  });

  it("returns shortfall when stock insufficient", async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
      id: "do-1",
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "doi-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 100 },
          productVariant: { id: "pv-1", product: { name: "Karung 50kg" } },
        },
      ],
    } as never);

    vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
      quantity: { toNumber: () => 30 },
    } as never);

    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([]);

    const result = await getDeliveryStockReadiness("do-1");

    expect(result[0].availableQty).toBe(30);
    expect(result[0].shortfall).toBe(70);
    expect(result[0].isReady).toBe(false);
  });

  it("accounts for reserved stock from other SOs", async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue({
      id: "do-1",
      salesOrderId: "so-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "doi-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 100 },
          productVariant: { id: "pv-1", product: { name: "Karung 50kg" } },
        },
      ],
    } as never);

    vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
      quantity: { toNumber: () => 120 },
    } as never);

    vi.mocked(prisma.stockReservation.findMany).mockResolvedValue([
      { quantity: { toNumber: () => 30 } },
    ] as never);

    const result = await getDeliveryStockReadiness("do-1");

    expect(result[0].availableQty).toBe(90);
    expect(result[0].shortfall).toBe(10);
    expect(result[0].isReady).toBe(false);
  });

  it("returns empty array when DO not found", async () => {
    vi.mocked(prisma.deliveryOrder.findUnique).mockResolvedValue(null);

    const result = await getDeliveryStockReadiness("nonexistent");
    expect(result).toEqual([]);
  });
});
