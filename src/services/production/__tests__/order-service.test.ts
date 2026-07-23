/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductionOrderService } from "../order-service";
import { prisma } from "@/lib/core/prisma";
import {
  ProductionStatus,
  BomCategory,
  MachineType,
  SalesOrderType,
} from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    bom: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    machine: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
    },
    workShift: {
      findMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    customer: {
      findMany: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    productionMaterial: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    productionShift: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    stockMovement: {
      updateMany: vi.fn(),
    },
    materialIssue: {
      deleteMany: vi.fn(),
    },
    scrapRecord: {
      deleteMany: vi.fn(),
    },
    qualityInspection: {
      deleteMany: vi.fn(),
    },
    salesOrder: {
      findUnique: vi.fn(),
    },
    salesOrderItem: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  },
}));

vi.mock("../order-number-service", () => ({
  createProductionOrderWithGeneratedNumber: vi.fn(),
}));

/** Stub a Decimal-like object used by Prisma */
const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

/** Active BOM stub for createOrder (requires isActive after lifecycle change) */
const activeBom = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "bom-1",
    isActive: true,
    category: BomCategory.STANDARD,
    outputQuantity: dec(100),
    items: [],
    ...overrides,
  }) as any;

describe("ProductionOrderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getInitData", () => {
    it("should return init data with filtered operators and helpers", async () => {
      vi.mocked(prisma.bom.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.machine.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.location.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.employee.findMany).mockResolvedValue([
        { id: "e1", name: "Op1", role: "OPERATOR" },
        { id: "e2", name: "H1", role: "HELPER" },
        { id: "e3", name: "P1", role: "PACKER" },
      ] as any);
      vi.mocked(prisma.workShift.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([] as any);

      const result = await ProductionOrderService.getInitData();

      expect(result.operators).toHaveLength(1);
      expect(result.helpers).toHaveLength(2);
    });

    it("should return empty operators/helpers when no matching roles", async () => {
      vi.mocked(prisma.bom.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.machine.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.location.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.employee.findMany).mockResolvedValue([
        { id: "e1", name: "Mgr", role: "MANAGER" },
      ] as any);
      vi.mocked(prisma.workShift.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([] as any);

      const result = await ProductionOrderService.getInitData();
      expect(result.operators).toHaveLength(0);
      expect(result.helpers).toHaveLength(0);
    });

    it("should treat PACKER as helper", async () => {
      vi.mocked(prisma.bom.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.machine.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.location.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.employee.findMany).mockResolvedValue([
        { id: "e1", name: "Pack", role: "PACKER" },
      ] as any);
      vi.mocked(prisma.workShift.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([] as any);

      const result = await ProductionOrderService.getInitData();
      expect(result.helpers).toHaveLength(1);
      expect(result.helpers[0].role).toBe("PACKER");
    });
  });

  describe("getBomWithInventory", () => {
    it("should error on empty bomId", async () => {
      const r = await ProductionOrderService.getBomWithInventory(
        "",
        "loc-1",
        10,
      );
      expect(r.ok).toBe(false);
    });

    it("should error on zero quantity", async () => {
      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        0,
      );
      expect(r.ok).toBe(false);
    });

    it("should error on negative quantity", async () => {
      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        -5,
      );
      expect(r.ok).toBe(false);
    });

    it("should error when BOM tidak ditemukan", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(null);
      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        10,
      );
      expect(r.ok).toBe(false);
    });

    it("should calculate material requirements with source stock", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(200),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
          {
            productVariantId: "pv-2",
            quantity: dec(50),
            productVariant: { name: "B", primaryUnit: "L" },
          },
        ],
      } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(1000) },
        { productVariantId: "pv-2", quantity: dec(500) },
      ] as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        200,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.data[0].requiredQty).toBe(400);
        expect(r.value.data[0].currentStock).toBe(1000);
        expect(r.value.data[1].requiredQty).toBe(100);
        expect(r.value.data[1].currentStock).toBe(500);
        expect(r.value.meta.suggestedSourceLocationId).toBeNull();
      }
    });

    it("should suggest RM warehouse when source has no stock but RM does", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(100),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
        ],
      } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: "rm-loc",
        name: "RM WH",
      } as any);
      vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
        id: "inv-rm",
      } as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.meta.suggestedSourceLocationId).toBe("rm-loc");
        expect(r.value.meta.suggestedSourceLocationName).toBe("RM WH");
      }
    });

    it("should not suggest when RM has no stock", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(100),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
        ],
      } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: "rm-loc",
        name: "RM WH",
      } as any);
      vi.mocked(prisma.inventory.findFirst).mockResolvedValue(null);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.meta.suggestedSourceLocationId).toBeNull();
    });

    it("should not suggest when RM location same as source", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(100),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
        ],
      } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: "loc-1",
        name: "Same",
      } as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.meta.suggestedSourceLocationId).toBeNull();
    });

    it("should handle empty sourceLocationId", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(100),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
        ],
      } as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.data[0].currentStock).toBe(0);
    });

    it("should default currentStock to 0 when material missing from inventory", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [
          {
            productVariantId: "pv-1",
            quantity: dec(100),
            productVariant: { name: "A", primaryUnit: "kg" },
          },
          {
            productVariantId: "pv-missing",
            quantity: dec(50),
            productVariant: { name: "B", primaryUnit: "L" },
          },
        ],
      } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(200) },
      ] as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.data[0].currentStock).toBe(200);
        expect(r.value.data[1].currentStock).toBe(0);
      }
    });

    it("should handle BOM with no items", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({
        id: "bom-1",
        outputQuantity: dec(100),
        items: [],
      } as any);

      const r = await ProductionOrderService.getBomWithInventory(
        "bom-1",
        "loc-1",
        100,
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.data).toHaveLength(0);
    });
  });

  describe("createOrder", () => {
    const base = {
      bomId: "bom-1",
      plannedQuantity: 100,
      plannedStartDate: new Date("2025-01-01"),
      plannedEndDate: new Date("2025-01-02"),
      locationId: "loc-1",
    };

    it("should create with generated number", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1", orderNumber: "WO-1" } as any,
      );
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      await ProductionOrderService.createOrder({ ...base, userId: "u1" });
      expect(mod.createProductionOrderWithGeneratedNumber).toHaveBeenCalled();
    });

    it("should create with provided orderNumber", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
        orderNumber: "C-001",
      } as any);
      const r = await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "C-001",
      });
      expect(r.orderNumber).toBe("C-001");
    });

    it("should skip machine validation when no machineId", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
      });
      expect(prisma.machine.findUnique).not.toHaveBeenCalled();
    });

    it("should throw on incompatible machine-BOM", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.MIXER,
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(
        activeBom({ category: BomCategory.EXTRUSION }),
      );
      await expect(
        ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).rejects.toThrow("not compatible");
    });

    it("should allow MIXING+MIXER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.MIXER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.MIXING }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      const r = await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        machineId: "m-1",
      });
      expect(r).toBeDefined();
    });

    it("should allow EXTRUSION+EXTRUDER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow EXTRUSION+REWINDER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.REWINDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow PACKING+PACKER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.PACKER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.PACKING }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow PACKING+GRANULATOR", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.GRANULATOR,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.PACKING }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow REWORK+any machine", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.MIXER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.REWORK }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow STANDARD+EXTRUDER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.STANDARD }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should allow STANDARD+MIXER", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.MIXER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.STANDARD }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should throw when BOM tidak ditemukan", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(null);
      await expect(
        ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).rejects.toThrow("Resep");
    });

    it("should throw when BOM is inactive", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(
        activeBom({ isActive: false }),
      );
      await expect(
        ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
        }),
      ).rejects.toThrow("nonaktif");
    });

    it("should skip machine validation when machine tidak ditemukan", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      expect(
        await ProductionOrderService.createOrder({
          ...base,
          orderNumber: "WO-1",
          machineId: "m-1",
        }),
      ).toBeDefined();
    });

    it("should calculate materials from BOM when items not provided", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(
        activeBom({
          outputQuantity: dec(100),
          items: [
            { productVariantId: "pv-1", quantity: dec(200) },
            { productVariantId: "pv-2", quantity: dec(50) },
          ],
        }),
      );
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(500) },
        { productVariantId: "pv-2", quantity: dec(200) },
      ] as any);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
      });
      expect(prisma.productionMaterial.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ productVariantId: "pv-1", quantity: 200 }),
          expect.objectContaining({ productVariantId: "pv-2", quantity: 50 }),
        ]),
      });
    });

    it("should use provided items instead of BOM items", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "c-pv", quantity: dec(1000) },
      ] as any);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        items: [{ productVariantId: "c-pv", quantity: 250 }],
      });
      expect(prisma.productionMaterial.createMany).toHaveBeenCalledWith({
        data: [
          {
            productionOrderId: "po-1",
            productVariantId: "c-pv",
            quantity: 250,
          },
        ],
      });
    });

    it("should set WAITING_MATERIAL when stock insufficient", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(5) },
      ] as any);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", status: a.data.status }) as any,
      );
      const r = await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        items: [{ productVariantId: "pv-1", quantity: 100 }],
      });
      expect(r.status).toBe(ProductionStatus.WAITING_MATERIAL);
    });

    it("should keep DRAFT when stock sufficient", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(1000) },
      ] as any);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", status: a.data.status }) as any,
      );
      const r = await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        items: [{ productVariantId: "pv-1", quantity: 100 }],
      });
      expect(r.status).toBe(ProductionStatus.DRAFT);
    });

    it("should keep DRAFT when materials empty", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", status: a.data.status }) as any,
      );
      const r = await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
      });
      expect(r.status).toBe(ProductionStatus.DRAFT);
    });

    it("should connect salesOrder and machine", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", ...a.data }) as any,
      );
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        salesOrderId: "so-1",
        machineId: "m-1",
      });
      expect(prisma.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesOrder: { connect: { id: "so-1" } },
          machine: { connect: { id: "m-1" } },
        }),
      });
    });

    it("should connect maklonCustomer when isMaklon", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", ...a.data }) as any,
      );
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
        isMaklon: true,
        maklonCustomerId: "c-m",
      });
      expect(prisma.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isMaklon: true,
          maklonCustomer: { connect: { id: "c-m" } },
        }),
      });
    });

    it("should not connect salesOrder when not provided", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockImplementation(
        async (a: any) => ({ id: "po-1", ...a.data }) as any,
      );
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
      });
      expect(prisma.productionOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ salesOrder: undefined }),
      });
    });

    it("should not create materials when BOM has no items", async () => {
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom({ items: [] }));
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(prisma.productionOrder.create).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.createOrder({
        ...base,
        orderNumber: "WO-1",
      });
      expect(prisma.productionMaterial.createMany).not.toHaveBeenCalled();
    });

    it("should not connect createdBy when userId absent", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      await ProductionOrderService.createOrder({ ...base });
      expect(mod.createProductionOrderWithGeneratedNumber).toHaveBeenCalled();
    });

    it("should include plannedEntered fields", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      await ProductionOrderService.createOrder({
        ...base,
        plannedEnteredQuantity: 500,
        plannedEnteredUnit: "kg",
        plannedConversionFactorSnapshot: 2.5,
      });
      expect(mod.createProductionOrderWithGeneratedNumber).toHaveBeenCalled();
    });
  });

  describe("createOrderFromSales", () => {
    it("should throw on empty salesOrderId", async () => {
      await expect(
        ProductionOrderService.createOrderFromSales("", "pv-1", 100),
      ).rejects.toThrow(/Parameter tidak valid/i);
    });

    it("should throw on empty productVariantId", async () => {
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "", 100),
      ).rejects.toThrow(/Parameter tidak valid/i);
    });

    it("should throw on zero quantity", async () => {
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "pv-1", 0),
      ).rejects.toThrow(/Parameter tidak valid/i);
    });

    it("should throw on negative quantity", async () => {
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "pv-1", -10),
      ).rejects.toThrow(/Parameter tidak valid/i);
    });

    it("should throw when no default BOM", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "pv-1", 100),
      ).rejects.toThrow("No default BOM found");
    });

    it("should throw when SO tidak ditemukan", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "pv-1", 100),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("should create from standard SO", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "l-1",
        expectedDate: new Date(),
        orderType: "STANDARD",
        customerId: "c-1",
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      const r = await ProductionOrderService.createOrderFromSales(
        "so-1",
        "pv-1",
        50,
      );
      expect(r).toBeDefined();
    });

    it("should create maklon order from MAKLON_JASA SO", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "l-1",
        expectedDate: new Date(),
        orderType: SalesOrderType.MAKLON_JASA,
        customerId: "c-m",
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      const r = await ProductionOrderService.createOrderFromSales(
        "so-m",
        "pv-1",
        75,
      );
      expect(r).toBeDefined();
    });

    it("should handle null expectedDate", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "l-1",
        expectedDate: null,
        orderType: "STANDARD",
        customerId: "c-1",
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      expect(
        await ProductionOrderService.createOrderFromSales("so-1", "pv-1", 100),
      ).toBeDefined();
    });

    it("should throw when sourceLocationId is null", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: null,
        expectedDate: new Date(),
        orderType: "STANDARD",
        customerId: "c-1",
      } as any);
      await expect(
        ProductionOrderService.createOrderFromSales("so-1", "pv-1", 100),
      ).rejects.toThrow("does not have a source location");
    });

    it("should handle maklon with null customerId", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "b-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "l-1",
        expectedDate: new Date(),
        orderType: SalesOrderType.MAKLON_JASA,
        customerId: null,
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-1" } as any,
      );
      expect(
        await ProductionOrderService.createOrderFromSales("so-1", "pv-1", 100),
      ).toBeDefined();
    });
  });

  describe("quickCreateOrder", () => {
    const qd = {
      bomId: "bom-1",
      plannedQuantity: 100,
      machineId: "mach-1",
      locationId: "loc-1",
    };

    it("should throw on empty bomId", async () => {
      await expect(
        ProductionOrderService.quickCreateOrder({ ...qd, bomId: "" }),
      ).rejects.toThrow("BOM, quantity, machine, and location are required");
    });

    it("should throw on zero quantity", async () => {
      await expect(
        ProductionOrderService.quickCreateOrder({ ...qd, plannedQuantity: 0 }),
      ).rejects.toThrow("BOM, quantity, machine, and location are required");
    });

    it("should throw on empty machineId", async () => {
      await expect(
        ProductionOrderService.quickCreateOrder({ ...qd, machineId: "" }),
      ).rejects.toThrow("BOM, quantity, machine, and location are required");
    });

    it("should throw on empty locationId", async () => {
      await expect(
        ProductionOrderService.quickCreateOrder({ ...qd, locationId: "" }),
      ).rejects.toThrow("BOM, quantity, machine, and location are required");
    });

    it("should throw on incompatible machine", async () => {
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.PACKER,
      } as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(
        activeBom({ category: BomCategory.EXTRUSION }),
      );
      await expect(ProductionOrderService.quickCreateOrder(qd)).rejects.toThrow(
        "not compatible",
      );
    });

    it("should create and auto-release when DRAFT", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        {
          id: "po-q",
          orderNumber: "WO-Q",
          status: ProductionStatus.DRAFT,
        } as any,
      );
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({} as any);
      const r = await ProductionOrderService.quickCreateOrder(qd);
      expect(r).toBeDefined();
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-q" },
        data: { status: ProductionStatus.RELEASED },
      });
    });

    it("should not auto-release when WAITING_MATERIAL", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce({
          id: "bom-1",
          outputQuantity: dec(100),
          items: [{ productVariantId: "pv-1", quantity: dec(100) }],
        } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([
        { productVariantId: "pv-1", quantity: dec(1) },
      ] as any);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-q", status: ProductionStatus.WAITING_MATERIAL } as any,
      );
      const r = await ProductionOrderService.quickCreateOrder(qd);
      expect(r.status).toBe(ProductionStatus.WAITING_MATERIAL);
      expect(prisma.productionOrder.update).not.toHaveBeenCalled();
    });

    it("should use default notes", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-q", status: ProductionStatus.DRAFT } as any,
      );
      expect(await ProductionOrderService.quickCreateOrder(qd)).toBeDefined();
    });

    it("should use custom notes", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-q", status: ProductionStatus.DRAFT } as any,
      );
      expect(
        await ProductionOrderService.quickCreateOrder({
          ...qd,
          notes: "Custom",
        }),
      ).toBeDefined();
    });

    it("should pass userId", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue({
        type: MachineType.EXTRUDER,
      } as any);
      vi.mocked(prisma.bom.findUnique)
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(activeBom({ category: BomCategory.EXTRUSION }))
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-q", status: ProductionStatus.DRAFT } as any,
      );
      const r = await ProductionOrderService.quickCreateOrder({
        ...qd,
        userId: "u-abc",
      });
      expect(r).toBeDefined();
    });

    it("should skip machine validation when machine tidak ditemukan", async () => {
      const mod = await import("../order-number-service");
      vi.mocked(prisma.machine.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue(activeBom());
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      vi.mocked(mod.createProductionOrderWithGeneratedNumber).mockResolvedValue(
        { id: "po-q", status: ProductionStatus.DRAFT } as any,
      );
      expect(await ProductionOrderService.quickCreateOrder(qd)).toBeDefined();
    });
  });

  describe("updateOrder", () => {
    it("should update status and quantities", async () => {
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({
        id: "po-1",
        status: ProductionStatus.IN_PROGRESS,
        actualQuantity: 100,
      } as any);
      const r = await ProductionOrderService.updateOrder({
        id: "po-1",
        status: ProductionStatus.IN_PROGRESS,
        actualQuantity: 100,
      });
      expect(r).toEqual({
        id: "po-1",
        status: ProductionStatus.IN_PROGRESS,
        actualQuantity: 100,
      });
    });

    it("should update dates", async () => {
      const s = new Date("2025-01-01T08:00:00Z");
      const e = new Date("2025-01-01T16:00:00Z");
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.updateOrder({
        id: "po-1",
        actualStartDate: s,
        actualEndDate: e,
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: {
          status: undefined,
          actualQuantity: undefined,
          actualStartDate: s,
          actualEndDate: e,
          machineId: undefined,
          plannedStartDate: undefined,
        },
      });
    });

    it("should update machineId", async () => {
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.updateOrder({
        id: "po-1",
        machineId: "m-2",
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: expect.objectContaining({ machineId: "m-2" }),
      });
    });

    it("should update machineId and plannedStartDate together", async () => {
      const p = new Date("2026-07-15T00:00:00Z");
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.updateOrder({
        id: "po-1",
        machineId: "m-3",
        plannedStartDate: p,
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: expect.objectContaining({
          machineId: "m-3",
          plannedStartDate: p,
        }),
      });
    });

    it("should update plannedStartDate only (reschedule scenario)", async () => {
      const p = new Date("2026-07-16T00:00:00Z");
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({
        id: "po-1",
      } as any);
      await ProductionOrderService.updateOrder({
        id: "po-1",
        plannedStartDate: p,
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: expect.objectContaining({
          plannedStartDate: p,
        }),
      });
    });
  });

  describe("deleteOrder", () => {
    it("should delete draft and clean up relations", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        status: "DRAFT",
      } as any);
      await ProductionOrderService.deleteOrder("po-1");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.stockMovement.updateMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
        data: { productionOrderId: null },
      });
      expect(prisma.materialIssue.deleteMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
      });
      expect(prisma.scrapRecord.deleteMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
      });
      expect(prisma.qualityInspection.deleteMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
      });
      expect(prisma.productionShift.deleteMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
      });
      expect(prisma.productionMaterial.deleteMany).toHaveBeenCalledWith({
        where: { productionOrderId: "po-1" },
      });
      expect(prisma.productionOrder.delete).toHaveBeenCalledWith({
        where: { id: "po-1" },
      });
    });

    it("should delete WAITING_MATERIAL order", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        status: "WAITING_MATERIAL",
      } as any);
      await ProductionOrderService.deleteOrder("po-2");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should throw when tidak ditemukan", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null);
      await expect(ProductionOrderService.deleteOrder("x")).rejects.toThrow(
        /tidak ditemukan/i,
      );
    });

    it("should throw for IN_PROGRESS", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        status: "IN_PROGRESS",
      } as any);
      await expect(ProductionOrderService.deleteOrder("po-1")).rejects.toThrow(
        "DRAFT or WAITING_MATERIAL",
      );
    });

    it("should throw for COMPLETED", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        status: "COMPLETED",
      } as any);
      await expect(ProductionOrderService.deleteOrder("po-1")).rejects.toThrow(
        "DRAFT or WAITING_MATERIAL",
      );
    });

    it("should throw for RELEASED", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        status: "RELEASED",
      } as any);
      await expect(ProductionOrderService.deleteOrder("po-1")).rejects.toThrow(
        "DRAFT or WAITING_MATERIAL",
      );
    });
  });

  describe("addShift", () => {
    it("should add shift with all options", async () => {
      vi.mocked(prisma.productionShift.create).mockResolvedValue({} as any);
      await ProductionOrderService.addShift({
        productionOrderId: "po-1",
        shiftName: "Morning",
        startTime: new Date("2025-01-01T06:00:00Z"),
        endTime: new Date("2025-01-01T14:00:00Z"),
        operatorId: "e-1",
        helperIds: ["e-2", "e-3"],
        machineId: "m-1",
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.productionShift.create).toHaveBeenCalledWith({
        data: {
          productionOrderId: "po-1",
          shiftName: "Morning",
          startTime: new Date("2025-01-01T06:00:00Z"),
          endTime: new Date("2025-01-01T14:00:00Z"),
          operatorId: "e-1",
          helpers: { connect: [{ id: "e-2" }, { id: "e-3" }] },
        },
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { machineId: "m-1" },
      });
    });

    it("should add shift without operator/helpers/machine", async () => {
      vi.mocked(prisma.productionShift.create).mockResolvedValue({} as any);
      await ProductionOrderService.addShift({
        productionOrderId: "po-1",
        shiftName: "Night",
        startTime: new Date(),
        endTime: new Date(),
      });
      expect(prisma.productionShift.create).toHaveBeenCalledWith({
        data: {
          productionOrderId: "po-1",
          shiftName: "Night",
          startTime: expect.any(Date),
          endTime: expect.any(Date),
          operatorId: undefined,
          helpers: undefined,
        },
      });
      expect(prisma.productionOrder.update).not.toHaveBeenCalled();
    });

    it("should update machine when machineId provided", async () => {
      vi.mocked(prisma.productionShift.create).mockResolvedValue({} as any);
      vi.mocked(prisma.productionOrder.update).mockResolvedValue({} as any);
      await ProductionOrderService.addShift({
        productionOrderId: "po-1",
        shiftName: "A",
        startTime: new Date(),
        endTime: new Date(),
        machineId: "m-2",
      });
      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { machineId: "m-2" },
      });
    });
  });

  describe("deleteShift", () => {
    it("should delete shift by id", async () => {
      vi.mocked(prisma.productionShift.delete).mockResolvedValue({} as any);
      await ProductionOrderService.deleteShift("s-1");
      expect(prisma.productionShift.delete).toHaveBeenCalledWith({
        where: { id: "s-1" },
      });
    });
  });

  describe("splitOrdersFromSales", () => {
    const splitData = {
      salesOrderId: "so-1",
      productVariantId: "pv-1",
      batches: [
        { plannedQuantity: 5, plannedStartDate: new Date("2026-07-20") },
        { plannedQuantity: 10, plannedStartDate: new Date("2026-07-21") },
      ],
    };

    it("should throw if default BOM is missing", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue(null);
      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow("No default BOM found");
    });

    it("should throw if Sales Order is missing", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow(/so-1/);
    });

    it("should throw if Sales Order has no sourceLocationId", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: null,
        expectedDate: new Date(),
        orderType: "MAKE_TO_STOCK",
      } as any);

      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow("does not have a source location");
    });

    it("should throw if Sales Order Item is missing", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "loc-1",
        expectedDate: new Date(),
        orderType: "MAKE_TO_STOCK",
      } as any);
      vi.mocked(prisma.salesOrderItem.findFirst).mockResolvedValue(null);

      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow(/so-1/);
    });

    it("should throw if sum of batch quantities exceeds remaining demand", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "loc-1",
        expectedDate: new Date(),
        orderType: "MAKE_TO_STOCK",
      } as any);
      // remaining = 12 - 0 delivered - 2 planned = 10; batches sum = 15 → reject
      vi.mocked(prisma.salesOrderItem.findFirst).mockResolvedValue({
        quantity: dec(12),
        deliveredQty: dec(0),
      } as any);
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
        { plannedQuantity: dec(2) },
      ] as any);

      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow("exceeds the remaining demand to produce");
    });

    it("should throw if remaining demand is reduced by deliveredQty", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "loc-1",
        expectedDate: new Date(),
        orderType: "MAKE_TO_STOCK",
      } as any);
      // remaining = 20 - 10 delivered - 0 planned = 10; batches sum = 15 → reject
      vi.mocked(prisma.salesOrderItem.findFirst).mockResolvedValue({
        quantity: dec(20),
        deliveredQty: dec(10),
      } as any);
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as any);

      await expect(
        ProductionOrderService.splitOrdersFromSales(splitData),
      ).rejects.toThrow("exceeds the remaining demand to produce");
    });

    it("should create sibling POs when validations pass", async () => {
      vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: "bom-1", isActive: true, category: "EXTRUSION" } as any);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        sourceLocationId: "loc-1",
        expectedDate: new Date(),
        orderType: "MAKE_TO_STOCK",
      } as any);
      vi.mocked(prisma.salesOrderItem.findFirst).mockResolvedValue({
        quantity: dec(20),
        deliveredQty: dec(0),
      } as any);
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.bom.findUnique).mockResolvedValue({ id: "bom-1", isActive: true, category: "EXTRUSION" } as any);
      vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
      
      const createOrderSpy = vi.spyOn(ProductionOrderService, "createOrder").mockResolvedValue({ id: "created-po" } as any);

      const res = await ProductionOrderService.splitOrdersFromSales(splitData);
      expect(res).toHaveLength(2);
      expect(createOrderSpy).toHaveBeenCalledTimes(2);
      expect(createOrderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          salesOrderId: "so-1",
          locationId: "loc-1",
          plannedQuantity: 5,
        }),
        expect.anything(),
      );

      createOrderSpy.mockRestore();
    });
  });
});
