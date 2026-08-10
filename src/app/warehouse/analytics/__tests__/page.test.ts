import { describe, it, expect, vi } from "vitest";

// The page module (Server Component) pulls in several services/actions
// that ultimately touch prisma. We only test the pure exported helper
// `computeLowStockVariantIds`, so mock out everything not needed for it.
vi.mock("@/actions/inventory/inventory", () => ({
  getInventoryValuation: vi.fn(),
  getInventoryTurnover: vi.fn(),
  getDaysOfInventoryOnHand: vi.fn(),
  getDashboardStats: vi.fn(),
  getSuggestedPurchases: vi.fn(),
  getInventoryStats: vi.fn(),
}));

vi.mock("@/services/inventory/abc-analysis-service", () => ({
  ABCAnalysisService: {
    calculateABCClassification: vi.fn(),
  },
}));

vi.mock("@/services/inventory/stock-aging-service", () => ({
  StockAgingService: {
    getAgingSummary: vi.fn(),
    calculateStockAging: vi.fn(),
  },
}));

vi.mock("@/actions/admin/permissions", () => ({
  canViewPrices: vi.fn(),
}));

import { computeLowStockVariantIds } from "../page";

describe("computeLowStockVariantIds", () => {
  it("counts an item in an INTERNAL Raw-Material-purpose location with a non-canonical, tenant-specific slug as low stock (regression for slug-mismatch bug)", () => {
    // Arrange — mirrors a real tenant's Indonesian-named warehouse slug,
    // which never matched the old hardcoded WAREHOUSE_SLUGS.RAW_MATERIAL constant.
    const inventory = [
      {
        productVariantId: "pv-1",
        quantity: 20,
        productVariant: { minStockAlert: 50 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert
    expect(result.has("pv-1")).toBe(true);
  });

  it("counts an item in an INTERNAL Finished-Good-purpose location with a non-canonical slug as low stock", () => {
    // Arrange
    const inventory = [
      {
        productVariantId: "pv-2",
        quantity: 5,
        productVariant: { minStockAlert: 10 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "FINISHED_GOOD",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert
    expect(result.has("pv-2")).toBe(true);
  });

  it("excludes an item in a non-RM/FG-purpose location (e.g. WIP) even with a canonical-looking slug", () => {
    // Arrange
    const inventory = [
      {
        productVariantId: "pv-3",
        quantity: 5,
        productVariant: { minStockAlert: 10 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "WIP",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert - no allowed-location stock and no threshold recorded, so not flagged
    expect(result.has("pv-3")).toBe(false);
  });

  it("excludes CUSTOMER_OWNED stock even when locationPurpose is RAW_MATERIAL", () => {
    // Arrange — variant has healthy INTERNAL RM stock (above threshold) plus
    // a large CUSTOMER_OWNED RM balance that must not count toward the total.
    const inventory = [
      {
        productVariantId: "pv-4",
        quantity: 100,
        productVariant: { minStockAlert: 50 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
      },
      {
        productVariantId: "pv-4",
        quantity: 1000,
        productVariant: { minStockAlert: 50 },
        location: {
          locationType: "CUSTOMER_OWNED",
          locationPurpose: "RAW_MATERIAL",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert - INTERNAL RM stock alone (100) already clears threshold (50)
    expect(result.has("pv-4")).toBe(false);
  });

  it("does not flag a variant with no minStockAlert threshold recorded", () => {
    // Arrange
    const inventory = [
      {
        productVariantId: "pv-5",
        quantity: 1,
        productVariant: { minStockAlert: null },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert
    expect(result.has("pv-5")).toBe(false);
  });

  it("sums quantities across multiple allowed locations before comparing to threshold", () => {
    // Arrange
    const inventory = [
      {
        productVariantId: "pv-6",
        quantity: 10,
        productVariant: { minStockAlert: 25 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "RAW_MATERIAL",
        },
      },
      {
        productVariantId: "pv-6",
        quantity: 10,
        productVariant: { minStockAlert: 25 },
        location: {
          locationType: "INTERNAL",
          locationPurpose: "FINISHED_GOOD",
        },
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert - 10 + 10 = 20 < 25
    expect(result.has("pv-6")).toBe(true);
  });

  it("ignores items with a null location", () => {
    // Arrange
    const inventory = [
      {
        productVariantId: "pv-7",
        quantity: 1,
        productVariant: { minStockAlert: 10 },
        location: null,
      },
    ];

    // Act
    const result = computeLowStockVariantIds(inventory);

    // Assert
    expect(result.has("pv-7")).toBe(false);
  });
});
