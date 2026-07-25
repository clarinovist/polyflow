/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { listFgDemandBoard } from "../fg-demand-service";
import { prisma } from "@/lib/core/prisma";
import { ProductType } from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrderItem: {
      findMany: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
    },
  },
}));

const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

describe("listFgDemandBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty when no open SO items exist", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toEqual([]);
  });

  it("should aggregate residual across multiple SO items for the same variant", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-1",
        productVariantId: "v1",
        quantity: dec(500),
        deliveredQty: dec(100),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        id: "soi-2",
        productVariantId: "v1",
        quantity: dec(600),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so2",
          orderNumber: "SO-002",
          status: "IN_PRODUCTION",
          expectedDate: new Date("2026-07-28"),
          customer: { name: "Siti" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].openDemand).toBe(1000); // (500-100) + (600-0)
    expect(result[0].needToMake).toBe(1000);
    expect(result[0].availableFg).toBe(0);
    expect(result[0].earliestDue).toEqual(new Date("2026-07-25"));
    // sourceSoItems breakdown
    expect(result[0].sourceSoItems).toHaveLength(2);
    expect(result[0].sourceSoItems[0].soItemId).toBe("soi-1");
    expect(result[0].sourceSoItems[0].orderNumber).toBe("SO-001");
    expect(result[0].sourceSoItems[0].customerName).toBe("Budi");
    expect(result[0].sourceSoItems[0].residualQty).toBe(400);
    expect(result[0].sourceSoItems[1].soItemId).toBe("soi-2");
    expect(result[0].sourceSoItems[1].orderNumber).toBe("SO-002");
    expect(result[0].sourceSoItems[1].customerName).toBe("Siti");
    expect(result[0].sourceSoItems[1].residualQty).toBe(600);
  });

  it("should subtract available FG stock from needToMake", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-3",
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      { productVariantId: "v1", quantity: dec(300) },
      { productVariantId: "v1", quantity: dec(200) },
    ] as any);

    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].availableFg).toBe(500); // 300 + 200
    expect(result[0].needToMake).toBe(500); // 1000 - 500
  });

  it("should skip variants where needToMake <= 0 (stock covers demand)", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-4",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      { productVariantId: "v1", quantity: dec(200) },
    ] as any);

    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toEqual([]);
  });

  it("should subtract open SPK planned from needToMake for uncoveredNeed", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-5",
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);

    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
      {
        plannedQuantity: dec(300),
        bom: { productVariantId: "v1" },
      },
      {
        plannedQuantity: dec(200),
        bom: { productVariantId: "v1" },
      },
    ] as any);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].needToMake).toBe(1000);
    expect(result[0].openSpkPlanned).toBe(500); // 300 + 200
    expect(result[0].uncoveredNeed).toBe(500); // 1000 - 500
    expect(result[0].openSpkCount).toBe(2);
  });

  it("should exclude SERVICE product types", async () => {
    // SERVICE items would not appear because the query filters on productType != SERVICE
    // This test verifies the filter is applied at query level
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toEqual([]);
    // Verify the query includes the SERVICE filter
    expect(prisma.salesOrderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          productVariant: expect.objectContaining({
            product: expect.objectContaining({
              productType: { not: ProductType.SERVICE },
            }),
          }),
        }),
      }),
    );
  });

  it("should set urgencyHint based on days to due", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 6);

    const later = new Date();
    later.setDate(later.getDate() + 10);

    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-6",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: tomorrow,
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
      {
        id: "soi-7",
        productVariantId: "v2",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so2",
          orderNumber: "SO-002",
          status: "CONFIRMED",
          expectedDate: nextWeek,
          customer: { name: "Siti" },
        },
        productVariant: {
          id: "v2",
          name: "B",
          skuCode: "B",
          primaryUnit: "KG",
          product: { name: "Q" },
        },
      },
      {
        id: "soi-8",
        productVariantId: "v3",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so3",
          orderNumber: "SO-003",
          status: "CONFIRMED",
          expectedDate: later,
          customer: { name: "Andi" },
        },
        productVariant: {
          id: "v3",
          name: "C",
          skuCode: "C",
          primaryUnit: "KG",
          product: { name: "R" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(3);
    // URGENT (<=2 days) first
    expect(result[0].urgencyHint).toBe("URGENT");
    // NORMAL (<=7 days) second
    expect(result[1].urgencyHint).toBe("NORMAL");
    // LOW (>7 days) last
    expect(result[2].urgencyHint).toBe("LOW");
  });

  it("should sort by urgency, then earliest due, then need desc", async () => {
    // Relative dates — hard-coded calendar days go stale as CI "today" moves
    const dueLow = new Date();
    dueLow.setDate(dueLow.getDate() + 10); // >7 days → LOW
    const dueNormal = new Date();
    dueNormal.setDate(dueNormal.getDate() + 5); // <=7 days → NORMAL

    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-9",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: dueLow,
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "Low",
          skuCode: "L",
          primaryUnit: "KG",
          product: { name: "P1" },
        },
      },
      {
        id: "soi-10",
        productVariantId: "v2",
        quantity: dec(500),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so2",
          orderNumber: "SO-002",
          status: "CONFIRMED",
          expectedDate: dueNormal,
          customer: { name: "Siti" },
        },
        productVariant: {
          id: "v2",
          name: "Normal",
          skuCode: "N",
          primaryUnit: "KG",
          product: { name: "P2" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    // LOW (>7 days out) should be last despite smaller need volume
    expect(result[result.length - 1].urgencyHint).toBe("LOW");
    expect(result[0].urgencyHint).toBe("NORMAL");
  });

  it("should filter with onlyUncovered option", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-11",
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    // Fully covered by SPK
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
      {
        plannedQuantity: dec(1000),
        bom: { productVariantId: "v1" },
      },
    ] as any);

    // Without filter: still shows (needToMake > 0)
    const all = await listFgDemandBoard();
    expect(all).toHaveLength(1);
    expect(all[0].uncoveredNeed).toBe(0);

    // With onlyUncovered: hidden
    const uncovered = await listFgDemandBoard({ onlyUncovered: true });
    expect(uncovered).toEqual([]);
  });

  it("should handle no due date as NORMAL urgency", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-12",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: null,
          customer: null,
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].urgencyHint).toBe("NORMAL");
    expect(result[0].earliestDue).toBeNull();
  });

  it("should skip items with zero residual (fully delivered)", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-13",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(100),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toEqual([]);
  });

  it("should filter by search term", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-14",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so1",
          orderNumber: "SO-001",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        id: "soi-15",
        productVariantId: "v2",
        quantity: dec(200),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so2",
          orderNumber: "SO-002",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Siti" },
        },
        productVariant: {
          id: "v2",
          name: "LD 30×50",
          skuCode: "LD3050",
          primaryUnit: "KG",
          product: { name: "LD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard({ search: "HD" });

    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe("HD Resin");
  });

  it("should include sourceSoItems with correct breakdown for multi-customer demand", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-16",
        productVariantId: "v1",
        quantity: dec(300),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so-10",
          orderNumber: "SO-2026-010",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-30"),
          customer: { name: "Budi Gudang" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        id: "soi-17",
        productVariantId: "v1",
        quantity: dec(400),
        deliveredQty: dec(100),
        salesOrder: {
          id: "so-11",
          orderNumber: "SO-2026-011",
          status: "IN_PRODUCTION",
          expectedDate: new Date("2026-07-27"),
          customer: { name: "Siti Logam" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        id: "soi-18",
        productVariantId: "v1",
        quantity: dec(200),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so-12",
          orderNumber: "SO-2026-012",
          status: "CONFIRMED",
          expectedDate: new Date("2026-08-01"),
          customer: { name: "Andi Maju" },
        },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    // openDemand = 300 + (400-100) + 200 = 800
    expect(result[0].openDemand).toBe(800);
    expect(result[0].sourceSoItems).toHaveLength(3);

    // Sorted by expectedDate ascending (27 Jul → 30 Jul → 1 Aug)
    const items = result[0].sourceSoItems;
    expect(items[0].orderNumber).toBe("SO-2026-011");
    expect(items[0].customerName).toBe("Siti Logam");
    expect(items[0].residualQty).toBe(300); // 400 - 100
    expect(items[0].status).toBe("IN_PRODUCTION");

    expect(items[1].orderNumber).toBe("SO-2026-010");
    expect(items[1].customerName).toBe("Budi Gudang");
    expect(items[1].residualQty).toBe(300);

    expect(items[2].orderNumber).toBe("SO-2026-012");
    expect(items[2].customerName).toBe("Andi Maju");
    expect(items[2].residualQty).toBe(200);
  });

  it("should not include SO items with zero residual in sourceSoItems", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-19",
        productVariantId: "v1",
        quantity: dec(500),
        deliveredQty: dec(500), // fully delivered
        salesOrder: {
          id: "so-delivered",
          orderNumber: "SO-DEL",
          status: "DELIVERED",
          expectedDate: new Date("2026-07-20"),
          customer: { name: "Full Customer" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
      {
        id: "soi-20",
        productVariantId: "v1",
        quantity: dec(300),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so-open",
          orderNumber: "SO-OPEN",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-28"),
          customer: { name: "Open Customer" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].sourceSoItems).toHaveLength(1);
    expect(result[0].sourceSoItems[0].orderNumber).toBe("SO-OPEN");
  });

  it("should populate sourceSoItems with null customer when customer is missing", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-21",
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so-nocust",
          orderNumber: "SO-NOCUST",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: null,
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    expect(result[0].sourceSoItems).toHaveLength(1);
    expect(result[0].sourceSoItems[0].customerName).toBeNull();
    expect(result[0].sourceSoItems[0].orderNumber).toBe("SO-NOCUST");
  });

  it("should keep separate sourceSoItems entries for multiple lines within the same SO", async () => {
    // Same SO (so-multi), two lines for the same variant — should NOT collapse into one entry
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        id: "soi-line-1",
        productVariantId: "v1",
        quantity: dec(200),
        deliveredQty: dec(0),
        salesOrder: {
          id: "so-multi",
          orderNumber: "SO-MULTI",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
      {
        id: "soi-line-2",
        productVariantId: "v1",
        quantity: dec(150),
        deliveredQty: dec(50),
        salesOrder: {
          id: "so-multi",
          orderNumber: "SO-MULTI",
          status: "CONFIRMED",
          expectedDate: new Date("2026-07-25"),
          customer: { name: "Budi" },
        },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
    ] as any);

    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await listFgDemandBoard();

    expect(result).toHaveLength(1);
    // openDemand = 200 + (150-50) = 300
    expect(result[0].openDemand).toBe(300);
    // 2 distinct line items even though soId is identical
    expect(result[0].sourceSoItems).toHaveLength(2);
    expect(result[0].sourceSoItems[0].soItemId).toBe("soi-line-1");
    expect(result[0].sourceSoItems[1].soItemId).toBe("soi-line-2");
    // Unique keys — no collision
    const uniqueKeys = new Set(
      result[0].sourceSoItems.map((i) => i.soItemId),
    );
    expect(uniqueKeys.size).toBe(2);
    // Both entries share the same soId (same SO, different lines)
    expect(result[0].sourceSoItems[0].soId).toBe("so-multi");
    expect(result[0].sourceSoItems[1].soId).toBe("so-multi");
  });
});
