import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocationType, MovementType } from "@prisma/client";
import {
  getSuggestedPurchases,
  getInventoryValuation,
  getInventoryAsOf,
  getStockHistory,
  getInventoryTurnover,
  getDaysOfInventoryOnHand,
  getStockMovementTrends,
} from "../analytics-service";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    productVariant: {
      findMany: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    stockMovement: {
      findMany: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("analytics-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------ //
  //  getSuggestedPurchases                                               //
  // ------------------------------------------------------------------ //
  describe("getSuggestedPurchases", () => {
    it("should return variants that need reordering", async () => {
      // Arrange
      const mockVariants = [
        {
          id: "pv-1",
          name: "Product A",
          reorderPoint: { toNumber: () => 100 },
          product: { name: "Product A", productType: "RAW_MATERIAL" },
          preferredSupplier: { name: "Supplier A" },
          inventories: [
            { quantity: { toNumber: () => 30 } },
            { quantity: { toNumber: () => 20 } },
          ],
        },
        {
          id: "pv-2",
          name: "Product B",
          reorderPoint: { toNumber: () => 50 },
          product: { name: "Product B", productType: "RAW_MATERIAL" },
          preferredSupplier: null,
          inventories: [{ quantity: { toNumber: () => 100 } }],
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
        mockVariants as any,
      );

      // Act
      const result = await getSuggestedPurchases();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("pv-1");
      expect(result[0].totalStock).toBe(50);
      expect(result[0].shouldReorder).toBe(true);
    });

    it("should return empty array when no variants need reordering", async () => {
      // Arrange
      const mockVariants = [
        {
          id: "pv-1",
          name: "Product A",
          reorderPoint: { toNumber: () => 100 },
          product: { name: "Product A", productType: "RAW_MATERIAL" },
          preferredSupplier: null,
          inventories: [{ quantity: { toNumber: () => 150 } }],
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
        mockVariants as any,
      );

      // Act
      const result = await getSuggestedPurchases();

      // Assert
      expect(result).toHaveLength(0);
    });

    it("should handle variants with null reorder point", async () => {
      // Arrange
      const mockVariants = [
        {
          id: "pv-1",
          name: "Product A",
          reorderPoint: null,
          product: { name: "Product A", productType: "RAW_MATERIAL" },
          preferredSupplier: null,
          inventories: [{ quantity: { toNumber: () => 50 } }],
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
        mockVariants as any,
      );

      // Act
      const result = await getSuggestedPurchases();

      // Assert
      expect(result).toHaveLength(0);
    });

    it("should treat null reorderPoint as 0 and reorder when stock is negative", async () => {
      // Arrange - null reorderPoint || 0 = 0, so totalPhysical < 0 triggers reorder
      const mockVariants = [
        {
          id: "pv-1",
          name: "Product A",
          reorderPoint: null,
          product: { name: "Product A", productType: "RAW_MATERIAL" },
          preferredSupplier: null,
          inventories: [{ quantity: { toNumber: () => -5 } }],
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
        mockVariants as any,
      );

      // Act
      const result = await getSuggestedPurchases();

      // Assert - totalStock=-5 < 0 (the fallback reorderPoint), so should reorder
      expect(result).toHaveLength(1);
      expect(result[0].totalStock).toBe(-5);
    });

    it("should return empty array when no variants have reorderPoint set", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([]);

      // Act
      const result = await getSuggestedPurchases();

      // Assert
      expect(result).toHaveLength(0);
    });

    it("should sum multiple inventory locations correctly", async () => {
      // Arrange
      const mockVariants = [
        {
          id: "pv-1",
          name: "Product A",
          reorderPoint: { toNumber: () => 100 },
          product: { name: "Product A", productType: "RAW_MATERIAL" },
          preferredSupplier: { name: "Supplier A" },
          inventories: [
            { quantity: { toNumber: () => 10 } },
            { quantity: { toNumber: () => 20 } },
            { quantity: { toNumber: () => 30 } },
          ],
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
        mockVariants as any,
      );

      // Act
      const result = await getSuggestedPurchases();

      // Assert - 10+20+30=60 < 100, should reorder
      expect(result).toHaveLength(1);
      expect(result[0].totalStock).toBe(60);
    });
  });

  // ------------------------------------------------------------------ //
  //  getInventoryValuation                                               //
  // ------------------------------------------------------------------ //
  describe("getInventoryValuation", () => {
    it("should calculate inventory valuation correctly", async () => {
      // Arrange
      const mockInventory = [
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: { toNumber: () => 10 },
          location: {
            id: "loc-1",
            name: "Main Warehouse",
            locationType: "INTERNAL",
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 8 },
          },
        },
        {
          productVariantId: "pv-2",
          locationId: "loc-2",
          quantity: { toNumber: () => 50 },
          averageCost: null,
          location: {
            id: "loc-2",
            name: "Customer Warehouse",
            locationType: "CUSTOMER_OWNED",
          },
          productVariant: {
            name: "Product B",
            skuCode: "SKU-002",
            buyPrice: { toNumber: () => 20 },
          },
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue(
        mockInventory as any,
      );

      // Act
      const result = await getInventoryValuation();

      // Assert
      expect(result.totalValuation).toBe(2000);
      expect(result.financeValuation).toBe(1000);
      expect(result.customerOwnedValuation).toBe(1000);
      expect(result.details).toHaveLength(2);
    });

    it("should return zero valuation when no inventory", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getInventoryValuation();

      // Assert
      expect(result.totalValuation).toBe(0);
      expect(result.financeValuation).toBe(0);
      expect(result.customerOwnedValuation).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("should use buyPrice when averageCost is null", async () => {
      // Arrange
      const mockInventory = [
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: null,
          location: {
            id: "loc-1",
            name: "Main Warehouse",
            locationType: "INTERNAL",
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 15 },
          },
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue(
        mockInventory as any,
      );

      // Act
      const result = await getInventoryValuation();

      // Assert
      expect(result.totalValuation).toBe(1500);
      expect(result.details[0].unitCost).toBe(15);
    });

    it("should default to 0 when both averageCost and buyPrice are null", async () => {
      // Arrange
      const mockInventory = [
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: null,
          location: {
            id: "loc-1",
            name: "Main Warehouse",
            locationType: "INTERNAL",
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: null,
          },
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue(
        mockInventory as any,
      );

      // Act
      const result = await getInventoryValuation();

      // Assert
      expect(result.totalValuation).toBe(0);
      expect(result.details[0].unitCost).toBe(0);
    });

    it("should include all detail fields in output", async () => {
      // Arrange
      const mockInventory = [
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 10 },
          averageCost: { toNumber: () => 5 },
          location: {
            id: "loc-1",
            name: "Warehouse A",
            locationType: LocationType.INTERNAL,
          },
          productVariant: {
            name: "Widget",
            skuCode: "W-001",
            buyPrice: { toNumber: () => 4 },
          },
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue(
        mockInventory as any,
      );

      // Act
      const result = await getInventoryValuation();

      // Assert
      expect(result.details[0]).toEqual({
        productVariantId: "pv-1",
        name: "Widget",
        sku: "W-001",
        locationId: "loc-1",
        locationName: "Warehouse A",
        locationType: LocationType.INTERNAL,
        quantity: 10,
        unitCost: 5,
        totalValue: 50,
      });
    });

    it("should classify TRANSFER locationType as finance valuation", async () => {
      // Arrange
      const mockInventory = [
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: { toNumber: () => 10 },
          location: {
            id: "loc-1",
            name: "Transit",
            locationType: "TRANSFER",
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 8 },
          },
        },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.inventory.findMany).mockResolvedValue(
        mockInventory as any,
      );

      // Act
      const result = await getInventoryValuation();

      // Assert - only CUSTOMER_OWNED is excluded from finance
      expect(result.financeValuation).toBe(1000);
      expect(result.customerOwnedValuation).toBe(0);
    });
  });

  // ------------------------------------------------------------------ //
  //  getInventoryAsOf                                                    //
  // ------------------------------------------------------------------ //
  describe("getInventoryAsOf", () => {
    it("should query raw SQL for historical inventory snapshot", async () => {
      // Arrange
      const mockResult = [
        { productVariantId: "pv-1", locationId: "loc-1", quantity: 50 },
        { productVariantId: "pv-2", locationId: "loc-1", quantity: 30 },
      ];

      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockResult);

      const targetDate = new Date("2026-01-15");

      // Act
      const result = await getInventoryAsOf(targetDate);

      // Assert
      expect(result).toEqual(mockResult);
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    });

    it("should return empty array when no movements exist", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      const targetDate = new Date("2026-01-01");

      // Act
      const result = await getInventoryAsOf(targetDate);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ //
  //  getStockHistory                                                     //
  // ------------------------------------------------------------------ //
  describe("getStockHistory", () => {
    it("should return daily stock history with initial movements", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-03");

      const { prisma } = await import("@/lib/core/prisma");

      // First call: initial movements before startDate
      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([
          // inbound (no fromLocation, has toLocation) => +100
          {
            quantity: { toNumber: () => 100 },
            toLocationId: "loc-1",
            fromLocationId: null,
          },
          // outbound (no toLocation, has fromLocation) => -20
          {
            quantity: { toNumber: () => 20 },
            toLocationId: null,
            fromLocationId: "loc-1",
          },
        ] as any)
        // Second call: movements in range (empty)
        .mockResolvedValueOnce([] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate);

      // Assert - initial stock = 100 - 20 = 80
      expect(result).toHaveLength(3); // Jan 1, 2, 3
      expect(result[0].stock).toBe(80);
      expect(result[1].stock).toBe(80);
      expect(result[2].stock).toBe(80);
    });

    it("should apply locationId filter with OR condition", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      // Initial movements
      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        // Movements in range
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 50 },
            toLocationId: "loc-1",
            fromLocationId: null,
            createdAt: new Date("2026-01-01T10:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate, "loc-1");

      // Assert - should include OR filter for locationId
      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ fromLocationId: "loc-1" }, { toLocationId: "loc-1" }],
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].stock).toBe(50);
    });

    it("should handle transfer movements without locationId filter", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        // Transfer: has both from and to - should be ignored without locationId
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 100 },
            toLocationId: "loc-A",
            fromLocationId: "loc-B",
            createdAt: new Date("2026-01-01T10:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate);

      // Assert - transfer has both from and to, so neither branch fires
      expect(result[0].stock).toBe(0);
    });

    it("should handle inbound movements in range without locationId", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 75 },
            toLocationId: "loc-1",
            fromLocationId: null,
            createdAt: new Date("2026-01-01T12:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate);

      // Assert
      expect(result[0].stock).toBe(75);
    });

    it("should handle outbound movements in range without locationId", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 30 },
            toLocationId: null,
            fromLocationId: "loc-1",
            createdAt: new Date("2026-01-01T14:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate);

      // Assert
      expect(result[0].stock).toBe(-30);
    });

    it("should handle movements to locationId with location filter", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 40 },
            toLocationId: "loc-1",
            fromLocationId: "loc-2",
            createdAt: new Date("2026-01-01T09:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate, "loc-1");

      // Assert - toLocationId matches locationId => +40
      expect(result[0].stock).toBe(40);
    });

    it("should handle movements from locationId with location filter", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 25 },
            toLocationId: "loc-2",
            fromLocationId: "loc-1",
            createdAt: new Date("2026-01-01T11:00:00"),
          },
        ] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate, "loc-1");

      // Assert - fromLocationId matches locationId => -25
      expect(result[0].stock).toBe(-25);
    });

    it("should accumulate initial stock across multiple initial movements", async () => {
      // Arrange
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-01");

      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([
          {
            quantity: { toNumber: () => 100 },
            toLocationId: "loc-1",
            fromLocationId: null,
          },
          {
            quantity: { toNumber: () => 50 },
            toLocationId: "loc-1",
            fromLocationId: null,
          },
          {
            quantity: { toNumber: () => 10 },
            toLocationId: null,
            fromLocationId: "loc-1",
          },
        ] as any)
        .mockResolvedValueOnce([] as any);

      // Act
      const result = await getStockHistory("pv-1", startDate, endDate, "loc-1");

      // Assert - 100 + 50 - 10 = 140
      expect(result[0].stock).toBe(140);
    });
  });

  // ------------------------------------------------------------------ //
  //  getInventoryTurnover                                                //
  // ------------------------------------------------------------------ //
  describe("getInventoryTurnover", () => {
    it("should calculate turnover ratio correctly", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      // Mock outbound movements (OUT type)
      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([
          { quantity: { toNumber: () => 100 }, cost: { toNumber: () => 10 } },
          { quantity: { toNumber: () => 50 }, cost: { toNumber: () => 10 } },
        ] as any)
        // Mock inbound movements (IN type)
        .mockResolvedValueOnce([
          { quantity: { toNumber: () => 200 }, cost: { toNumber: () => 8 } },
        ] as any);

      // Mock getInventoryValuation (called internally)
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: { toNumber: () => 10 },
          location: {
            id: "loc-1",
            name: "Warehouse",
            locationType: LocationType.INTERNAL,
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 8 },
          },
        },
      ] as any);

      // Act
      const result = await getInventoryTurnover(30);

      // Assert
      expect(result.periodDays).toBe(30);
      // COGS = (100*10) + (50*10) = 1500
      expect(result.cogs).toBe(1500);
      // inValue = 200*8 = 1600, closingValue = 100*10 = 1000
      // openingValue = 1000 - 1600 + 1500 = 900
      // averageInventory = (900 + 1000) / 2 = 950
      expect(result.averageInventory).toBe(950);
      // turnoverRatio = 1500 / 950 = 1.58
      expect(result.turnoverRatio).toBe(1.58);
    });

    it("should default periodDays to 30", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([] as any);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getInventoryTurnover();

      // Assert
      expect(result.periodDays).toBe(30);
    });

    it("should handle zero COGS with zero average inventory", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([] as any);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getInventoryTurnover(30);

      // Assert
      expect(result.cogs).toBe(0);
      expect(result.averageInventory).toBe(0);
      expect(result.turnoverRatio).toBe(0);
    });

    it("should handle movements with null cost", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([
          { quantity: { toNumber: () => 100 }, cost: null },
        ] as any)
        .mockResolvedValueOnce([
          { quantity: { toNumber: () => 50 }, cost: null },
        ] as any);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getInventoryTurnover(30);

      // Assert - null cost defaults to 0
      expect(result.cogs).toBe(0);
    });
  });

  // ------------------------------------------------------------------ //
  //  getDaysOfInventoryOnHand                                            //
  // ------------------------------------------------------------------ //
  describe("getDaysOfInventoryOnHand", () => {
    it("should calculate days on hand correctly", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      // Mock outbound movements
      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([
          { quantity: { toNumber: () => 100 }, cost: { toNumber: () => 10 } },
        ] as any)
        // Mock inbound movements
        .mockResolvedValueOnce([] as any);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 100 },
          averageCost: { toNumber: () => 10 },
          location: {
            id: "loc-1",
            name: "Warehouse",
            locationType: LocationType.INTERNAL,
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 8 },
          },
        },
      ] as any);

      // Act
      const result = await getDaysOfInventoryOnHand(30);

      // Assert
      // COGS = 100*10 = 1000
      // inValue = 0, closingValue = 100*10 = 1000
      // openingValue = 1000 - 0 + 1000 = 2000
      // averageInventory = (2000 + 1000) / 2 = 1500
      // daysOnHand = (1500 / 1000) * 30 = 45
      expect(result.daysOnHand).toBe(45);
      expect(result.periodDays).toBe(30);
    });

    it("should return 999 when COGS is zero but averageInventory is positive", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([] as any);

      // Return inventory so averageInventory > 0
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        {
          productVariantId: "pv-1",
          locationId: "loc-1",
          quantity: { toNumber: () => 50 },
          averageCost: { toNumber: () => 10 },
          location: {
            id: "loc-1",
            name: "Warehouse",
            locationType: LocationType.INTERNAL,
          },
          productVariant: {
            name: "Product A",
            skuCode: "SKU-001",
            buyPrice: { toNumber: () => 8 },
          },
        },
      ] as any);

      // Act
      const result = await getDaysOfInventoryOnHand(30);

      // Assert
      expect(result.daysOnHand).toBe(999);
    });

    it("should return 0 days when COGS is zero and averageInventory is zero", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([] as any);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getDaysOfInventoryOnHand(30);

      // Assert
      expect(result.daysOnHand).toBe(0);
      expect(result.cogs).toBe(0);
      expect(result.averageInventory).toBe(0);
    });

    it("should default periodDays to 30", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

      // Act
      const result = await getDaysOfInventoryOnHand();

      // Assert
      expect(result.periodDays).toBe(30);
    });
  });

  // ------------------------------------------------------------------ //
  //  getStockMovementTrends                                              //
  // ------------------------------------------------------------------ //
  describe("getStockMovementTrends", () => {
    it("should group movements by date for month period", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
        {
          type: MovementType.IN,
          quantity: { toNumber: () => 100 },
          createdAt: new Date("2026-06-01T10:00:00"),
        },
        {
          type: MovementType.OUT,
          quantity: { toNumber: () => 30 },
          createdAt: new Date("2026-06-01T14:00:00"),
        },
        {
          type: MovementType.TRANSFER,
          quantity: { toNumber: () => 20 },
          createdAt: new Date("2026-06-02T09:00:00"),
        },
        {
          type: MovementType.ADJUSTMENT,
          quantity: { toNumber: () => 5 },
          createdAt: new Date("2026-06-02T11:00:00"),
        },
      ] as any);

      // Act
      const result = await getStockMovementTrends("month");

      // Assert
      // 30 days + 1 = 31 entries
      expect(result).toHaveLength(31);

      // Find the entries for June 1 and June 2
      const jun1 = result.find((r) => r.date === "2026-06-01");
      const jun2 = result.find((r) => r.date === "2026-06-02");

      expect(jun1).toBeDefined();
      expect(jun1!.in).toBe(100);
      expect(jun1!.out).toBe(30);
      expect(jun1!.transfer).toBe(0);
      expect(jun1!.adjustment).toBe(0);

      expect(jun2).toBeDefined();
      expect(jun2!.in).toBe(0);
      expect(jun2!.out).toBe(0);
      expect(jun2!.transfer).toBe(20);
      expect(jun2!.adjustment).toBe(5);
    });

    it("should default to month period", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

      // Act
      const result = await getStockMovementTrends();

      // Assert - 30 days + 1 = 31 entries
      expect(result).toHaveLength(31);
    });

    it("should use 7 days for week period", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

      // Act
      const result = await getStockMovementTrends("week");

      // Assert - 7 days + 1 = 8 entries
      expect(result).toHaveLength(8);
    });

    it("should use 90 days for quarter period", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

      // Act
      const result = await getStockMovementTrends("quarter");

      // Assert - 90 days + 1 = 91 entries
      expect(result).toHaveLength(91);
    });

    it("should return zeroed entries for days with no movements", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

      // Act
      const result = await getStockMovementTrends("week");

      // Assert
      expect(
        result.every(
          (r) =>
            r.in === 0 && r.out === 0 && r.transfer === 0 && r.adjustment === 0,
        ),
      ).toBe(true);
    });

    it("should accumulate multiple movements on the same day", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
        {
          type: MovementType.IN,
          quantity: { toNumber: () => 10 },
          createdAt: today,
        },
        {
          type: MovementType.IN,
          quantity: { toNumber: () => 20 },
          createdAt: today,
        },
      ] as any);

      // Act
      const result = await getStockMovementTrends("week");

      // Assert
      const todayEntry = result.find((r) => r.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.in).toBe(30);
    });

    it("should return results in chronological order", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

      // Act
      const result = await getStockMovementTrends("week");

      // Assert
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date >= result[i - 1].date).toBe(true);
      }
    });
  });
});
