/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductionOrderService } from "../order-service";
import { prisma } from "@/lib/core/prisma";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    bom: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    bomItem: {
      upsert: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  },
}));

vi.mock("../order-number-service", () => ({
  createProductionOrderWithGeneratedNumber: vi.fn((tx, data) =>
    Promise.resolve({
      id: "spk-step4-1",
      orderNumber: "SPK-2026-07-040",
      locationId: data.location?.connect?.id || data.locationId,
      ...data,
    }),
  ),
}));

describe("Step 4: Perluas BOM Packing Melindo (Batch Coverage)", () => {
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
  ];

  const fgNonKgVariants = [
    { skuCode: "RHK0510", name: "Rafia Hitam KW 0,5 (10)", unit: "BAL", bomId: "bom-rhk0510" },
    { skuCode: "RHS0910", name: "Rafia Hitam Super 0,9 (10)", unit: "BAL", bomId: "bom-rhs0910" },
    { skuCode: "RHS1010", name: "Rafia Hitam Super 1 (10)", unit: "BAL", bomId: "bom-rhs1010" },
    { skuCode: "RRK0110", name: "Rafia Biru KW 1 (10)", unit: "BAL", bomId: "bom-rrk0110" },
    { skuCode: "RKK1010", name: "Rafia Kuning KW 1 (10)", unit: "BAL", bomId: "bom-rkk1010" },
    { skuCode: "RMK1010", name: "Rafia Merah KW 1 (10)", unit: "BAL", bomId: "bom-rmk1010" },
    { skuCode: "RWM0760", name: "Rafia Warna Super Mix 0.7 (6)", unit: "BAL", bomId: "bom-rwm0760" },
    { skuCode: "SJS00WL-11", name: "Sedotan Hijau Steril Full Printing", unit: "PCS", bomId: "bom-sjs00wl11" },
    { skuCode: "INV-0041", name: "Sedotan Hitam Steril Full Polos 500", unit: "PCS", bomId: "bom-inv0041" },
    { skuCode: "INV-0055", name: "Sedotan Warna Pop Ice Tumpul 130gr", unit: "PCS", bomId: "bom-inv0055" },
  ];

  it("All 10 batch FG non-KG variants can create SPK packing successfully without BOM missing error", async () => {
    prisma.location.findMany.mockResolvedValue(melindoLocations);
    prisma.location.findUnique.mockResolvedValue(melindoLocations[0]);

    for (const item of fgNonKgVariants) {
      prisma.bom.findUnique.mockResolvedValue({
        id: item.bomId,
        isActive: true,
        category: "PACKING",
        outputQuantity: 1,
        items: [],
        productVariant: {
          id: `var-${item.skuCode}`,
          skuCode: item.skuCode,
          name: item.name,
          primaryUnit: item.unit,
        },
      });

      const order = await ProductionOrderService.createOrder({
        bomId: item.bomId,
        plannedQuantity: 10,
        locationId: "loc-fg",
      });

      expect(order.locationId).toBe("loc-fg");
      expect(order.status).toBe("DRAFT");
    }
  });
});
