import { removeCost, updateCost, type IdFactory } from './workspace-edit';
import {
    OWNER_HPP_LIMITS,
    type OwnerHppCost,
    type OwnerHppStage,
} from './workspace-schema';

/**
 * The simple screen splits a stage's costs in two fields:
 *
 * Conversion cost (every NON-percentage cost):
 * - none:   no such cost yet; typing creates one fixed cost.
 * - single: exactly one fixed-per-output cost; typing edits it.
 * - multi:  anything else; the total is shown read-only and the cost lines
 *           stay untouched (they are edited under "Lanjutan").
 *
 * Overhead % (the percentage-of-pre-overhead costs): none, single (one cost,
 * editable) or multi (read-only; edited under "Lanjutan").
 *
 * Percentage costs never count as conversion cost, and fixed/other costs never
 * count as overhead, so editing one field never touches the other's lines.
 */
type FieldMode = 'none' | 'single' | 'multi';

export interface ConversionCostState {
    mode: FieldMode;
    /** none: 0. single: the stored value. multi: total per output, null if unknown. */
    value: number | null;
}

export interface OverheadPercentState {
    mode: FieldMode;
    /** none: 0. single: the stored percent. multi: the percents added up. */
    value: number;
    /** How many percentage cost lines the stage holds. */
    count: number;
}

export const CONVERSION_COST_LABEL = 'Biaya konversi';
export const OVERHEAD_COST_LABEL = 'Overhead';

type PercentageCost = Extract<
    OwnerHppCost,
    { formula: 'percentage-of-pre-overhead' }
>;

function isFixedPerOutput(
    cost: OwnerHppCost,
): cost is Extract<OwnerHppCost, { formula: 'fixed-per-output' }> {
    return cost.formula === 'fixed-per-output';
}

function isPercentage(cost: OwnerHppCost): cost is PercentageCost {
    return cost.formula === 'percentage-of-pre-overhead';
}

function isNotPercentage(cost: OwnerHppCost): boolean {
    return !isPercentage(cost);
}

function sumCosts(
    costs: readonly OwnerHppCost[],
    costById: Readonly<Record<string, number | null>> | null | undefined,
): number | null {
    if (!costById) return null;
    let total = 0;
    for (const cost of costs) {
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
    const costs = stage.costs.filter(isNotPercentage);
    if (costs.length === 0) return { mode: 'none', value: 0 };
    const [only] = costs;
    if (costs.length === 1 && isFixedPerOutput(only)) {
        return { mode: 'single', value: only.value };
    }
    return { mode: 'multi', value: sumCosts(costs, costById) };
}

/** Number of cost lines the conversion field covers (all but percentages). */
export function countConversionCosts(stage: OwnerHppStage): number {
    return stage.costs.filter(isNotPercentage).length;
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

function hasRoomForCost(stage: OwnerHppStage): boolean {
    return stage.costs.length < OWNER_HPP_LIMITS.maxCosts;
}

/**
 * Returns the stage with the conversion cost set. Invalid values, multi mode,
 * a full cost list and a zero on a stage without one return the same stage
 * (no change, no dirty flag). Percentage costs are left where they are.
 */
export function setConversionCost(
    stage: OwnerHppStage,
    value: number,
    makeId: IdFactory,
): OwnerHppStage {
    if (!isAcceptableValue(value)) return stage;
    const { mode } = readConversionCost(stage, null);
    if (mode === 'multi') return stage;
    if (mode === 'single') {
        const target = stage.costs.find(isNotPercentage) as OwnerHppCost;
        return updateCost(stage, target.id, { value });
    }
    if (value === 0 || !hasRoomForCost(stage)) return stage;
    return {
        ...stage,
        costs: [...stage.costs, newConversionCost(makeId(), value)],
    };
}

export function readOverheadPercent(
    stage: OwnerHppStage,
): OverheadPercentState {
    const costs = stage.costs.filter(isPercentage);
    const value = costs.reduce((total, cost) => total + cost.percentage, 0);
    if (costs.length === 0) return { mode: 'none', value: 0, count: 0 };
    return {
        mode: costs.length === 1 ? 'single' : 'multi',
        value,
        count: costs.length,
    };
}

function isAcceptablePercent(percent: number): boolean {
    return (
        Number.isFinite(percent) &&
        percent >= 0 &&
        percent <= OWNER_HPP_LIMITS.maxOverheadPercent
    );
}

/**
 * Returns the stage with its single overhead cost set to `percent`; 0 removes
 * it. Invalid values, several overhead lines (edit those under "Lanjutan") and
 * a full cost list return the same stage.
 */
export function setOverheadPercent(
    stage: OwnerHppStage,
    percent: number,
    makeId: IdFactory,
): OwnerHppStage {
    if (!isAcceptablePercent(percent)) return stage;
    const { mode } = readOverheadPercent(stage);
    if (mode === 'multi') return stage;
    if (mode === 'single') {
        const target = stage.costs.find(isPercentage) as PercentageCost;
        if (percent === 0) return removeCost(stage, target.id);
        return updateCost(stage, target.id, { percentage: percent });
    }
    if (percent === 0 || !hasRoomForCost(stage)) return stage;
    const cost: OwnerHppCost = {
        id: makeId(),
        label: OVERHEAD_COST_LABEL,
        formula: 'percentage-of-pre-overhead',
        percentage: percent,
    };
    return { ...stage, costs: [...stage.costs, cost] };
}
