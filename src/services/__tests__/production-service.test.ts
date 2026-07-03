import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductionService } from "../production/production-service";
import { prisma } from "@/lib/core/prisma";

vi.mock("@/lib/core/prisma", () => {
  const mockPrisma = {
    $transaction: vi.fn(async (queries) => {
      if (Array.isArray(queries)) return Promise.all(queries);
      if (typeof queries === "function") {
        return queries(mockPrisma);
      }
      return [];
    }),
    productionOrder: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    productionExecution: {
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    inventory: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    },
    materialIssue: {
      create: vi.fn(),
    },
    scrapRecord: {
      create: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
    },
    stockReservation: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { quantity: { toNumber: () => 0 } } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ quantity: 100 }]),
  };
  return { prisma: mockPrisma };
});
import { InventoryCoreService } from "@/services/inventory/core-service";
import { ProductionCostService } from "../production/cost-service";
import { AccountingService } from "../accounting/accounting-service";

vi.mock("../inventory/inventory-service");
vi.mock("../inventory/core-service");
vi.mock("../production/cost-service");
vi.mock("../accounting/accounting-service");
vi.mock("../finance/auto-journal-service");

describe("ProductionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Standard Prisma mocks for finding and updating orders

    (prisma.productionOrder.findUnique as any).mockImplementation(
      (args: any) => {
        // The findUnique for resolveProductionOutputUnit uses a select shape
        if (args?.select?.bom?.select?.productVariant?.select?.primaryUnit) {
          return Promise.resolve({
            bom: {
              productVariant: {
                primaryUnit: "KG",
                salesUnit: "PACK",
                conversionFactor: { toNumber: () => 0.25 },
              },
            },
          });
        }
        // Standard mock
        return Promise.resolve({
          id: "po-1",
          status: "RELEASED",
          plannedQuantity: 100,
          actualQuantity: 0,
          locationId: "loc-1",
          orderNumber: "WO-001",
          bom: {
            productVariantId: "pv-fg",
            outputQuantity: 100,
            category: "GENERAL",
            items: [{ productVariantId: "pv-mat1", quantity: 50 }],
          },
          plannedMaterials: [],
        });
      },
    );

    (prisma.productionOrder.findUniqueOrThrow as any).mockResolvedValue({
      id: "po-1",
      status: "RELEASED",
      plannedQuantity: 100,
      actualQuantity: 0,
      locationId: "loc-1",
      orderNumber: "WO-001",
      bom: {
        productVariantId: "pv-fg",
        outputQuantity: 100,
        category: "GENERAL",
        items: [
          { productVariantId: "pv-mat1", quantity: 50 },
          { productVariantId: "pv-mat2", quantity: 20 },
        ],
      },
      plannedMaterials: [],
    });

    (prisma.productionOrder.update as any).mockImplementation(
      ({ data }: any) => {
        return Promise.resolve({
          id: "po-1",
          orderNumber: "WO-001",
          status: data.status || "IN_PROGRESS",
          locationId: "loc-1",
          bom: {
            productVariantId: "pv-fg",
            outputQuantity: 100,
            category: "GENERAL",
            items: [{ productVariantId: "pv-mat1", quantity: 50 }],
          },
          plannedMaterials: [],
        });
      },
    );

    (prisma.productionExecution.create as any).mockResolvedValue({
      id: "exec-1",
      productionOrderId: "po-1",
    });

    (prisma.productionExecution.update as any).mockResolvedValue({
      id: "exec-1",
      productionOrderId: "po-1",
    });

    (prisma.productionExecution.findUniqueOrThrow as any).mockResolvedValue({
      id: "exec-1",
      productionOrderId: "po-1",
      enteredQuantity: null,
      enteredUnit: null,
      conversionFactorSnapshot: null,
      notes: null,
    });

    (prisma.inventory.upsert as any).mockResolvedValue({
      id: "inv-1",
      quantity: 10,
    });

    (prisma.inventory.findUnique as any).mockResolvedValue({
      id: "inv-1",
      quantity: { toNumber: () => 10 },
      averageCost: { toNumber: () => 100 },
    });

    (prisma.inventory.update as any).mockResolvedValue({});

    (prisma.stockMovement.create as any).mockResolvedValue({ id: "sm-1" });

    (prisma.materialIssue.create as any).mockResolvedValue({ id: "mi-1" });

    (prisma.scrapRecord.create as any).mockResolvedValue({ id: "scrap-1" });

    (prisma.location.findUnique as any).mockResolvedValue({ id: "loc-scrap" });

    (prisma.productVariant.findUnique as any).mockResolvedValue({
      id: "pv-scrap",
      skuCode: "SCRAP-PRONGKOL",
    });

    (ProductionCostService.calculateBatchCOGM as any).mockResolvedValue(500);

    (AccountingService.recordInventoryMovement as any).mockResolvedValue(
      undefined,
    );
  });

  describe("State Transitions", () => {
    it("should change order status to IN_PROGRESS on startExecution", async () => {
      await ProductionService.startExecution({
        productionOrderId: "po-1",
        machineId: "mach-1",
        operatorId: "op-1",
        shiftId: "shift-1",
      });

      expect(prisma.productionExecution.create).toHaveBeenCalled();
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { status: "IN_PROGRESS" },
      });
    });

    it("should change order status to COMPLETED on stopExecution with completed=true", async () => {
      await ProductionService.stopExecution({
        executionId: "exec-1",
        quantityProduced: 20,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        completed: true,
        notes: "Finished early",
      });

      // Find the update call that sets status to COMPLETED
      const completionCall = (
        prisma.productionOrder.update as any
      ).mock.calls.find(
        (call: any[]) =>
          call[0].where.id === "po-1" && call[0].data.status === "COMPLETED",
      );
      expect(completionCall).toBeDefined();

      // Find the update call that sets actualQuantity (from processOutputAndBackflush)
      const quantityCall = (
        prisma.productionOrder.update as any
      ).mock.calls.find(
        (call: any[]) =>
          call[0].where.id === "po-1" &&
          call[0].data.actualQuantity !== undefined,
      );
      expect(quantityCall).toBeDefined();
      expect(quantityCall[0].data.actualQuantity).toBe(20);
    });
  });

  describe("Backflush Material Consumption", () => {
    it("should automatically deduct materials proportionally based on BOM when output is added", async () => {
      await ProductionService.addProductionOutput({
        productionOrderId: "po-1",
        machineId: "mach-1",
        operatorId: "op-1",
        shiftId: "shift-1",
        cekGram: undefined,
        quantityProduced: 10,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        startTime: new Date(),
        endTime: new Date(),
        notes: "Partial batch testing",
      });

      // For an output of 10, ratio = 10 / 100 = 0.1
      // BOM Item 1 quantity = 50 -> 50 * 0.1 = 5

      expect(InventoryCoreService.deductStock as any).toHaveBeenCalledWith(
        expect.anything(),
        "loc-1",
        "pv-mat1",
        5,
      );

      // Should create stock movement IN for FG

      const stockMovementCalls = (prisma.stockMovement.create as any).mock
        .calls;

      const fgMovementIn = stockMovementCalls.find(
        (call: any[]) =>
          call[0].data.productVariantId === "pv-fg" &&
          call[0].data.type === "IN",
      );

      expect(fgMovementIn).toBeDefined();
      expect(fgMovementIn[0].data.quantity).toBe(10);

      // Should record account movements
      expect(AccountingService.recordInventoryMovement).toHaveBeenCalled();
    });
  });

  describe("Scrap Recording & GL Impact", () => {
    it("should automatically record scrap details and adjust inventory when scrap components are logged", async () => {
      await ProductionService.addProductionOutput({
        productionOrderId: "po-1",
        machineId: "mach-1",
        operatorId: "op-1",
        shiftId: "shift-1",
        cekGram: undefined,
        quantityProduced: 10,
        scrapQuantity: 5,
        scrapProngkolQty: 2,
        scrapDaunQty: 3,
        startTime: new Date(),
        endTime: new Date(),
        notes: "",
      });

      // Scrap consumes materials too. Total consumed = 10 (produced) + 5 (scrap) + 2 (prongkol) + 3 (daun) = 20
      // Ratio = 20 / 100 = 0.2
      // BOM Item 1 quantity = 50 -> 50 * 0.2 = 10

      expect(InventoryCoreService.deductStock as any).toHaveBeenCalledWith(
        expect.anything(),
        "loc-1",
        "pv-mat1",
        10,
      );

      // Expect scrapRecord to be created since prongkol and daun qty is > 0
      expect(prisma.scrapRecord.create).toHaveBeenCalled();

      const scrapCalls = (prisma.scrapRecord.create as any).mock.calls;
      expect(scrapCalls).toHaveLength(2); // One for prongkol, one for daun

      // Make sure the system recorded stock movement for scrap IN

      const smCalls = (prisma.stockMovement.create as any).mock.calls;

      const scrapMovementCreated = smCalls.find((c: any) =>
        c[0].data.reference?.includes("Production Scrap"),
      );
      expect(scrapMovementCreated).toBeDefined();
    });
  });

  describe("Production Output UOM Conversion", () => {
    it("should correctly convert PACK to KG when alternate unit is provided", async () => {
      // Mock to simulate PACKING category order with conversion

      (prisma.productionOrder.findUniqueOrThrow as any).mockResolvedValueOnce({
        id: "po-2",
        status: "IN_PROGRESS",
        plannedQuantity: 1000,
        actualQuantity: 0,
        locationId: "loc-2",
        orderNumber: "WO-002",
        bom: {
          productVariantId: "pv-pack",
          outputQuantity: 100,
          category: "PACKING",
          items: [{ productVariantId: "pv-mat1", quantity: 50 }],
        },
        plannedMaterials: [],
      });

      // Mock update response

      (prisma.productionOrder.update as any).mockResolvedValueOnce({
        id: "po-2",
        orderNumber: "WO-002",
        status: "IN_PROGRESS",
        locationId: "loc-2",
        bom: {
          productVariantId: "pv-pack",
          outputQuantity: 100,
          category: "PACKING",
          items: [{ productVariantId: "pv-mat1", quantity: 50 }],
        },
        plannedMaterials: [],
      });

      await ProductionService.addProductionOutput({
        productionOrderId: "po-2",
        machineId: "mach-1",
        operatorId: "op-1",
        shiftId: "shift-1",
        cekGram: undefined,
        quantityProduced: 25, // base qty: 100 PACK * 0.25 = 25 KG
        enteredQuantity: 100, // 100 PACK entered by operator
        enteredUnit: "PACK" as any,
        baseQuantityProduced: 25,
        conversionFactorSnapshot: 0.25,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        startTime: new Date(),
        endTime: new Date(),
        notes: "PACK conversion test",
      });

      // Stock movement should receive base quantity 25, not 100

      const stockMovementCalls = (prisma.stockMovement.create as any).mock
        .calls;
      const fgMovementIn = stockMovementCalls.find(
        (call: any[]) =>
          call[0].data.productVariantId === "pv-pack" &&
          call[0].data.type === "IN",
      );
      expect(fgMovementIn).toBeDefined();
      expect(fgMovementIn[0].data.quantity).toBe(25);

      // Backflush should use base quantity (25)

      expect(InventoryCoreService.deductStock as any).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.any(String),
        12.5, // 25 * (50/100)
      );

      // Execution should include entered fields

      const executionCreateCall = (prisma.productionExecution.create as any)
        .mock.calls[0];
      expect(executionCreateCall[0].data.enteredQuantity).toBe(100);
      expect(executionCreateCall[0].data.enteredUnit).toBe("PACK");
      expect(Number(executionCreateCall[0].data.conversionFactorSnapshot)).toBe(
        0.25,
      );
    });

    it("should reject invalid unit mismatch", async () => {
      // Mock to simulate variant with primaryUnit=KG, salesUnit=PACK

      (prisma.productionOrder.findUnique as any).mockResolvedValueOnce({
        bom: {
          productVariant: {
            primaryUnit: "KG",
            salesUnit: "PACK",
            conversionFactor: { toNumber: () => 0.25 },
          },
        },
      });

      await expect(
        ProductionService.addProductionOutput({
          productionOrderId: "po-1",
          machineId: "mach-1",
          operatorId: "op-1",
          shiftId: "shift-1",
          cekGram: undefined,
          quantityProduced: 25,
          enteredQuantity: 100,
          enteredUnit: "ROLL" as any,
          baseQuantityProduced: 25,
          conversionFactorSnapshot: 0.25,
          scrapQuantity: 0,
          scrapProngkolQty: 0,
          scrapDaunQty: 0,
          startTime: new Date(),
          endTime: new Date(),
          notes: "Invalid unit test",
        }),
      ).rejects.toThrow(/not valid for this product/);
    });
  });
});
