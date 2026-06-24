import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared before imports
const mockCreateJournalEntry = vi.fn().mockResolvedValue({ id: "je-1" });
const mockUpdateStandardCost = vi.fn().mockResolvedValue(undefined);
const mockResolveAccountCode = vi.fn();

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    goodsReceipt: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    productionOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    salesOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    inventory: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { quantity: { toNumber: () => 0 } } }),
    },
    account: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    journalLine: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          debit: { toNumber: () => 999999 },
          credit: { toNumber: () => 0 },
        },
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
    ),
  },
}));

vi.mock("@/services/accounting/journals-service", () => ({
  createJournalEntry: (...args: unknown[]) => mockCreateJournalEntry(...args),
}));

vi.mock("@/actions/finance/cost-history", () => ({
  updateStandardCost: (...args: unknown[]) => mockUpdateStandardCost(...args),
}));

vi.mock("@/lib/errors/errors", () => ({
  NotFoundError: class extends Error {
    constructor(entity: string, id: string) {
      super(`${entity} ${id} not found`);
      this.name = "NotFoundError";
    }
  },
  BusinessRuleError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BusinessRuleError";
    }
  },
}));

vi.mock("@/services/accounting/account-mapping-policy", () => ({
  resolveAccountCode: (...args: unknown[]) => mockResolveAccountCode(...args),
}));

import { prisma } from "@/lib/core/prisma";
import {
  recordInventoryMovement,
  recordMaklonCosts,
} from "@/services/accounting/inventory-link-service";

function dec(v: number) {
  return { toNumber: () => v, [Symbol.toPrimitive]: () => v };
}

const baseProduct = {
  productType: "RAW_MATERIAL",
  inventoryAccountId: "00000000-0000-0000-0000-000000000001",
  cogsAccountId: "00000000-0000-0000-0000-000000000002",
  wipAccountId: null,
};

const baseMovement = {
  id: "mov-1",
  type: "IN",
  productVariantId: "pv-1",
  quantity: dec(100),
  cost: dec(50),
  createdAt: new Date("2026-01-15"),
  reference: "REF-001",
  createdById: "user-1",
  goodsReceiptId: null,
  productionOrderId: null,
  salesOrderId: null,
  fromLocationId: null,
  toLocationId: "loc-1",
};

describe("inventory-link-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAccountCode.mockImplementation(
      (productType: string | null, ctx: string) => {
        const map: Record<string, string> = {
          inventory: "11100",
          "trade-payable": "21100",
          cogs: "51100",
          wip: "11400",
          "adjustment-gain": "41100",
          "adjustment-loss": "61100",
          "manufacturing-overhead": "61200",
          "accrued-liabilities": "21200",
        };
        return map[ctx] || "00000";
      },
    );
    // Mock account.findUnique to resolve account codes to UUIDs
    vi.mocked(prisma.account.findUnique).mockImplementation(
      async ({ where }: { where: { code?: string; id?: string } }) => {
        const code = where.code || where.id;
        return { id: `acc-${code}`, code, name: `Account ${code}` } as never;
      },
    );
  });

  // =========================================================================
  // recordInventoryMovement
  // =========================================================================
  describe("recordInventoryMovement", () => {
    it("returns early when productVariant not found", async () => {
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(null);

      await recordInventoryMovement(baseMovement as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("uses movement.productVariant when provided (skips DB fetch)", async () => {
      const mv = {
        ...baseMovement,
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(prisma.productVariant.findUnique).not.toHaveBeenCalled();
    });

    it("returns early when isMaklon via goodsReceipt", async () => {
      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue({
        id: "gr-1",
        isMaklon: true,
        purchaseOrder: { items: [] },
      } as never);

      const mv = {
        ...baseMovement,
        goodsReceiptId: "gr-1",
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("returns early when isMaklon via productionOrder", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        isMaklon: true,
      } as never);

      const mv = {
        ...baseMovement,
        productionOrderId: "po-1",
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("returns early when isMaklon via salesOrder MAKLON_JASA", async () => {
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
        orderType: "MAKLON_JASA",
      } as never);

      const mv = {
        ...baseMovement,
        salesOrderId: "so-1",
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("returns early when totalAmount is 0", async () => {
      const mv = {
        ...baseMovement,
        quantity: dec(0),
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("generates OUT without salesOrderId lines (WIP debit, inventory credit)", async () => {
      const mv = {
        ...baseMovement,
        type: "OUT",
        salesOrderId: null,
        productVariant: {
          name: "Material B",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      expect(call.lines).toHaveLength(2);
    });

    it("generates IN without goodsReceiptId lines (inventory debit, WIP credit)", async () => {
      const mv = {
        ...baseMovement,
        type: "IN",
        goodsReceiptId: null,
        productVariant: {
          name: "Output A",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      expect(call.lines).toHaveLength(2);
    });

    it("generates PURCHASE lines (inventory debit, trade-payable credit)", async () => {
      const mv = {
        ...baseMovement,
        type: "PURCHASE",
        productVariant: {
          name: "Material C",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      expect(call.lines).toHaveLength(2);
      expect(call.referenceType).toBe("GOODS_RECEIPT");
    });

    it("generates ADJUSTMENT IN lines (gain)", async () => {
      const mv = {
        ...baseMovement,
        type: "ADJUSTMENT",
        toLocationId: "loc-1",
        productVariant: {
          name: "Adj Item",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      expect(call.lines).toHaveLength(2);
      expect(call.referenceType).toBe("STOCK_ADJUSTMENT");
    });

    it("generates ADJUSTMENT OUT lines (loss)", async () => {
      const mv = {
        ...baseMovement,
        type: "ADJUSTMENT",
        toLocationId: null,
        productVariant: {
          name: "Adj Item",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      expect(call.lines).toHaveLength(2);
    });

    it("skips GL validation for PURCHASE type", async () => {
      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: {
          debit: { toNumber: () => 100 },
          credit: { toNumber: () => 200 },
        },
      } as never);

      const mv = {
        ...baseMovement,
        type: "PURCHASE",
        productVariant: {
          name: "Material C",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    });

    it("calls updateStandardCost for goodsReceipt with PO item", async () => {
      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue({
        id: "gr-1",
        isMaklon: false,
        purchaseOrder: {
          items: [{ unitPrice: dec(75) }],
        },
      } as never);
      vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
        _sum: { quantity: { toNumber: () => 200 } },
      } as never);

      const mv = {
        ...baseMovement,
        type: "IN",
        goodsReceiptId: "gr-1",
        productVariant: {
          name: "Material A",
          product: { ...baseProduct },
          standardCost: dec(50),
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockUpdateStandardCost).toHaveBeenCalled();
    });

    it("falls back to receiptPrice when no current stock", async () => {
      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue({
        id: "gr-2",
        isMaklon: false,
        purchaseOrder: {
          items: [{ unitPrice: dec(80) }],
        },
      } as never);
      vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
        _sum: { quantity: null },
      } as never);

      const mv = {
        ...baseMovement,
        type: "IN",
        goodsReceiptId: "gr-2",
        productVariant: {
          name: "Material B",
          product: { ...baseProduct },
          standardCost: dec(0),
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockUpdateStandardCost).toHaveBeenCalled();
    });

    it("does not call updateStandardCost when no PO items", async () => {
      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue({
        id: "gr-3",
        isMaklon: false,
        purchaseOrder: { items: [] },
      } as never);

      const mv = {
        ...baseMovement,
        type: "IN",
        goodsReceiptId: "gr-3",
        productVariant: {
          name: "Material C",
          product: { ...baseProduct },
        },
      };

      await recordInventoryMovement(mv as never);

      expect(mockUpdateStandardCost).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // recordMaklonCosts
  // =========================================================================
  describe("recordMaklonCosts", () => {
    it("returns early when order not found", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null);

      await recordMaklonCosts("po-1", prisma as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("returns early when not maklon order", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-1",
        isMaklon: false,
        maklonCostItems: [],
      } as never);

      await recordMaklonCosts("po-1", prisma as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("returns early when no cost items", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-1",
        isMaklon: true,
        maklonCostItems: [],
      } as never);

      await recordMaklonCosts("po-1", prisma as never);

      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it("creates journal entry for ADDITIVE and LABOR cost items", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-1",
        orderNumber: "MO-001",
        actualEndDate: new Date("2026-01-15"),
        createdById: "user-1",
        isMaklon: true,
        maklonCostItems: [
          {
            id: "c1",
            costType: "ADDITIVE",
            amount: dec(500),
            description: "Additive A",
          },
          {
            id: "c2",
            costType: "LABOR",
            amount: dec(300),
            description: "Labor cost",
          },
          { id: "c3", costType: "OVERHEAD", amount: dec(200), description: "" },
          {
            id: "c4",
            costType: "MACHINE",
            amount: dec(0),
            description: "Zero",
          },
        ],
      } as never);

      await recordMaklonCosts("po-1", prisma as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
      const call = mockCreateJournalEntry.mock.calls[0][0];
      // ADDITIVE: 2 lines, LABOR: 2 lines, OVERHEAD: 2 lines, MACHINE: skipped (0)
      expect(call.lines).toHaveLength(6);
    });

    it("uses actualEndDate or current date for entryDate", async () => {
      vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
        id: "po-3",
        orderNumber: "MO-003",
        actualEndDate: null,
        createdById: "user-1",
        isMaklon: true,
        maklonCostItems: [
          {
            id: "c1",
            costType: "ADDITIVE",
            amount: dec(100),
            description: "Test",
          },
        ],
      } as never);

      await recordMaklonCosts("po-3", prisma as never);

      expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
    });
  });
});
