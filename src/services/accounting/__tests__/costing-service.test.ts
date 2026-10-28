import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    productionOrder: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    journalLine: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/settings/conversion-cost-setting-service", () => ({
  readConversionCostSetting: vi.fn(async () => ({ enabled: false, accountIds: [] })),
}));

import { prisma } from "@/lib/core/prisma";
import { CostingService } from "@/services/accounting/costing-service";
import { nonClosingJournalFilter } from "@/services/accounting/closing-reference-filter";
import { readConversionCostSetting } from "@/services/settings/conversion-cost-setting-service";

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
    it("throws when order tidak ditemukan", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null);

      await expect(
        CostingService.calculateOrderCost("nonexistent"),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("excludes STAGED material issues from material cost (transfer not yet consumed)", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-1",
        orderNumber: "MO-001",
        actualQuantity: 100,
        materialIssues: [
          {
            id: "issue-staged",
            status: "STAGED",
            quantity: dec(10),
            issuedAt: new Date("2026-01-15T10:00:00Z"),
            productVariantId: "pv-1",
            batchId: null,
            locationId: "loc-wip",
            productVariant: {
              standardCost: dec(50),
              buyPrice: dec(60),
              price: dec(70),
            },
          },
        ],
        stockMovements: [],
        executions: [],
      } as never);

      const result = await CostingService.calculateOrderCost("po-1");
      expect(result.materialCost).toBe(0);
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
            operator: { dailyRate: dec(400), standardDayHours: dec(8) },
          },
        ],
      } as never);

      const result = await CostingService.calculateOrderCost("po-5");

      expect(result.machineCost).toBe(200); // 2 hours * 100
      expect(result.laborCost).toBe(100); // (2/8 day) * 400 daily rate
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
            operator: { dailyRate: dec(400), standardDayHours: dec(8) },
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

    it("does not accrue cost for an open shell on a completed order", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-9",
        orderNumber: "MO-009",
        status: "COMPLETED",
        actualQuantity: 10,
        materialIssues: [],
        stockMovements: [],
        executions: [
          {
            id: "exec-stale-shell",
            status: "COMPLETED",
            startTime: new Date("2026-07-20T03:00:00Z"),
            endTime: null,
            machine: { costPerHour: dec(100) },
            operator: { dailyRate: dec(400), standardDayHours: dec(8) },
          },
        ],
      } as never);

      const result = await CostingService.calculateOrderCost("po-9");

      expect(result.machineCost).toBe(0);
      expect(result.laborCost).toBe(0);
    });

    it("accrues an open session on an in-progress order up to now", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-28T10:00:00Z") });
      try {
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
          id: "po-10",
          orderNumber: "MO-010",
          status: "IN_PROGRESS",
          actualQuantity: 10,
          materialIssues: [],
          stockMovements: [],
          executions: [
            {
              id: "exec-running",
              status: "COMPLETED",
              startTime: new Date("2026-10-28T08:00:00Z"),
              endTime: null,
              machine: { costPerHour: dec(100) },
              operator: { dailyRate: dec(400), standardDayHours: dec(8) },
            },
          ],
        } as never);

        const result = await CostingService.calculateOrderCost("po-10");

        expect(result.machineCost).toBe(200); // 2 hours * 100
        expect(result.laborCost).toBe(100); // (2/8 day) * 400 daily rate
      } finally {
        vi.useRealTimers();
      }
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

    it("places completed SPKs in the period they finished, running ones by activity", async () => {
      const start = new Date("2026-01-01");
      const end = new Date("2026-01-31");
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

      await CostingService.getPeriodCosts(start, end);

      const range = { gte: start, lte: end };
      expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { status: "IN_PROGRESS", updatedAt: range },
              { status: "COMPLETED", actualEndDate: range },
              // Completed before end dates were recorded: old selection until backfilled.
              { status: "COMPLETED", actualEndDate: null, updatedAt: range },
            ],
          },
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

  describe("getPeriodCostReport with journal conversion", () => {
    // Material = issue quantity x standard cost; one 2-hour session that would cost 100 labor.
    const spk = (id: string, status: string, materialQty: number) => ({
      id,
      orderNumber: id.toUpperCase(),
      status,
      actualQuantity: 10,
      materialIssues: [
        {
          id: `${id}-issue`,
          status: "COMPLETED",
          quantity: dec(materialQty),
          issuedAt: new Date("2026-10-05T10:00:00Z"),
          productVariantId: "pv",
          batchId: null,
          locationId: null,
          productVariant: { standardCost: dec(1000), buyPrice: null, price: null },
        },
      ],
      stockMovements: [],
      executions: [
        {
          id: `${id}-exec`,
          status: "COMPLETED",
          startTime: new Date("2026-10-05T08:00:00Z"),
          endTime: new Date("2026-10-05T10:00:00Z"),
          machine: { costPerHour: dec(0) },
          operator: { dailyRate: dec(400), standardDayHours: dec(8) },
        },
      ],
    });
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-10-31T23:59:59Z");

    function arrange(accountIds: string[]) {
      vi.mocked(readConversionCostSetting).mockResolvedValue({ enabled: true, accountIds });
      vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
        { id: "po-a" },
        { id: "po-b" },
        { id: "po-run" },
      ] as never);
      const orders = new Map([
        ["po-a", spk("po-a", "COMPLETED", 3)],
        ["po-b", spk("po-b", "COMPLETED", 1)],
        ["po-run", spk("po-run", "IN_PROGRESS", 2)],
      ]);
      vi.mocked(prisma.productionOrder.findUnique).mockImplementation(
        (async (args: { where: { id: string } }) => orders.get(args.where.id)) as never,
      );
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { accountId: "wage", debit: 300, credit: 0, account: { code: "5-012b", name: "Tenaga Kerja Langsung" } },
        { accountId: "power", debit: 100, credit: 0, account: { code: "5-031", name: "Pemakaian Listrik" } },
      ] as never);
    }

    it("drops session cost and splits the journal pool across completed SPKs by material", async () => {
      // Arrange
      arrange(["wage", "power"]);

      // Act
      const report = await CostingService.getPeriodCostReport(start, end);

      // Assert
      const byId = new Map(report.costs.map((c) => [c.productionOrderId, c]));
      expect(byId.get("po-a")).toMatchObject({ laborCost: 0, machineCost: 0, overheadCost: 300, totalCost: 3300, unitCost: 330 });
      expect(byId.get("po-b")).toMatchObject({ laborCost: 0, overheadCost: 100, totalCost: 1100 });
      expect(byId.get("po-run")).toMatchObject({ laborCost: 0, overheadCost: 0, totalCost: 2000 });
      expect(report.conversion).toEqual({
        enabled: true,
        pool: 400,
        allocated: 400,
        unallocated: 0,
        byAccount: [
          { accountId: "wage", code: "5-012b", name: "Tenaga Kerja Langsung", amount: 300 },
          { accountId: "power", code: "5-031", name: "Pemakaian Listrik", amount: 100 },
        ],
      });
      expect(prisma.journalLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { accountId: { in: ["wage", "power"] }, journalEntry: { status: "POSTED", entryDate: { gte: start, lte: end }, ...nonClosingJournalFilter() } },
      }));
    });

    it("with no account chosen carries neither session cost nor an allocation", async () => {
      arrange([]);

      const report = await CostingService.getPeriodCostReport(start, end);

      expect(report.costs.every((c) => c.laborCost === 0 && c.overheadCost === 0)).toBe(true);
      expect(report.conversion).toMatchObject({ enabled: true, pool: 0, allocated: 0, unallocated: 0 });
      expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
    });

    it("keeps session-based labor and reports no pool while the setting is off", async () => {
      arrange(["wage"]);
      vi.mocked(readConversionCostSetting).mockResolvedValue({ enabled: false, accountIds: [] });

      const report = await CostingService.getPeriodCostReport(start, end);

      expect(report.costs.find((c) => c.productionOrderId === "po-a")).toMatchObject({ laborCost: 100, overheadCost: 0, totalCost: 3100 });
      expect(report.conversion).toEqual({ enabled: false, pool: 0, allocated: 0, unallocated: 0, byAccount: [] });
      expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
    });
  });
});
