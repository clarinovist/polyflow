/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductionOrderService } from "../order-service";
import { PackingReportService } from "../packing-report-service";
import { prisma } from "@/lib/core/prisma";
import {
  isRiskyOutputLocation,
  resolveOutputLocationId,
  isPackagingSuppliesWarehouse,
} from "@/lib/locations/resolve-location";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    bom: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productionExecution: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  },
}));

vi.mock("../order-number-service", () => ({
  createProductionOrderWithGeneratedNumber: vi.fn((tx, data) =>
    Promise.resolve({
      id: "spk-test-1",
      orderNumber: "SPK-2026-07-001",
      locationId: data.location?.connect?.id || data.locationId,
      ...data,
    }),
  ),
}));

describe("Step 3: Melindo 3-Sample Packing & Location Guard UAT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const melindoLocations = [
    {
      id: "loc-fg",
      name: "Gudang Barang Jadi",
      slug: "gudang-barang-jadi",
      locationPurpose: "FINISHED_GOOD",
    },
    {
      id: "loc-supplies",
      name: "Gudang Packaging Supplies",
      slug: "gudang-packaging",
      locationPurpose: "PACKING",
    },
    {
      id: "loc-rm",
      name: "Gudang Bahan Baku",
      slug: "gudang-bahan-baku",
      locationPurpose: "RAW_MATERIAL",
    },
  ];

  const kiyowoLocations = [
    {
      id: "loc-kiyowo-pack",
      name: "Packing Area",
      slug: "packing_area",
      locationPurpose: "PACKING",
    },
    {
      id: "loc-kiyowo-fg",
      name: "Gudang Barang Jadi",
      slug: "fg_warehouse",
      locationPurpose: "FINISHED_GOOD",
    },
  ];

  describe("Requirement 1 & 2: BOM Packing & Location Guard Verification", () => {
    it("S1 (Rafia Bal): resolves output location to FG and rejects supplies location", () => {
      const outputLocId = resolveOutputLocationId(melindoLocations, "packing");
      expect(outputLocId).toBe("loc-fg");

      const suppliesLoc = melindoLocations.find((l) => l.slug === "gudang-packaging");
      expect(isRiskyOutputLocation(suppliesLoc)).toBe(true);
      expect(isPackagingSuppliesWarehouse(suppliesLoc)).toBe(true);
    });

    it("S2 (Sedotan Pack): resolves output location to FG and rejects RM location", () => {
      const rmLoc = melindoLocations.find((l) => l.slug === "gudang-bahan-baku");
      expect(isRiskyOutputLocation(rmLoc)).toBe(true);
    });

    it("S3 (Sedotan Steril Karton): resolves output location to FG", () => {
      const outputLocId = resolveOutputLocationId(melindoLocations, "packing");
      expect(outputLocId).toBe("loc-fg");
    });

    it("Rejects createOrder when locationId is set to supplies warehouse", async () => {
      prisma.location.findMany.mockResolvedValue(melindoLocations);
      prisma.location.findUnique.mockResolvedValue(melindoLocations[1]);
      prisma.bom.findUnique.mockResolvedValue({
        id: "bom-s1",
        isActive: true,
        category: "PACKING",
        outputQuantity: 1,
        items: [],
        productVariantId: "var-s1",
      });

      await expect(
        ProductionOrderService.createOrder({
          bomId: "bom-s1",
          plannedQuantity: 10,
          locationId: "loc-supplies", // Invalid supplies location
        }),
      ).rejects.toThrow(/Lokasi output tidak valid untuk SPK/);
    });
  });

  describe("Requirement 3: Stock increase in target units (BAL, PCS, KARTON)", () => {
    it("S1: Rafia Bal output created with BAL primaryUnit", async () => {
      const mockBomS1 = {
        id: "bom-s1-rafia-bal",
        category: "PACKING",
        outputQuantity: 1,
        isActive: true,
        items: [],
        productVariant: {
          id: "var-rafia-bal",
          skuCode: "RHK1010",
          name: "Rafia Hitam KW 1 (10)",
          primaryUnit: "BAL",
        },
      };

      prisma.location.findMany.mockResolvedValue(melindoLocations);
      prisma.location.findUnique.mockResolvedValue(melindoLocations[0]);
      prisma.bom.findUnique.mockResolvedValue(mockBomS1);

      const order = await ProductionOrderService.createOrder({
        bomId: "bom-s1-rafia-bal",
        plannedQuantity: 5,
        locationId: "loc-fg",
      });

      expect(order.locationId).toBe("loc-fg");
    });

    it("S2: Sedotan Pack output created with PCS primaryUnit", async () => {
      const mockBomS2 = {
        id: "bom-s2-sedotan-pack",
        category: "PACKING",
        outputQuantity: 1,
        isActive: true,
        items: [],
        productVariant: {
          id: "var-sedotan-pack",
          skuCode: "SHS00WL-00",
          name: "Sedotan Hitam Steril 250",
          primaryUnit: "PCS",
        },
      };

      prisma.location.findMany.mockResolvedValue(melindoLocations);
      prisma.location.findUnique.mockResolvedValue(melindoLocations[0]);
      prisma.bom.findUnique.mockResolvedValue(mockBomS2);

      const order = await ProductionOrderService.createOrder({
        bomId: "bom-s2-sedotan-pack",
        plannedQuantity: 100,
        locationId: "loc-fg",
      });

      expect(order.locationId).toBe("loc-fg");
    });

    it("S3: Sedotan Steril Karton output created with KARTON primaryUnit", async () => {
      const mockBomS3 = {
        id: "bom-s3-sedotan-karton",
        category: "PACKING",
        outputQuantity: 1,
        isActive: true,
        items: [],
        productVariant: {
          id: "var-sedotan-karton",
          skuCode: "SHS00WL-KT",
          name: "Sedotan Hitam Steril Karton",
          primaryUnit: "KARTON",
        },
      };

      prisma.location.findMany.mockResolvedValue(melindoLocations);
      prisma.location.findUnique.mockResolvedValue(melindoLocations[0]);
      prisma.bom.findUnique.mockResolvedValue(mockBomS3);

      const order = await ProductionOrderService.createOrder({
        bomId: "bom-s3-sedotan-karton",
        plannedQuantity: 10,
        locationId: "loc-fg",
      });

      expect(order.locationId).toBe("loc-fg");
    });
  });

  describe("Requirement 4: Packing Monthly Report Filter", () => {
    it("Includes FG location orders and excludes supplies location orders", async () => {
      const mockExecutions = [
        {
          id: "exec-valid-s1",
          quantityProduced: 5,
          endTime: new Date("2026-07-26T08:00:00Z"),
          productionOrderId: "po-1",
          productionOrder: {
            id: "po-1",
            location: melindoLocations[0], // loc-fg (VALID)
            bom: {
              category: "PACKING",
              productVariant: {
                id: "var-rafia-bal",
                skuCode: "RHK1010",
                primaryUnit: "BAL",
                product: { name: "Rafia Hitam KW 1 (10)" },
              },
            },
            stockMovements: [],
          },
        },
        {
          id: "exec-invalid-supplies",
          quantityProduced: 10,
          endTime: new Date("2026-07-26T08:00:00Z"),
          productionOrderId: "po-supplies",
          productionOrder: {
            id: "po-supplies",
            location: melindoLocations[1], // loc-supplies (EXCLUDED)
            bom: {
              category: "PACKING",
              productVariant: {
                id: "var-supplies-item",
                skuCode: "SUP-001",
                primaryUnit: "PCS",
                product: { name: "Supplies Item" },
              },
            },
            stockMovements: [],
          },
        },
      ];

      prisma.productionExecution.findMany.mockResolvedValue(mockExecutions);

      const report = await PackingReportService.getMonthlyPackingReport("2026-07");

      expect(report.length).toBe(1);
      expect(report[0].skuCode).toBe("RHK1010");
      expect(report[0].totalQuantity).toBe(5);
      expect(report[0].primaryUnit).toBe("BAL");
    });
  });

  describe("Requirement 5: Kiyowo Spot-Check", () => {
    it("Resolves Kiyowo packing stage to packing_area location", () => {
      const outputLocId = resolveOutputLocationId(kiyowoLocations, "packing");
      expect(outputLocId).toBe("loc-kiyowo-pack");
    });

    it("Packing report correctly includes Kiyowo packing_area executions", async () => {
      const kiyowoExec = [
        {
          id: "exec-kiyowo-1",
          quantityProduced: 50,
          endTime: new Date("2026-07-26T08:00:00Z"),
          productionOrderId: "po-k1",
          productionOrder: {
            id: "po-k1",
            location: kiyowoLocations[0], // packing_area (VALID)
            bom: {
              category: "PACKING",
              productVariant: {
                id: "var-kiyowo-1",
                skuCode: "KYW-PK-01",
                primaryUnit: "PCS",
                product: { name: "Kiyowo Jumbo Bag" },
              },
            },
            stockMovements: [],
          },
        },
      ];

      prisma.productionExecution.findMany.mockResolvedValue(kiyowoExec);

      const report = await PackingReportService.getMonthlyPackingReport("2026-07");

      expect(report.length).toBe(1);
      expect(report[0].skuCode).toBe("KYW-PK-01");
      expect(report[0].totalQuantity).toBe(50);
    });
  });
});
