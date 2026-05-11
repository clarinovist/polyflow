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
import { Unit } from '@prisma/client';

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
  input: ConversionInput
): Promise<ConversionResult> {
  const { productionOrderId, enteredQuantity, enteredUnit } = input;

  // Fetch the output variant's unit config
  const order = await prisma.productionOrder.findUnique({
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
    throw new Error('Production order or BOM not found');
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
    conversionFactorSnapshot = Number(variant.conversionFactor);

    if (conversionFactorSnapshot <= 0) {
      throw new Error(
        `Invalid conversion factor (${conversionFactorSnapshot}) for unit ${enteredUnit} on variant`
      );
    }

    const baseQuantityProduced = enteredQuantity * conversionFactorSnapshot;
    return {
      baseQuantityProduced,
      conversionFactorSnapshot,
      primaryUnit,
    };
  }

  throw new Error(
    `Entered unit "${enteredUnit}" is not valid for this product. ` +
      `Expected "${primaryUnit}" or "${salesUnit ?? 'N/A'}".`
  );
}
