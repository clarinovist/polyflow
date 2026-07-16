import { describe, it, expect, vi, beforeEach } from "vitest";
import { backflushMaterials } from "../execution-material-consumption";
import { prisma } from "@/lib/core/prisma";
import { resolveMaterialLocation } from "../execution-material-location";
import { InventoryCoreService } from "@/services/inventory/core-service";

// Mock dependencies
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    stockMovement: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    materialIssue: {
      create: vi.fn(),
    },
    inventory: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../execution-material-location", () => ({
  resolveMaterialLocation: vi.fn(),
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

describe("execution-material-consumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("backflushMaterials", () => {
    const mockTx = prisma;

    const mockOrder = {
      id: "po-1",
      orderNumber: "WO-001",
      plannedQuantity: 100,
      isMaklon: false,
      plannedMaterials: [
        {
          productVariantId: "pv-1",
          quantity: 10,
          productVariant: {
            id: "pv-1",
            product: {
              productType: "RAW_MATERIAL",
            },
          },
        },
      ],
    } as any;

    it("should backflush materials when no manual issue exists", async () => {
      // Arrange
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      // Find manual issues: none
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
      // Mock resolveSourceUnitCost
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        averageCost: { toNumber: () => 10 },
      } as any);

      // Act
      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      // Assert
      expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(mockTx, "loc-1", "pv-1", 10);
      expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(mockTx, "loc-1", "pv-1", 10);
      expect(prisma.materialIssue.create).toHaveBeenCalled();
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });

    it("should skip backflushing when manual issue movement (PROD-ISSUE-) exists", async () => {
      // Arrange
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      // Find manual issue: mock that it exists
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValueOnce({
        id: "sm-manual-1",
        reference: "PROD-ISSUE-WO-001",
      } as any);

      // Act
      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      // Assert
      expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
      expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
      expect(prisma.materialIssue.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it("should skip backflushing when consolidated issue movement (PROD-CONSOL-) exists", async () => {
      // Arrange
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      // Find manual/consol issue: mock that consol issue exists
      vi.mocked(prisma.stockMovement.findFirst)
        .mockResolvedValueOnce(null) // first check for PROD-ISSUE- returns null
        .mockResolvedValueOnce({
          id: "sm-consol-1",
          reference: "PROD-CONSOL-ISSUE-WO-001",
        } as any); // second check for PROD-CONSOL- returns the movement

      // Act
      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      // Assert
      expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
      expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
      expect(prisma.materialIssue.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });
});
