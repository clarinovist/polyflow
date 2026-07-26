import { describe, it, expect, vi, beforeEach } from "vitest";
import { processOrderItems } from "../order-item-processor";
import { prisma } from "@/lib/core/prisma";
import { ProductType, SalesOrderType } from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn(),
    },
  },
}));

describe("processOrderItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should process items correctly with default values", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-1",
      name: "Product A",
      primaryUnit: "PCS",
      salesUnit: null,
      conversionFactor: 1,
      product: { productType: ProductType.FINISHED_GOOD },
    } as any);

    const result = await processOrderItems(
      [
        {
          productVariantId: "pv-1",
          quantity: 10,
          unitPrice: 1000,
          isFreeItem: true,
        },
      ],
      SalesOrderType.MAKE_TO_STOCK,
    );

    expect(result.items.length).toBe(1);
    expect(result.items[0].isFreeItem).toBe(true);
    expect(result.totalAmount).toBe(10000);
  });

  it("should calculate discounts and PPN include correctly", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-2",
      name: "Product B",
      primaryUnit: "KG",
      salesUnit: null,
      conversionFactor: 1,
      product: { productType: ProductType.FINISHED_GOOD },
    } as any);

    const result = await processOrderItems(
      [
        {
          productVariantId: "pv-2",
          quantity: 5,
          unitPrice: 2000,
          discountPercent: 10,
          taxPercent: 11,
          ppnMode: "INCLUDE",
          isFreeItem: false,
        },
      ],
      SalesOrderType.MAKE_TO_STOCK,
    );

    expect(result.items[0].isFreeItem).toBe(false);
    expect(result.totalDiscount).toBe(1000);
    expect(result.totalAmount).toBe(9000); // INCLUDED PPN total remains 9000
  });

  it("should reject service item in physical order type", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-service",
      name: "Jasa Jahit",
      primaryUnit: "PCS",
      salesUnit: null,
      conversionFactor: 1,
      product: { productType: ProductType.SERVICE },
    } as any);

    await expect(
      processOrderItems(
        [
          {
            productVariantId: "pv-service",
            quantity: 1,
            unitPrice: 5000,
          },
        ],
        SalesOrderType.MAKE_TO_STOCK,
      ),
    ).rejects.toThrow(/Service item/);
  });

  it("should reject physical item in MAKLON_JASA order type", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-physical",
      name: "Kain HD",
      primaryUnit: "KG",
      salesUnit: null,
      conversionFactor: 1,
      product: { productType: ProductType.FINISHED_GOOD },
    } as any);

    await expect(
      processOrderItems(
        [
          {
            productVariantId: "pv-physical",
            quantity: 1,
            unitPrice: 5000,
          },
        ],
        SalesOrderType.MAKLON_JASA,
      ),
    ).rejects.toThrow(/Physical item/);
  });

  it("should handle sales unit conversion factor payload correctly", async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
      id: "pv-conv",
      name: "Kantong Plastik Box",
      primaryUnit: "PCS",
      salesUnit: "BOX",
      conversionFactor: 100,
      product: { productType: ProductType.FINISHED_GOOD },
    } as any);

    const result = await processOrderItems(
      [
        {
          productVariantId: "pv-conv",
          quantity: 200,
          unitPrice: 50,
          enteredQuantity: 2,
          enteredUnit: "BOX" as any,
          enteredUnitPrice: 5000,
          conversionFactorSnapshot: 100,
        },
      ],
      SalesOrderType.MAKE_TO_STOCK,
    );

    expect(result.items[0].quantity).toBe(200);
    expect(result.items[0].unitPrice).toBe(50);
  });
});
