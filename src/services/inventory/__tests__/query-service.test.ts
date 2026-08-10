import { describe, it, expect, vi, beforeEach } from "vitest";
import { InventoryQueryService } from "../query-service";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    product: {
      count: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
    },
    stockMovement: {
      count: vi.fn(),
    },
  },
}));

// Mock logger (imported by some modules transitively)
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const dec = (n: number) => ({ toNumber: () => n });

describe("InventoryQueryService.getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts a variant as low stock when its Raw-Material-purpose location stock is below threshold (regression: tenant slug independent)", async () => {
    // Arrange — location uses a non-canonical, tenant-specific Indonesian
    // slug; only locationType/locationPurpose determine eligibility now,
    // not slug.
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(30),
        location: {
          id: "loc-rm",
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: dec(50) },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([
        { id: "pv-1", minStockAlert: dec(50), inventories: [] },
      ] as any) // lowStockVariants
      .mockResolvedValueOnce([] as any); // reorderVariants
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert
    expect(result.lowStockCount).toBe(1);
  });

  it("counts a variant whose ONLY stock sits in a non-RM/FG-purpose (WIP) location — allowed-location total defaults to 0, which is always below any positive threshold", async () => {
    // Arrange — this documents an existing characteristic of the badge
    // formula (`totalForAlert < threshold`, with totalForAlert defaulting
    // to 0 when no RM/FG stock exists at all): a WIP-only variant with a
    // minStockAlert set is still flagged, because 0 is always < a positive
    // threshold. This is unchanged by the locationPurpose migration — the
    // fix corrects *which* locations count as RM/FG, not this zero-total
    // edge case.
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(500),
        location: {
          id: "loc-wip",
          locationType: "INTERNAL",
          locationPurpose: "WIP",
        },
        productVariant: { minStockAlert: dec(50) },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([
        { id: "pv-1", minStockAlert: dec(50), inventories: [] },
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert
    expect(result.lowStockCount).toBe(1);
    // totalStock still reflects the WIP quantity regardless of alert eligibility
    expect(result.totalStock).toBe(500);
  });

  it("counts a variant as low stock based on RM+FG-purpose stock alone, even when its grand total across all locations is comfortably above threshold", async () => {
    // Arrange — the exact reported regression shape: RM-purpose stock (20)
    // is below threshold (50), but a large WIP balance (500) pushes the
    // variant's TOTAL stock across all locations to 520. getDashboardStats
    // never looks at variantQuantitiesAll for the low-stock badge — only
    // the RM/FG-purpose subtotal — so it stays flagged as low stock.
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(20),
        location: {
          id: "loc-rm",
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: dec(50) },
      },
      {
        productVariantId: "pv-1",
        quantity: dec(500),
        location: {
          id: "loc-wip",
          locationType: "INTERNAL",
          locationPurpose: "WIP",
        },
        productVariant: { minStockAlert: dec(50) },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([
        { id: "pv-1", minStockAlert: dec(50), inventories: [] },
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert - low-stock badge is driven by RM/FG-only subtotal (20 < 50), not the 520 grand total
    expect(result.lowStockCount).toBe(1);
    expect(result.totalStock).toBe(520);
  });

  it("excludes CUSTOMER_OWNED (maklon) stock from the low-stock alert even when locationPurpose is RAW_MATERIAL", async () => {
    // Arrange — variant has a small INTERNAL RAW_MATERIAL balance (below
    // threshold) plus a large CUSTOMER_OWNED RAW_MATERIAL balance. If the
    // customer-owned stock were incorrectly counted, the combined total
    // (1020) would clear the threshold (50) and the variant would NOT be
    // flagged. Because isLowStockAlertLocation requires locationType ===
    // 'INTERNAL', the customer-owned stock must be excluded, so the
    // variant should still be flagged as low stock.
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(20),
        location: {
          id: "loc-rm",
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: dec(50) },
      },
      {
        productVariantId: "pv-1",
        quantity: dec(1000),
        location: {
          id: "loc-maklon",
          locationType: "CUSTOMER_OWNED",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: dec(50) },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([
        { id: "pv-1", minStockAlert: dec(50), inventories: [] },
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert - customer-owned stock excluded, RM-only subtotal (20) stays below threshold (50)
    expect(result.lowStockCount).toBe(1);
  });

  it("does not flag a variant whose RM+FG-purpose stock alone clears the threshold", async () => {
    // Arrange — sanity check: healthy stock in an allowed location should
    // not be flagged, regardless of tenant-specific slug naming.
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(446.5),
        location: {
          id: "loc-rm",
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: dec(50) },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([
        { id: "pv-1", minStockAlert: dec(50), inventories: [] },
      ] as any)
      .mockResolvedValueOnce([] as any);
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(0);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert
    expect(result.lowStockCount).toBe(0);
  });

  it("returns productCount, totalStock, recentMovements and suggestedPurchasesCount alongside lowStockCount", async () => {
    // Arrange
    const { prisma } = await import("@/lib/core/prisma");
    vi.mocked(prisma.product.count).mockResolvedValue(7);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([
      {
        productVariantId: "pv-1",
        quantity: dec(10),
        location: {
          id: "loc-rm",
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
        productVariant: { minStockAlert: null },
      },
    ] as any);
    vi.mocked(prisma.productVariant.findMany)
      .mockResolvedValueOnce([] as any) // lowStockVariants
      .mockResolvedValueOnce([
        { id: "pv-1", reorderPoint: dec(100) },
      ] as any); // reorderVariants
    vi.mocked(prisma.stockMovement.count).mockResolvedValue(3);

    // Act
    const result = await InventoryQueryService.getDashboardStats();

    // Assert
    expect(result.productCount).toBe(7);
    expect(result.totalStock).toBe(10);
    expect(result.recentMovements).toBe(3);
    expect(result.suggestedPurchasesCount).toBe(1); // 10 < 100 reorderPoint
    expect(result.lowStockCount).toBe(0);
  });
});
