export interface BomItemMassInput {
    productVariantId?: string;
    quantity: number;
    unit?: string | null;
}

export interface BomMassBalanceParams {
    outputQuantity: number;
    outputUnit?: string | null;
    items: BomItemMassInput[];
}

export type BomMassEvaluation =
    | {
          status: 'ok';
          totalInputKg: number;
          outputKg: number;
      }
    | {
          status: 'skip';
          reason: 'non-kg-output' | 'no-kg-ingredients';
          outputUnit?: string | null;
      }
    | {
          status: 'output-exceeds-input';
          totalInputKg: number;
          outputKg: number;
          message: string;
      }
    | {
          status: 'high-shrinkage';
          totalInputKg: number;
          outputKg: number;
          shrinkagePercent: number;
          message: string;
      };

/**
 * Evaluates mass balance conservation for a Bill of Materials.
 *
 * Rules:
 * 1. Only applies mass conservation checks when output unit is 'KG'.
 * 2. Sums mass ONLY from ingredients whose primary unit is 'KG' (ignores PCS, KARTON, ROLL, etc.).
 * 3. Returns 'skip' if output is non-KG or if no KG ingredients are present.
 * 4. Returns 'output-exceeds-input' if output KG > total input KG.
 * 5. Returns 'high-shrinkage' if total input KG > output KG * 1.2 (>20% shrinkage).
 */
export function evaluateBomMassBalance({
    outputQuantity,
    outputUnit,
    items,
}: BomMassBalanceParams): BomMassEvaluation {
    const isKgOutput = outputUnit?.trim().toUpperCase() === 'KG';

    if (!isKgOutput) {
        return {
            status: 'skip',
            reason: 'non-kg-output',
            outputUnit,
        };
    }

    const kgItems = items.filter(
        (item) => item.unit?.trim().toUpperCase() === 'KG',
    );

    if (kgItems.length === 0) {
        return {
            status: 'skip',
            reason: 'no-kg-ingredients',
            outputUnit,
        };
    }

    const totalInputKg = kgItems.reduce(
        (acc, item) => acc + Number(item.quantity || 0),
        0,
    );
    const outputKg = Number(outputQuantity || 0);

    if (outputKg > totalInputKg) {
        return {
            status: 'output-exceeds-input',
            totalInputKg,
            outputKg,
            message: `Target output (${outputKg.toLocaleString()} KG) lebih besar dari total input material (${totalInputKg.toLocaleString()} KG).`,
        };
    }

    if (totalInputKg > outputKg * 1.2) {
        const shrinkagePercent = ((totalInputKg - outputKg) / totalInputKg) * 100;
        return {
            status: 'high-shrinkage',
            totalInputKg,
            outputKg,
            shrinkagePercent,
            message: `Total material input (${totalInputKg.toLocaleString()} KG) lebih dari 20% di atas target output (${outputKg.toLocaleString()} KG). Implied shrinkage: ${shrinkagePercent.toFixed(1)}%.`,
        };
    }

    return {
        status: 'ok',
        totalInputKg,
        outputKg,
    };
}
