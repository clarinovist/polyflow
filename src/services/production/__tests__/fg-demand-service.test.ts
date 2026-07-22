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
        productVariantId: "v1",
        quantity: dec(500),
        deliveredQty: dec(100),
        salesOrder: { expectedDate: new Date("2026-07-25") },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        productVariantId: "v1",
        quantity: dec(600),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-28") },
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
  });

  it("should subtract available FG stock from needToMake", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: tomorrow },
        productVariant: {
          id: "v1",
          name: "A",
          skuCode: "A",
          primaryUnit: "KG",
          product: { name: "P" },
        },
      },
      {
        productVariantId: "v2",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: nextWeek },
        productVariant: {
          id: "v2",
          name: "B",
          skuCode: "B",
          primaryUnit: "KG",
          product: { name: "Q" },
        },
      },
      {
        productVariantId: "v3",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: later },
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
    const due1 = new Date("2026-07-30");
    const due2 = new Date("2026-07-25");

    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: due1 },
        productVariant: {
          id: "v1",
          name: "Low",
          skuCode: "L",
          primaryUnit: "KG",
          product: { name: "P1" },
        },
      },
      {
        productVariantId: "v2",
        quantity: dec(500),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: due2 },
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

    // LOW (>7 days out) should be last despite larger need
    expect(result[result.length - 1].urgencyHint).toBe("LOW");
  });

  it("should filter with onlyUncovered option", async () => {
    vi.mocked(prisma.salesOrderItem.findMany).mockResolvedValue([
      {
        productVariantId: "v1",
        quantity: dec(1000),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: null },
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
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(100),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
        productVariantId: "v1",
        quantity: dec(100),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
        productVariant: {
          id: "v1",
          name: "HD 40×60",
          skuCode: "HD4060",
          primaryUnit: "KG",
          product: { name: "HD Resin" },
        },
      },
      {
        productVariantId: "v2",
        quantity: dec(200),
        deliveredQty: dec(0),
        salesOrder: { expectedDate: new Date("2026-07-25") },
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
});
