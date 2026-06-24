import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    productionOrder: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/core/prisma";
import { CostingService } from "@/services/accounting/costing-service";

/** Create a Prisma Decimal-like mock that works with Number() and .toNumber() */
function dec(value: number) {
  return {
    toNumber: () => value,
    [Symbol.toPrimitive]: () => value,
  };
}

describe("CostingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateOrderCost", () => {
    it("throws when order not found", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null);

      await expect(
        CostingService.calculateOrderCost("nonexistent"),
      ).rejects.toThrow("Production Order not found");
    });

    it("calculates cost with material issues matched to movements", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-1",
        orderNumber: "MO-001",
        actualQuantity: 100,
        materialIssues: [
          {
            id: "issue-1",
            status: "COMPLETED",
            quantity: dec(10),
            issuedAt: new Date("2026-01-15T10:00:00Z"),
            productVariantId: "pv-1",
            batchId: "batch-1",
            locationId: "loc-1",
            productVariant: {
              standardCost: dec(50),
              buyPrice: dec(60),
              price: dec(70),
            },
          },
        ],
        stockMovements: [
          {
            id: "mov-1",
            productVariantId: "pv-1",
            batchId: "batch-1",
            fromLocationId: "loc-1",
            quantity: dec(10),
            cost: dec(45),
            createdAt: new Date("2026-01-15T10:00:30Z"),
          },
        ],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-1");

      expect(result.materialCost).toBe(450); // 10 * 45
      expect(result.machineCost).toBe(0);
      expect(result.laborCost).toBe(0);
      expect(result.totalCost).toBe(450);
      expect(result.quantityProduced).toBe(100);
      expect(result.unitCost).toBe(4.5);
    });

    it("skips voided material issues", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-2",
        orderNumber: "MO-002",
        actualQuantity: 50,
        materialIssues: [
          {
            id: "issue-voided",
            status: "VOIDED",
            quantity: dec(10),
            issuedAt: new Date("2026-01-15T10:00:00Z"),
            productVariantId: "pv-1",
            batchId: null,
            locationId: null,
            productVariant: {
              standardCost: dec(50),
              buyPrice: null,
              price: null,
            },
          },
        ],
        stockMovements: [],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-2");

      expect(result.materialCost).toBe(0);
    });

    it("falls back to standardCost when no movement matched", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-3",
        orderNumber: "MO-003",
        actualQuantity: 20,
        materialIssues: [
          {
            id: "issue-2",
            status: "COMPLETED",
            quantity: dec(5),
            issuedAt: new Date("2026-01-15T10:00:00Z"),
            productVariantId: "pv-2",
            batchId: null,
            locationId: null,
            productVariant: {
              standardCost: dec(30),
              buyPrice: null,
              price: null,
            },
          },
        ],
        stockMovements: [],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-3");

      expect(result.materialCost).toBe(150); // 5 * 30
    });

    it("skips issue with missing productVariant", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-4",
        orderNumber: "MO-004",
        actualQuantity: 10,
        materialIssues: [
          {
            id: "issue-no-pv",
            status: "COMPLETED",
            quantity: dec(5),
            issuedAt: new Date("2026-01-15T10:00:00Z"),
            productVariantId: "pv-missing",
            batchId: null,
            locationId: null,
            productVariant: null,
          },
        ],
        stockMovements: [],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-4");

      expect(result.materialCost).toBe(0);
    });

    it("calculates machine and labor cost from executions", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-5",
        orderNumber: "MO-005",
        actualQuantity: 100,
        materialIssues: [],
        stockMovements: [],
        executions: [
          {
            id: "exec-1",
            status: "COMPLETED",
            startTime: new Date("2026-01-15T08:00:00Z"),
            endTime: new Date("2026-01-15T10:00:00Z"),
            machine: { costPerHour: dec(100) },
            operator: { hourlyRate: dec(50) },
          },
        ],
      } as never);

      const result = await CostingService.calculateOrderCost("po-5");

      expect(result.machineCost).toBe(200); // 2 hours * 100
      expect(result.laborCost).toBe(100); // 2 hours * 50
    });

    it("skips voided executions", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-6",
        orderNumber: "MO-006",
        actualQuantity: 100,
        materialIssues: [],
        stockMovements: [],
        executions: [
          {
            id: "exec-voided",
            status: "VOIDED",
            startTime: new Date("2026-01-15T08:00:00Z"),
            endTime: new Date("2026-01-15T10:00:00Z"),
            machine: { costPerHour: dec(100) },
            operator: { hourlyRate: dec(50) },
          },
        ],
      } as never);

      const result = await CostingService.calculateOrderCost("po-6");

      expect(result.machineCost).toBe(0);
      expect(result.laborCost).toBe(0);
    });

    it("handles missing endTime by using current time", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-7",
        orderNumber: "MO-007",
        actualQuantity: 10,
        materialIssues: [],
        stockMovements: [],
        executions: [
          {
            id: "exec-no-end",
            status: "COMPLETED",
            startTime: new Date(Date.now() - 3600000), // 1 hour ago
            endTime: null,
            machine: null,
            operator: null,
          },
        ],
      } as never);

      const result = await CostingService.calculateOrderCost("po-7");

      expect(result.quantityProduced).toBe(10);
    });

    it("returns zero unitCost when quantityProduced is 0", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-8",
        orderNumber: "MO-008",
        actualQuantity: null,
        materialIssues: [],
        stockMovements: [],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-8");

      expect(result.unitCost).toBe(0);
    });
  });

  describe("getPeriodCosts", () => {
    it("uses default dates when not provided", async () => {
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

      const result = await CostingService.getPeriodCosts();

      expect(result).toEqual([]);
      expect(prisma.productionOrder.findMany).toHaveBeenCalled();
    });

    it("filters orders by date range", async () => {
      const start = new Date("2026-01-01");
      const end = new Date("2026-01-31");
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

      await CostingService.getPeriodCosts(start, end);

      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { gte: start, lte: end },
          }),
        }),
      );
    });

    it("returns fulfilled results and skips rejected", async () => {
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
        { id: "po-1" },
        { id: "po-2" },
      ] as never);

      vi.mocked(prisma.productionOrder.findUnique)
        .mockResolvedValueOnce({
          id: "po-1",
          orderNumber: "MO-001",
          actualQuantity: 10,
          materialIssues: [],
          stockMovements: [],
          executions: [],
        } as never)
        .mockRejectedValueOnce(new Error("DB error"));

      const result = await CostingService.getPeriodCosts(
        new Date("2026-01-01"),
        new Date("2026-01-31"),
      );

      expect(result).toHaveLength(1);
      expect(result[0].orderNumber).toBe("MO-001");
    });
  });
});
