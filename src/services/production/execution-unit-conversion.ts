/**
 * Production Execution Unit Conversion Helper
 *
 * Converts operator-entered quantity and unit to the authoritative
 * base quantity for inventory/costing posting.
 *
 * Semantic rule:
 *   baseQuantity = enteredQuantity * conversionFactorSnapshot
 *
 * where conversionFactorSnapshot = number of base/primary units
 * per 1 sales/entered unit (e.g. 1 PACK = 0.25 KG).
 *
 * When enteredUnit === primaryUnit (same unit), conversionFactor is 1
 * and baseQuantity === enteredQuantity.
 */

import { prisma } from '@/lib/core/prisma';
import { Prisma, Unit } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/errors/errors';

export interface ConversionInput {
  productionOrderId: string;
  enteredQuantity: number;
  enteredUnit: Unit;
}

export interface ConversionResult {
  baseQuantityProduced: number;
  conversionFactorSnapshot: number;
  primaryUnit: Unit;
}

type ProductionOrderUnitClient = Pick<Prisma.TransactionClient, 'productionOrder'>;

function toNumericConversionFactor(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);

  // Prisma Decimal and test doubles commonly expose toNumber().
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber === 'function') {
      return decimalLike.toNumber();
    }
  }

  return Number(value);
}

/**
 * Validate and resolve entered quantity/unit to base quantity.
 *
 * Fetches the production order's output variant unit config,
 * validates the entered unit, and computes the base quantity.
 *
 * Throws if:
 * - production order or BOM variant not found
 * - enteredUnit is neither primaryUnit nor salesUnit
 * - conversionFactor <= 0
 * - for primaryUnit input: baseQuantity !== enteredQuantity
 */
export async function resolveProductionOutputUnit(
  input: ConversionInput,
  client: ProductionOrderUnitClient = prisma
): Promise<ConversionResult> {
  const { productionOrderId, enteredQuantity, enteredUnit } = input;

  // Fetch the output variant's unit config
  const order = await client.productionOrder.findUnique({
    where: { id: productionOrderId },
    select: {
      bom: {
        select: {
          productVariant: {
            select: {
              primaryUnit: true,
              salesUnit: true,
              conversionFactor: true,
            },
          },
        },
      },
    },
  });

  if (!order?.bom?.productVariant) {
    throw new NotFoundError('Production Order', productionOrderId);
  }

  const variant = order.bom.productVariant;
  const primaryUnit = variant.primaryUnit;
  const salesUnit = variant.salesUnit;

  let conversionFactorSnapshot: number;

  if (enteredUnit === primaryUnit) {
    // Direct base-unit input
    conversionFactorSnapshot = 1;
    return {
      baseQuantityProduced: enteredQuantity,
      conversionFactorSnapshot,
      primaryUnit,
    };
  }

  // Alternate unit: must match salesUnit
  if (salesUnit && enteredUnit === salesUnit) {
    conversionFactorSnapshot = toNumericConversionFactor(variant.conversionFactor);

    if (!Number.isFinite(conversionFactorSnapshot) || conversionFactorSnapshot <= 0) {
      throw new ValidationError(
        `Invalid conversion factor (${conversionFactorSnapshot}) for unit ${enteredUnit}`,
      );
    }

    const baseQuantityProduced = enteredQuantity * conversionFactorSnapshot;
    return {
      baseQuantityProduced,
      conversionFactorSnapshot,
      primaryUnit,
    };
  }

  throw new ValidationError(
    `Entered unit "${enteredUnit}" is not valid for this product. Expected "${primaryUnit}" or "${salesUnit ?? 'N/A'}".`,
  );
}
