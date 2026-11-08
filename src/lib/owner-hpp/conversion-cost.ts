import { updateCost, type IdFactory } from './workspace-edit';
import {
    OWNER_HPP_LIMITS,
    type OwnerHppCost,
    type OwnerHppStage,
} from './workspace-schema';

/**
 * The simple screen shows every cost of a stage as ONE "conversion cost":
 * - none:   the stage has no costs yet; typing creates one fixed cost.
 * - single: exactly one fixed-per-output cost; typing edits it.
 * - multi:  anything else; the total is shown read-only and the cost lines
 *           stay untouched (they are edited under "Lanjutan").
 */
type ConversionMode = 'none' | 'single' | 'multi';

export interface ConversionCostState {
    mode: ConversionMode;
    /** none: 0. single: the stored value. multi: total per output, null if unknown. */
    value: number | null;
}

export const CONVERSION_COST_LABEL = 'Biaya konversi';

function isFixedPerOutput(
    cost: OwnerHppCost,
): cost is Extract<OwnerHppCost, { formula: 'fixed-per-output' }> {
    return cost.formula === 'fixed-per-output';
}

function sumCosts(
    stage: OwnerHppStage,
    costById: Readonly<Record<string, number | null>> | null | undefined,
): number | null {
    if (!costById) return null;
    let total = 0;
    for (const cost of stage.costs) {
        const amount = costById[cost.id];
        if (amount === null || amount === undefined) return null;
        total += amount;
    }
    return total;
}

export function readConversionCost(
    stage: OwnerHppStage,
    costById: Readonly<Record<string, number | null>> | null | undefined,
): ConversionCostState {
    if (stage.costs.length === 0) return { mode: 'none', value: 0 };
    const [only] = stage.costs;
    if (stage.costs.length === 1 && isFixedPerOutput(only)) {
        return { mode: 'single', value: only.value };
    }
    return { mode: 'multi', value: sumCosts(stage, costById) };
}

function isAcceptableValue(value: number): boolean {
    return (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= OWNER_HPP_LIMITS.maxNumber
    );
}

function newConversionCost(id: string, value: number): OwnerHppCost {
    return {
        id,
        label: CONVERSION_COST_LABEL,
        formula: 'fixed-per-output',
        category: 'conversion',
        value,
    };
}

/**
 * Returns the stage with the conversion cost set. Invalid values, multi mode
 * and a zero on an empty stage return the same stage (no change, no dirty flag).
 */
export function setConversionCost(
    stage: OwnerHppStage,
    value: number,
    makeId: IdFactory,
): OwnerHppStage {
    if (!isAcceptableValue(value)) return stage;
    const { mode } = readConversionCost(stage, null);
    if (mode === 'multi') return stage;
    if (mode === 'single')
        return updateCost(stage, stage.costs[0].id, { value });
    if (value === 0) return stage;
    return { ...stage, costs: [newConversionCost(makeId(), value)] };
}
