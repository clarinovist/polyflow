export type ProductionExecutionMode =
    | 'GENERIC'
    | 'INDIVIDUAL_OUTPUT'
    | 'MATERIAL_CONVERSION';

export const GENERIC_MODE: ProductionExecutionMode = 'GENERIC';

/**
 * Resolves a persisted executionModeSnapshot (nullable) to a safe runtime mode.
 *
 * null/undefined/unknown/empty strings all fall back to GENERIC so legacy SPK
 * and unknown values never break the kiosk.
 */
export function resolveKioskMode(
    executionModeSnapshot: string | null | undefined,
): ProductionExecutionMode {
    if (
        executionModeSnapshot === 'INDIVIDUAL_OUTPUT' ||
        executionModeSnapshot === 'INDIVIDU_OUTPUT'
    ) {
        return 'INDIVIDUAL_OUTPUT';
    }
    if (executionModeSnapshot === 'MATERIAL_CONVERSION') {
        return executionModeSnapshot;
    }
    return GENERIC_MODE;
}

export interface MaterialPreview {
    requiredQty: number;
    unit: string;
}

/**
 * Estimates WIP material required for a given output quantity using the BOM
 * recipe ratio: inputQty * bomItemQuantity / bomOutputQuantity.
 *
 * Returns null when any input is non-positive or NaN. Unit passes through from
 * the BOM item's primary unit.
 */
export function computeMaterialPreview(
    inputQty: number,
    bomOutputQuantity: number,
    bomItemQuantity: number,
    bomItemPrimaryUnit: string,
): MaterialPreview | null {
    const qty = Number(inputQty);
    const outputQty = Number(bomOutputQuantity);
    const itemQty = Number(bomItemQuantity);

    if (!Number.isFinite(qty) || !Number.isFinite(outputQty) || !Number.isFinite(itemQty)) {
        return null;
    }
    if (qty <= 0 || outputQty <= 0 || itemQty <= 0) {
        return null;
    }

    return {
        requiredQty: (qty * itemQty) / outputQty,
        unit: bomItemPrimaryUnit,
    };
}
