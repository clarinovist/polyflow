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
      findMany: vi.fn(),
      update: vi.fn(),
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
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        averageCost: { toNumber: () => 10 },
      } as any);
      vi.mocked(prisma.materialIssue.findMany).mockResolvedValue([]);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(mockTx, "loc-1", "pv-1", 10);
      expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(mockTx, "loc-1", "pv-1", 10);
      expect(prisma.materialIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ISSUED",
            quantity: 10,
          }),
        }),
      );
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });

    it("should convert full STAGED material issues to ISSUED on backflush", async () => {
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-wip");
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        averageCost: { toNumber: () => 12 },
      } as any);
      vi.mocked(prisma.materialIssue.findMany).mockResolvedValue([
        { id: "stage-1", quantity: 10 },
      ] as any);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(prisma.materialIssue.update).toHaveBeenCalledWith({
        where: { id: "stage-1" },
        data: {
          status: "ISSUED",
          locationId: "loc-wip",
        },
      });
      expect(prisma.materialIssue.create).not.toHaveBeenCalled();
    });

    it("should convert STAGED fully and create ISSUED for over-consumption", async () => {
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-wip");
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        averageCost: { toNumber: () => 12 },
      } as any);
      // Staged 4, consume 10 → convert 4 + create ISSUED 6
      vi.mocked(prisma.materialIssue.findMany).mockResolvedValue([
        { id: "stage-1", quantity: 4 },
      ] as any);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(prisma.materialIssue.update).toHaveBeenCalledWith({
        where: { id: "stage-1" },
        data: {
          status: "ISSUED",
          locationId: "loc-wip",
        },
      });
      expect(prisma.materialIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ISSUED",
            quantity: 6,
          }),
        }),
      );
    });

    it("should shrink STAGED and create ISSUED when consume is partial", async () => {
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-wip");
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
        averageCost: { toNumber: () => 12 },
      } as any);
      // Staged 15, consume 10 → STAGED becomes 5, create ISSUED 10
      vi.mocked(prisma.materialIssue.findMany).mockResolvedValue([
        { id: "stage-1", quantity: 15 },
      ] as any);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(prisma.materialIssue.update).toHaveBeenCalledWith({
        where: { id: "stage-1" },
        data: { quantity: 5 },
      });
      expect(prisma.materialIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ISSUED",
            quantity: 10,
          }),
        }),
      );
    });

    it("should skip backflushing when manual issue movement (PROD-ISSUE-) exists", async () => {
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      vi.mocked(prisma.stockMovement.findFirst).mockResolvedValueOnce({
        id: "sm-manual-1",
        reference: "PROD-ISSUE-WO-001",
      } as any);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
      expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
      expect(prisma.materialIssue.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it("should skip backflushing when consolidated issue movement (PROD-CONSOL-) exists", async () => {
      vi.mocked(resolveMaterialLocation).mockResolvedValue("loc-1");
      vi.mocked(prisma.stockMovement.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "sm-consol-1",
          reference: "PROD-CONSOL-ISSUE-WO-001",
        } as any);

      await backflushMaterials({
        tx: mockTx,
        order: mockOrder,
        productionOrderId: "po-1",
        totalConsumed: 100,
        reference: "Backflush: WO-001",
        userId: "user-1",
      });

      expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
      expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
      expect(prisma.materialIssue.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });
});
