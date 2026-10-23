import { describe, it, expect, vi, beforeEach } from "vitest";
import { processOrderItems } from "../order-item-processor";
import { prisma } from "@/lib/core/prisma";
import { ProductType, SalesOrderType, Prisma, type SalesOrderItem } from "@prisma/client";

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

  it('accepts explicit primary-unit entry and rejects forged/nonfinite/incomplete conversions', async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({ id: 'pv', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 25, product: { productType: ProductType.FINISHED_GOOD } } as never);
    const valid = { productVariantId: 'pv', quantity: 1250, unitPrice: 22000, enteredQuantity: 1250, enteredUnit: 'KG' as const, enteredUnitPrice: 22000, conversionFactorSnapshot: 1 };
    expect((await processOrderItems([valid], SalesOrderType.MAKE_TO_STOCK)).items[0]).toMatchObject(valid);
    for (const patch of [{ quantity: 31250 }, { unitPrice: NaN }, { enteredQuantity: Infinity }, { conversionFactorSnapshot: 25 }, { enteredUnit: 'PCS' as const }, { enteredUnitPrice: undefined }]) {
      await expect(processOrderItems([{ ...valid, ...patch }], SalesOrderType.MAKE_TO_STOCK)).rejects.toThrow();
    }
    await expect(processOrderItems([{ ...valid, quantity: 1.001, unitPrice: 22000, enteredQuantity: 0.04004, enteredUnit: 'BAL', enteredUnitPrice: 550000, conversionFactorSnapshot: 25 }], SalesOrderType.MAKE_TO_STOCK)).rejects.toThrow(/disimpan tepat/);
    await expect(processOrderItems([{ ...valid, quantity: 25, unitPrice: 0.004, enteredUnit: 'BAL', enteredQuantity: 1, enteredUnitPrice: 0.1, conversionFactorSnapshot: 25 }], SalesOrderType.MAKE_TO_STOCK)).rejects.toThrow(/disimpan tepat/);
  });

  it('uses only server-loaded historical snapshot, preserves unchanged rounding and rejects forged factors', async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({ id: 'pv', primaryUnit: 'KG', salesUnit: 'ZAK', conversionFactor: 50, product: { productType: ProductType.FINISHED_GOOD } } as never);
    const line = { id: 'line', productVariantId: 'pv', quantity: 50, unitPrice: 4000, enteredQuantity: 2, enteredUnit: 'BAL' as const, enteredUnitPrice: 100000, conversionFactorSnapshot: 25 };
    const old = { ...line, subtotal: new Prisma.Decimal(200000), taxAmount: new Prisma.Decimal(0), conversionFactorSnapshot: new Prisma.Decimal(25) } as unknown as SalesOrderItem;
    expect((await processOrderItems([line], SalesOrderType.MAKE_TO_STOCK, [old])).items[0].conversionFactorSnapshot).toBe(25);
    await expect(processOrderItems([{ ...line, conversionFactorSnapshot: 50 }], SalesOrderType.MAKE_TO_STOCK, [old])).rejects.toThrow();
    await expect(processOrderItems([line], SalesOrderType.MAKE_TO_STOCK)).rejects.toThrow();
  });

  it('preserves a trusted unchanged line whose legacy base price was rounded', async () => {
    vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({ primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 3, product: { productType: ProductType.FINISHED_GOOD } } as never);
    const line = { id: 'old', productVariantId: 'pv', quantity: 3, unitPrice: 33.33, enteredQuantity: 1, enteredUnit: 'BAL' as const, enteredUnitPrice: 100, conversionFactorSnapshot: 3 };
    const old = { ...line, subtotal: new Prisma.Decimal(100), taxAmount: new Prisma.Decimal(0) } as unknown as SalesOrderItem;
    const result = await processOrderItems([line], SalesOrderType.MAKE_TO_STOCK, [old]);
    expect(result.items[0]).toMatchObject({ quantity: 3, unitPrice: 33.33, subtotal: 100 });
    await expect(processOrderItems([{ ...line, enteredUnitPrice: 101 }], SalesOrderType.MAKE_TO_STOCK, [old])).rejects.toThrow();
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
