import { prisma } from "@/lib/core/prisma";
import { SalesOrderType, ProductType, Unit } from "@prisma/client";

type SalesLineInput = {
  productVariantId: string;
  quantity: number;
  unitPrice: number;
  enteredQuantity?: number;
  enteredUnit?: Unit;
  conversionFactorSnapshot?: number;
  enteredUnitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
};

type ProcessedItem = {
  productVariantId: string;
  quantity: number;
  unitPrice: number;
  enteredQuantity: number | undefined;
  enteredUnit: Unit | undefined;
  conversionFactorSnapshot: number | undefined;
  enteredUnitPrice: number | undefined;
  discountPercent: number;
  taxPercent: number;
  taxAmount: number;
  subtotal: number;
};

type OrderItemTotals = {
  totalAmount: number;
  totalDiscount: number;
  totalTax: number;
  items: ProcessedItem[];
};

function decimalToNumber(value: unknown, fallback = 1) {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assertNearlyEqual(
  clientValue: number | undefined,
  serverValue: number,
  label: string,
) {
  if (clientValue === undefined) return;
  if (Math.abs(Number(clientValue) - serverValue) > 0.0001) {
    throw new Error(
      `${label} mismatch. Client sent ${clientValue}, server calculated ${serverValue}.`,
    );
  }
}

function resolveSalesEnteredUnitFactor(
  item: SalesLineInput,
  variant: {
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: unknown;
  },
) {
  const payloadCount = [
    item.enteredQuantity !== undefined,
    item.enteredUnit !== undefined,
    item.enteredUnitPrice !== undefined,
    item.conversionFactorSnapshot !== undefined,
  ].filter(Boolean).length;

  if (payloadCount > 0 && payloadCount < 4) {
    throw new Error(
      "Incomplete sales conversion payload. Send enteredQuantity, enteredUnit, enteredUnitPrice, and conversionFactorSnapshot together.",
    );
  }

  if (payloadCount === 0) return null;

  const enteredUnit = item.enteredUnit as Unit;
  if (enteredUnit === variant.primaryUnit) return 1;

  if (variant.salesUnit && enteredUnit === variant.salesUnit) {
    const factor = decimalToNumber(variant.conversionFactor, 1);
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(
        `Invalid conversion factor for sales unit ${enteredUnit}`,
      );
    }
    return factor;
  }

  throw new Error(`Unit ${enteredUnit} is not valid for this product variant`);
}

function normalizeSalesLineItem(
  item: SalesLineInput,
  variant: {
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: unknown;
  },
) {
  const factor = resolveSalesEnteredUnitFactor(item, variant);

  if (factor === null) {
    return {
      productVariantId: item.productVariantId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      enteredQuantity: undefined,
      enteredUnit: undefined,
      conversionFactorSnapshot: undefined,
      enteredUnitPrice: undefined,
      discountPercent: item.discountPercent || 0,
      taxPercent: item.taxPercent || 0,
    };
  }

  const enteredQuantity = Number(item.enteredQuantity);
  const enteredUnitPrice = Number(item.enteredUnitPrice);
  const baseQuantity = enteredQuantity * factor;
  const baseUnitPrice =
    factor > 0 ? enteredUnitPrice / factor : enteredUnitPrice;

  assertNearlyEqual(item.quantity, baseQuantity, "Sales quantity conversion");
  assertNearlyEqual(
    item.unitPrice,
    baseUnitPrice,
    "Sales unit price conversion",
  );
  assertNearlyEqual(
    item.conversionFactorSnapshot,
    factor,
    "Sales conversion factor",
  );

  return {
    productVariantId: item.productVariantId,
    quantity: baseQuantity,
    unitPrice: baseUnitPrice,
    enteredQuantity,
    enteredUnit: item.enteredUnit,
    conversionFactorSnapshot: factor,
    enteredUnitPrice,
    discountPercent: item.discountPercent || 0,
    taxPercent: item.taxPercent || 0,
  };
}

/**
 * Processes order line items: validates, normalizes, and computes totals.
 * Shared by createOrder and updateOrder.
 */
export async function processOrderItems(
  items: SalesLineInput[],
  orderType: SalesOrderType,
): Promise<OrderItemTotals> {
  let totalAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const processedItems = await Promise.all(
    items.map(async (item) => {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.productVariantId },
        include: { product: true },
      });

      if (!variant)
        throw new Error(`Product variant ${item.productVariantId} not found`);

      const isService = variant.product.productType === ProductType.SERVICE;
      if (isService && orderType !== SalesOrderType.MAKLON_JASA) {
        throw new Error(
          `Service item '${variant.name}' is only allowed for Maklon Jasa orders`,
        );
      }
      if (!isService && orderType === SalesOrderType.MAKLON_JASA) {
        throw new Error(
          `Physical item '${variant.name}' is not allowed for Maklon Jasa orders. Use a Service item instead.`,
        );
      }

      const normalized = normalizeSalesLineItem(item, variant);
      const rawSubtotal = normalized.quantity * normalized.unitPrice;
      const discountAmount = rawSubtotal * (normalized.discountPercent / 100);
      const subtotalAfterDiscount = rawSubtotal - discountAmount;
      const taxAmount = subtotalAfterDiscount * (normalized.taxPercent / 100);
      const flowSubtotal = subtotalAfterDiscount + taxAmount;

      totalDiscount += discountAmount;
      totalTax += taxAmount;
      totalAmount += flowSubtotal;

      return {
        ...normalized,
        taxAmount,
        subtotal: flowSubtotal,
      };
    }),
  );

  return {
    totalAmount,
    totalDiscount,
    totalTax,
    items: processedItems,
  };
}
