import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryCoreService } from "../core-service";
import { InsufficientStockError } from "@/lib/errors/errors";
import { prisma } from "@/lib/core/prisma";
import { ReservationStatus } from "@prisma/client";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    inventory: {
      findUnique: vi.fn(),
    },
    productVariant: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

// Mock NotificationService
vi.mock("@/services/core/notification-service", () => ({
  NotificationService: {
    createBulkNotifications: vi.fn(),
  },
}));

// Mock logger (imported by some modules)
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("InventoryCoreService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ================================================================
  // validateAndLockStock
  // ================================================================
  describe("validateAndLockStock", () => {
    it("should return current quantity when stock is sufficient and not reserved", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "100" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 0 } },
          }),
        },
      };

      // Act
      const result = await InventoryCoreService.validateAndLockStock(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
      );

      // Assert
      expect(result).toBe(100);
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.stockReservation.aggregate).toHaveBeenCalledWith({
        where: {
          locationId: "location-1",
          productVariantId: "pv-1",
          status: ReservationStatus.ACTIVE,
        },
        _sum: { quantity: true },
      });
    });

    it("should return 0 when no stock row exists", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 0 } },
          }),
        },
      };

      // Act & Assert - requesting 0 from empty should not throw
      const result = await InventoryCoreService.validateAndLockStock(
        mockTx as any,
        "location-1",
        "pv-1",
        0,
      );
      expect(result).toBe(0);
    });

    it("should throw InsufficientStockError when physical stock is insufficient", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "30" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 0 } },
          }),
        },
        productVariant: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Test Product",
            primaryUnit: "kg",
          }),
        },
        location: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Main Warehouse",
          }),
        },
      };

      // Act & Assert
      await expect(
        InventoryCoreService.validateAndLockStock(
          mockTx as any,
          "location-1",
          "pv-1",
          50,
        ),
      ).rejects.toThrow(InsufficientStockError);
    });

    it("should include fallback IDs in error when variant/location not found", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "30" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 0 } },
          }),
        },
        productVariant: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        location: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      // Act & Assert
      try {
        await InventoryCoreService.validateAndLockStock(
          mockTx as any,
          "location-999",
          "pv-999",
          50,
        );
        expect.fail("Should have thrown InsufficientStockError");
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientStockError);
        expect((error as InsufficientStockError).message).toContain(
          "location-999",
        );
        expect((error as InsufficientStockError).message).toContain(
          "Unknown Item",
        );
      }
    });

    it("should throw InsufficientStockError when stock is fully reserved", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "100" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 80 } },
          }),
        },
        productVariant: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Test Product",
            primaryUnit: "kg",
          }),
        },
        location: {
          findUnique: vi.fn().mockResolvedValue({
            name: "Main Warehouse",
          }),
        },
      };

      // Act & Assert
      await expect(
        InventoryCoreService.validateAndLockStock(
          mockTx as any,
          "location-1",
          "pv-1",
          50,
        ),
      ).rejects.toThrow(InsufficientStockError);
    });

    it("should include fallback IDs in reservation error when variant/location not found", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "100" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: { toNumber: () => 90 } },
          }),
        },
        productVariant: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        location: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      // Act & Assert
      try {
        await InventoryCoreService.validateAndLockStock(
          mockTx as any,
          "location-999",
          "pv-999",
          50,
        );
        expect.fail("Should have thrown InsufficientStockError");
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientStockError);
        expect((error as InsufficientStockError).message).toContain(
          "location-999",
        );
        expect((error as InsufficientStockError).message).toContain(
          "Unknown Item",
        );
      }
    });

    it("should treat null reservation sum as 0", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ quantity: "100" }]),
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: null },
          }),
        },
      };

      // Act
      const result = await InventoryCoreService.validateAndLockStock(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
      );

      // Assert - null toNumber means reservedQty falls back to 0
      expect(result).toBe(100);
    });
  });

  // ================================================================
  // deductStock
  // ================================================================
  describe("deductStock", () => {
    it("should decrement stock quantity", async () => {
      // Arrange
      const mockTx = {
        inventory: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.deductStock(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
      );

      // Assert
      expect(mockTx.inventory.update).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        data: { quantity: { decrement: 50 } },
      });
    });
  });

  // ================================================================
  // incrementStock
  // ================================================================
  describe("incrementStock", () => {
    it("should upsert inventory with incremented quantity", async () => {
      // Arrange
      const mockTx = {
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStock(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
      );

      // Assert
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: { quantity: { increment: 50 } },
        create: {
          locationId: "location-1",
          productVariantId: "pv-1",
          quantity: 50,
        },
      });
    });
  });

  // ================================================================
  // incrementStockWithCost
  // ================================================================
  describe("incrementStockWithCost", () => {
    it("should calculate WAC and upsert when inventory row exists", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "100",
            averageCost: "10",
          },
        ]),
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStockWithCost(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
        20,
      );

      // Assert - WAC = (100 * 10 + 50 * 20) / 150 = 2000 / 150 = 13.33
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: {
          quantity: { increment: 50 },
          averageCost: expect.closeTo(13.33, 2),
        },
        create: {
          locationId: "location-1",
          productVariantId: "pv-1",
          quantity: 50,
          averageCost: 20,
        },
      });
    });

    it("should use unitCost when no existing inventory row", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStockWithCost(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
        20,
      );

      // Assert - currentQty=0, currentAvgCost=0, totalQty=50
      // newAvgCost = (0*0 + 50*20) / 50 = 20 (but the ternary says unitCost)
      // Actually: totalQty > 0, so newAvgCost = (0*0 + 50*20) / 50 = 20
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: {
          quantity: { increment: 50 },
          averageCost: 20,
        },
        create: {
          locationId: "location-1",
          productVariantId: "pv-1",
          quantity: 50,
          averageCost: 20,
        },
      });
    });

    it("should handle null averageCost in existing row", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "100",
            averageCost: null,
          },
        ]),
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStockWithCost(
        mockTx as any,
        "location-1",
        "pv-1",
        50,
        20,
      );

      // Assert - currentAvgCost = 0 (null fallback), WAC = (100*0 + 50*20) / 150 = 6.67
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: {
          quantity: { increment: 50 },
          averageCost: expect.closeTo(6.67, 2),
        },
        create: {
          locationId: "location-1",
          productVariantId: "pv-1",
          quantity: 50,
          averageCost: 20,
        },
      });
    });

    it("should use unitCost when totalQty is 0 (zero current qty and zero incoming)", async () => {
      // Arrange - edge case: both currentQty and quantity are 0
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "0",
            averageCost: "5",
          },
        ]),
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStockWithCost(
        mockTx as any,
        "location-1",
        "pv-1",
        0,
        20,
      );

      // Assert - totalQty = 0 + 0 = 0, so newAvgCost = unitCost = 20
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: {
          quantity: { increment: 0 },
          averageCost: 20,
        },
        create: {
          locationId: "location-1",
          productVariantId: "pv-1",
          quantity: 0,
          averageCost: 20,
        },
      });
    });

    it("should calculate WAC correctly with equal quantities", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "100",
            averageCost: "10",
          },
        ]),
        inventory: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      // Act
      await InventoryCoreService.incrementStockWithCost(
        mockTx as any,
        "location-1",
        "pv-1",
        100,
        20,
      );

      // Assert - WAC = (100*10 + 100*20) / 200 = 3000 / 200 = 15
      expect(mockTx.inventory.upsert).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
        update: {
          quantity: { increment: 100 },
          averageCost: 15,
        },
        create: expect.any(Object),
      });
    });
  });

  // ================================================================
  // calculateWAC
  // ================================================================
  describe("calculateWAC", () => {
    it("should calculate weighted average cost correctly inside transaction", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "100",
            averageCost: "10",
          },
        ]),
      };

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
        mockTx as any,
      );

      // Assert - WAC = (100 * 10 + 50 * 20) / 150 = 2000 / 150 = 13.33
      expect(result).toBeCloseTo(13.33, 2);
    });

    it("should return incoming cost when no existing inventory inside transaction", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
        mockTx as any,
      );

      // Assert - currentQty=0, currentAvgCost=0, WAC = (0*0 + 50*20)/50 = 20
      expect(result).toBe(20);
    });

    it("should return 0 when totalQty is 0 inside transaction", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "0",
            averageCost: "5",
          },
        ]),
      };

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        0,
        20,
        mockTx as any,
      );

      // Assert - totalQty = 0 + 0 = 0, returns 0
      expect(result).toBe(0);
    });

    it("should handle null averageCost inside transaction", async () => {
      // Arrange
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            quantity: "100",
            averageCost: null,
          },
        ]),
      };

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
        mockTx as any,
      );

      // Assert - currentAvgCost = 0, WAC = (100*0 + 50*20) / 150 = 6.67
      expect(result).toBeCloseTo(6.67, 2);
    });

    it("should use prisma when no transaction is provided", async () => {
      // Arrange
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        quantity: { toNumber: () => 100 },
        averageCost: { toNumber: () => 10 },
      } as any);

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
      );

      // Assert
      expect(result).toBeCloseTo(13.33, 2);
      expect(prisma.inventory.findUnique).toHaveBeenCalledWith({
        where: {
          locationId_productVariantId: {
            locationId: "location-1",
            productVariantId: "pv-1",
          },
        },
      });
    });

    it("should return incoming cost when no inventory record exists outside transaction", async () => {
      // Arrange
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue(null);

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
      );

      // Assert - currentQty=0, currentAvgCost=0, WAC = 20
      expect(result).toBe(20);
    });

    it("should return 0 when totalQty is 0 outside transaction", async () => {
      // Arrange
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        quantity: { toNumber: () => 0 },
        averageCost: { toNumber: () => 5 },
      } as any);

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        0,
        20,
      );

      // Assert - totalQty = 0 + 0 = 0, returns 0
      expect(result).toBe(0);
    });

    it("should handle null averageCost outside transaction", async () => {
      // Arrange
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        quantity: { toNumber: () => 100 },
        averageCost: null,
      } as any);

      // Act
      const result = await InventoryCoreService.calculateWAC(
        "pv-1",
        "location-1",
        50,
        20,
      );

      // Assert - currentAvgCost = 0, WAC = (100*0 + 50*20) / 150 = 6.67
      expect(result).toBeCloseTo(6.67, 2);
    });
  });

  // ================================================================
  // updateThreshold
  // ================================================================
  describe("updateThreshold", () => {
    it("should update minStockAlert for a product variant", async () => {
      // Arrange
      vi.mocked(prisma.productVariant.update).mockResolvedValue({} as any);

      // Act
      await InventoryCoreService.updateThreshold("pv-1", 25);

      // Assert
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: "pv-1" },
        data: { minStockAlert: expect.any(Object) },
      });
    });

    it("should set minStockAlert to 0", async () => {
      // Arrange
      vi.mocked(prisma.productVariant.update).mockResolvedValue({} as any);

      // Act
      await InventoryCoreService.updateThreshold("pv-1", 0);

      // Assert
      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: "pv-1" },
        data: { minStockAlert: expect.any(Object) },
      });
    });
  });

  // ================================================================
  // checkLowStockTriggers
  // ================================================================
  describe("checkLowStockTriggers", () => {
    it("should not create notifications when no variants have minStockAlert set", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });

    it("should not create notifications when stock is above threshold", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 150 },
              location: { slug: "rm_warehouse" },
            },
          ],
        },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - stock 150 > threshold 100
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });

    it("should create notifications when stock is below threshold in allowed location", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 50 },
              location: { slug: "rm_warehouse" },
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1" },
        { id: "user-2" },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith([
        {
          userId: "user-1",
          type: "LOW_STOCK",
          title: "Low Stock Alert",
          message: expect.stringContaining(
            'Product "Product A" has fallen below threshold (100). Current stock: 50.',
          ),
          link: "/admin/inventory?variantId=pv-1",
          entityType: "ProductVariant",
          entityId: "pv-1",
        },
        {
          userId: "user-2",
          type: "LOW_STOCK",
          title: "Low Stock Alert",
          message: expect.stringContaining(
            'Product "Product A" has fallen below threshold (100). Current stock: 50.',
          ),
          link: "/admin/inventory?variantId=pv-1",
          entityType: "ProductVariant",
          entityId: "pv-1",
        },
      ]);
    });

    it("should not create notifications when no admin users exist", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 50 },
              location: { slug: "rm_warehouse" },
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });

    it("should aggregate stock from multiple allowed locations", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 30 },
              location: { slug: "rm_warehouse" },
            },
            {
              quantity: { toNumber: () => 20 },
              location: { slug: "fg_warehouse" },
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1" },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - totalForAlert = 30 + 20 = 50 < 100
      expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith([
        expect.objectContaining({
          message: expect.stringContaining("Current stock: 50."),
        }),
      ]);
    });

    it("should ignore inventory in non-allowed locations", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 30 },
              location: { slug: "rm_warehouse" },
            },
            {
              quantity: { toNumber: () => 200 },
              location: { slug: "wip_storage" }, // not allowed
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1" },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - only rm_warehouse counted: 30 < 100, so notification sent
      expect(NotificationService.createBulkNotifications).toHaveBeenCalled();
    });

    it("should not create notification when totalForAlert is 0", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 0 },
              location: { slug: "rm_warehouse" },
            },
          ],
        },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - totalForAlert = 0, condition `totalForAlert > 0` is false
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });

    it("should handle null location slug in inventory", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Product A",
          inventories: [
            {
              quantity: { toNumber: () => 50 },
              location: null,
            },
          ],
        },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - null slug not in allowed set, totalForAlert=0
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });

    it("should handle multiple variants, some low and some not", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: { toNumber: () => 100 },
          name: "Low Product",
          inventories: [
            {
              quantity: { toNumber: () => 50 },
              location: { slug: "rm_warehouse" },
            },
          ],
        },
        {
          id: "pv-2",
          minStockAlert: { toNumber: () => 10 },
          name: "OK Product",
          inventories: [
            {
              quantity: { toNumber: () => 200 },
              location: { slug: "fg_warehouse" },
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1" },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - only pv-1 is low (50 < 100), pv-2 is OK (200 > 10)
      expect(NotificationService.createBulkNotifications).toHaveBeenCalledTimes(
        1,
      );
      expect(NotificationService.createBulkNotifications).toHaveBeenCalledWith([
        expect.objectContaining({ entityId: "pv-1" }),
      ]);
    });

    it("should handle null minStockAlert for a variant", async () => {
      // Arrange
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
        {
          id: "pv-1",
          minStockAlert: null,
          name: "Product A",
          inventories: [],
        },
      ] as any);
      const { NotificationService } =
        await import("@/services/core/notification-service");

      // Act
      await InventoryCoreService.checkLowStockTriggers();

      // Assert - threshold = 0 via || 0, totalForAlert=0, condition fails
      expect(
        NotificationService.createBulkNotifications,
      ).not.toHaveBeenCalled();
    });
  });
});
