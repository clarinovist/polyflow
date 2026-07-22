import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmOrder, createOrder, updateOrder, cancelOrder } from "../orders-service";
import { prisma } from "@/lib/core/prisma";
import { ProductionService } from "@/services/production/production-service";
import { checkCreditLimit } from "../credit-service";
import {
  LocationType,
  ProductType,
  SalesOrderStatus,
  SalesOrderType,
  Unit,
} from "@prisma/client";
import { logger } from "@/lib/config/logger";
import { logActivity } from "@/lib/tools/audit";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    inventory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    materialIssue: {
      count: vi.fn(),
    },
    stockMovement: {
      count: vi.fn(),
    },
    stockReservation: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    bom: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("@/services/production/production-service", () => ({
  ProductionService: {
    createOrderFromSales: vi.fn(),
  },
}));

vi.mock("@/services/inventory/reservation-service", () => ({
  createStockReservation: vi.fn(),
}));

vi.mock("../credit-service", () => ({
  checkCreditLimit: vi.fn(),
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

describe("confirmOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup standard mock implementations for the successful path
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      totalAmount: { toNumber: () => 100 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
      ],
    } as never);

    vi.mocked(prisma.inventory.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
      _sum: { quantity: null },
    } as never);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as never);
    vi.mocked(prisma.bom.findMany).mockResolvedValue([
      { productVariantId: "pv-1" },
    ] as never);
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-1",
      name: "Maklon Service",
      product: { productType: ProductType.SERVICE },
    } as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({
      id: "loc-customer",
      name: "Customer Warehouse",
      locationType: LocationType.CUSTOMER_OWNED,
    } as never);
    vi.mocked(prisma.salesOrder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.salesOrder.create).mockResolvedValue({
      id: "so-new",
      items: [],
    } as never);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({
      id: "so-1",
      items: [],
    } as never);
    vi.mocked(checkCreditLimit).mockResolvedValue(undefined);
  });

  it("rejects Maklon Jasa create when source location is not customer-owned", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({
      id: "loc-internal",
      name: "Packing Area",
      locationType: LocationType.INTERNAL,
    } as never);

    await expect(
      createOrder(
        {
          customerId: "cust-1",
          sourceLocationId: "loc-internal",
          orderDate: new Date("2026-04-17T00:00:00.000Z"),
          expectedDate: null,
          orderType: SalesOrderType.MAKLON_JASA,
          notes: "test",
          shippingCost: 0,
          customItems: [],
          items: [
            {
              productVariantId: "pv-1",
              quantity: 1,
              unitPrice: 1000,
              discountPercent: 0,
              taxPercent: 0,
              dppOtherAmount: null,
              ppnMode: "EXCLUDE",
            },
          ],
        },
        "user-1",
      ) as any,
    ).rejects.toThrow("Maklon Jasa orders must use a customer-owned warehouse");
  });

  it("rejects Maklon Jasa update when source location is not customer-owned", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValueOnce({
      orderType: SalesOrderType.MAKLON_JASA,
      status: SalesOrderStatus.DRAFT,
      items: [],
      invoices: [],
      deliveryOrders: [],
    } as never);
    vi.mocked(prisma.location.findUnique).mockResolvedValue({
      id: "loc-internal",
      name: "Packing Area",
      locationType: LocationType.INTERNAL,
    } as never);

    await expect(
      updateOrder(
        {
          id: "so-1",
          customerId: "cust-1",
          sourceLocationId: "loc-internal",
          orderDate: new Date("2026-04-17T00:00:00.000Z"),
          expectedDate: null,
          notes: "test",
          shippingCost: 0,
          items: [
            {
              productVariantId: "pv-1",
              quantity: 1,
              unitPrice: 1000,
              discountPercent: 0,
              taxPercent: 0,
              dppOtherAmount: null,
              ppnMode: "EXCLUDE",
            },
          ],
        },
        "user-1",
      ),
    ).rejects.toThrow("Maklon Jasa orders must use a customer-owned warehouse");
  });

  it("shortage + missing BOM → confirms (MTS), warnings MISSING_DEFAULT_BOM, no WO created", async () => {
    // Setup: MTS order, no inventory, no BOM
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_STOCK,
      totalAmount: { toNumber: () => 100 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
      ],
    } as never);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.bom.findMany).mockResolvedValue([]); // No BOM
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
      { id: "pv-1", name: "Rafia Hitam KW 0,95 (10)" },
    ] as never);

    const result = await confirmOrder("so-1", "user-1");

    // Should confirm successfully (not throw)
    expect(result.status).toBe(SalesOrderStatus.CONFIRMED);
    // MISSING_DEFAULT_BOM + FG_DEMAND_QUEUED (auto-WO off by default)
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["MISSING_DEFAULT_BOM", "FG_DEMAND_QUEUED"]),
    );
    expect(result.warnings.find((w) => w.code === "MISSING_DEFAULT_BOM")?.productNames)
      .toContain("Rafia Hitam KW 0,95 (10)");
    expect(result.productionOrdersCreated).toBe(0);
    // WO should NOT be created (auto-WO default off + missing BOM)
    expect(ProductionService.createOrderFromSales).not.toHaveBeenCalled();
  });

  it("shortage + has BOM → default no auto-WO, status IN_PRODUCTION, FG demand queued", async () => {
    // Setup: MTO order, no inventory, BOM exists
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      totalAmount: { toNumber: () => 100 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
      ],
    } as never);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.bom.findMany).mockResolvedValue([
      { productVariantId: "pv-1" },
    ] as never);

    const result = await confirmOrder("so-1", "user-1");

    expect(result.status).toBe(SalesOrderStatus.IN_PRODUCTION);
    expect(result.productionOrdersCreated).toBe(0);
    expect(ProductionService.createOrderFromSales).not.toHaveBeenCalled();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("FG_DEMAND_QUEUED");
    expect(result.warnings[0].message).toContain("Papan Permintaan FG");
  });

  it("shortage + has BOM + AUTO_CREATE_WO_ON_SO_CONFIRM=true → auto-create WO", async () => {
    const prev = process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
    process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = "true";

    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_ORDER,
      totalAmount: { toNumber: () => 100 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
      ],
    } as never);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.bom.findMany).mockResolvedValue([
      { productVariantId: "pv-1" },
    ] as never);

    try {
      const result = await confirmOrder("so-1", "user-1");

      expect(result.status).toBe(SalesOrderStatus.IN_PRODUCTION);
      expect(result.warnings).toHaveLength(0);
      expect(ProductionService.createOrderFromSales).toHaveBeenCalledWith(
        "so-1",
        "pv-1",
        10,
      );
    } finally {
      if (prev === undefined) delete process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
      else process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = prev;
    }
  });

  it("partial: 2 shortages, 1 BOM missing → no auto-WO by default, warnings for missing BOM + board", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_STOCK,
      totalAmount: { toNumber: () => 200 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
        {
          id: "item-2",
          productVariantId: "pv-2",
          quantity: { toNumber: () => 5 } as never,
          productVariant: { product: { productType: "PHYSICAL" } },
        },
      ],
    } as never);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    // Only pv-1 has BOM
    vi.mocked(prisma.bom.findMany).mockResolvedValue([
      { productVariantId: "pv-1" },
    ] as never);
    vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
      { id: "pv-2", name: "Sedotan Bening Super" },
    ] as never);

    const result = await confirmOrder("so-1", "user-1");

    // Has at least 1 creatable → IN_PRODUCTION (demand board path)
    expect(result.status).toBe(SalesOrderStatus.IN_PRODUCTION);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["MISSING_DEFAULT_BOM", "FG_DEMAND_QUEUED"]),
    );
    expect(result.warnings.find((w) => w.code === "MISSING_DEFAULT_BOM")?.productNames)
      .toContain("Sedotan Bening Super");
    // Default: no auto-WO
    expect(ProductionService.createOrderFromSales).not.toHaveBeenCalled();
    expect(result.productionOrdersCreated).toBe(0);
  });

  it("full stock → CONFIRMED, no warnings, no BOM query", async () => {
    // Full stock available → no shortage → no BOM check at all
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      { productVariantId: "pv-1", quantity: { toNumber: () => 100 } as never },
    ] as never);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);

    const result = await confirmOrder("so-1", "user-1");

    expect(result.status).toBe(SalesOrderStatus.IN_PRODUCTION); // MTO default
    expect(result.warnings).toHaveLength(0);
    expect(result.shortageCount).toBe(0);
    // bom.findMany should not be called (no shortages)
    expect(prisma.bom.findMany).not.toHaveBeenCalled();
  });

  it("WO create throws sync → still logged when auto-WO enabled", async () => {
    const prev = process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
    process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = "true";

    const loggerErrorSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => {});
    const mockError = new Error("Catastrophic failure in WO creation");

    vi.mocked(ProductionService.createOrderFromSales).mockImplementation(() => {
      throw mockError;
    });

    try {
      const result = await confirmOrder("so-1", "user-1");

      // Confirm should succeed despite WO failure
      expect(result.status).toBe(SalesOrderStatus.IN_PRODUCTION);
      expect(result.productionOrdersCreated).toBe(0);
      expect(result.warnings.some((w) => w.code === "WO_CREATE_FAILED")).toBe(true);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Unexpected error in WO auto-creation",
        expect.objectContaining({ error: mockError }),
      );
    } finally {
      if (prev === undefined) delete process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
      else process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = prev;
      loggerErrorSpy.mockRestore();
    }
  });

  it("MTS + BOM exists + all WO rejected → post-adjust to CONFIRMED (auto-WO on)", async () => {
    const prev = process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
    process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = "true";

    // Silence expected logger.error noise for rejected auto-WO path
    const loggerErrorSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => {});

    // MTS order, shortage exists, BOM present, but WO creation rejects
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      id: "so-1",
      orderNumber: "SO-001",
      status: SalesOrderStatus.DRAFT,
      orderType: SalesOrderType.MAKE_TO_STOCK,
      totalAmount: { toNumber: () => 100 } as never,
      customerId: "cust-1",
      sourceLocationId: "loc-1",
      items: [
        {
          id: "item-1",
          productVariantId: "pv-1",
          quantity: { toNumber: () => 10 } as never,
          productVariant: { product: { productType: "PHYSICAL" }, name: "Sedotan Bening" },
        },
      ],
    } as never);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.bom.findMany).mockResolvedValue([
      { productVariantId: "pv-1" },
    ] as never);

    // WO creation rejects via Promise (not sync throw)
    vi.mocked(ProductionService.createOrderFromSales).mockRejectedValue(
      new Error("WO creation failed"),
    );

    try {
      const result = await confirmOrder("so-1", "user-1");

      // MTS: had creatable shortage → initially IN_PRODUCTION → but 0 WO succeeded → post-adjust to CONFIRMED
      expect(result.status).toBe(SalesOrderStatus.CONFIRMED);
      expect(result.productionOrdersCreated).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("WO_CREATE_FAILED");
      expect(result.warnings[0].productNames).toContain("Sedotan Bening");
      expect(result.warnings[0].message).toContain("Sedotan Bening");

      // Audit trail: confirm log + post-adjust status log
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SALES_ORDER_CONFIRMED",
          entityId: "so-1",
          details: expect.stringContaining("Status: IN_PRODUCTION"),
        }),
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SALES_ORDER_CONFIRMED",
          entityId: "so-1",
          details:
            "Status adjusted to CONFIRMED: no production orders created (all auto-WO failed or skipped).",
        }),
      );
      expect(loggerErrorSpy).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.AUTO_CREATE_WO_ON_SO_CONFIRM;
      else process.env.AUTO_CREATE_WO_ON_SO_CONFIRM = prev;
      loggerErrorSpy.mockRestore();
    }
  });

  it("stores sales-unit snapshot while keeping canonical quantity and price in base unit", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-pack",
      name: "Product Pack",
      primaryUnit: Unit.KG,
      salesUnit: Unit.PACK,
      conversionFactor: { toNumber: () => 0.25 } as never,
      product: { productType: ProductType.FINISHED_GOOD },
    } as never);

    await createOrder(
      {
        customerId: "cust-1",
        sourceLocationId: "loc-1",
        orderDate: new Date("2026-04-17T00:00:00.000Z"),
        expectedDate: null,
        orderType: SalesOrderType.MAKE_TO_ORDER,
        notes: "100 PACK",
        shippingCost: 0,
        customItems: [],
        items: [
          {
            productVariantId: "pv-pack",
            quantity: 25,
            unitPrice: 4000,
            enteredQuantity: 100,
            enteredUnit: Unit.PACK,
            conversionFactorSnapshot: 0.25,
            enteredUnitPrice: 1000,
            discountPercent: 0,
            taxPercent: 0,
            dppOtherAmount: null,
            ppnMode: "EXCLUDE",
          },
        ],
      },
      "user-1",
    );

    const createCall = vi
      .mocked(prisma.salesOrder.create)
      .mock.calls.at(-1)?.[0] as never as {
      data: {
        totalAmount: number;
        items: { create: Array<Record<string, unknown>> };
      };
    };
    expect(createCall.data.totalAmount).toBe(100000);
    expect(createCall.data.items.create[0]).toMatchObject({
      productVariantId: "pv-pack",
      quantity: 25,
      unitPrice: 4000,
      enteredQuantity: 100,
      enteredUnit: Unit.PACK,
      conversionFactorSnapshot: 0.25,
      enteredUnitPrice: 1000,
      subtotal: 100000,
    });
  });
});

describe("cancelOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrder = {
    id: "so-1",
    orderNumber: "SO-2026-0001",
    status: SalesOrderStatus.CONFIRMED,
  };

  it("should cancel order successfully when no material issues or deliveries", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.materialIssue.count).mockResolvedValue(0);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);
    vi.mocked(prisma.stockReservation.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.salesOrder.update).mockResolvedValue({} as any);

    await cancelOrder("so-1", "user-1");

    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: "so-1" },
      data: { status: SalesOrderStatus.CANCELLED },
    });
  });

  it("should throw when SHIPPED order", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      ...mockOrder,
      status: SalesOrderStatus.SHIPPED,
    } as any);

    await expect(cancelOrder("so-1", "user-1")).rejects.toThrow(
      "Cannot cancel orders that have been shipped or delivered",
    );
  });

  it("should throw when DELIVERED order", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
      ...mockOrder,
      status: SalesOrderStatus.DELIVERED,
    } as any);

    await expect(cancelOrder("so-1", "user-1")).rejects.toThrow(
      "Cannot cancel orders that have been shipped or delivered",
    );
  });

  it("should throw when material issues are ISSUED", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.materialIssue.count).mockResolvedValue(3);

    await expect(cancelOrder("so-1", "user-1")).rejects.toThrow(
      "material issues have already been issued",
    );
  });

  it("should throw when delivery stock movements exist", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.materialIssue.count).mockResolvedValue(0);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(2);

    await expect(cancelOrder("so-1", "user-1")).rejects.toThrow(
      "delivery stock movements already exist",
    );
  });

  it("should throw when order not found", async () => {
    vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

    await expect(cancelOrder("nonexistent", "user-1")).rejects.toThrow(
      "Sales Order",
    );
  });
});
