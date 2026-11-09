import { describe, expect, it } from 'vitest';
import {
    CONVERSION_COST_LABEL,
    OVERHEAD_COST_LABEL,
    countConversionCosts,
    readConversionCost,
    readOverheadPercent,
    setConversionCost,
    setOverheadPercent,
} from '../conversion-cost';
import { OWNER_HPP_LIMITS, type OwnerHppStage } from '../workspace-schema';

function stageWith(costs: OwnerHppStage['costs']): OwnerHppStage {
    return {
        id: 's1',
        name: 'Extrusion',
        outputUnit: 'KG',
        outputQty: 1,
        materials: [],
        costs,
    };
}

const fixedCost: OwnerHppStage['costs'][number] = {
    id: 'c1',
    label: 'Listrik',
    formula: 'fixed-per-output',
    category: 'conversion',
    value: 650,
};

const percentCost: OwnerHppStage['costs'][number] = {
    id: 'c2',
    label: 'Overhead',
    formula: 'percentage-of-pre-overhead',
    percentage: 5,
};

const otherFixedCost: OwnerHppStage['costs'][number] = {
    id: 'c3',
    label: 'Tenaga kerja',
    formula: 'fixed-per-output',
    category: 'conversion',
    value: 50,
};

const unitCost: OwnerHppStage['costs'][number] = {
    id: 'c4',
    label: 'Listrik',
    formula: 'quantity-times-unit-cost',
    category: 'conversion',
    quantity: 2,
    unitCost: 40,
    unit: 'kWh',
};

const newId = () => 'new1';

describe('readConversionCost', () => {
    it('reports none with value 0 when the stage has no costs', () => {
        // Arrange
        const stage = stageWith([]);

        // Act
        const state = readConversionCost(stage, {});

        // Assert
        expect(state).toEqual({ mode: 'none', value: 0 });
    });

    it('reports single with the stored value for exactly one fixed-per-output cost', () => {
        const stage = stageWith([fixedCost]);

        const state = readConversionCost(stage, { c1: 123 });

        expect(state).toEqual({ mode: 'single', value: 650 });
    });

    it('keeps single readable when the calculation result is missing', () => {
        const stage = stageWith([fixedCost]);

        expect(readConversionCost(stage, undefined)).toEqual({
            mode: 'single',
            value: 650,
        });
    });

    it('reports multi with the summed per-output total for several non-percentage costs', () => {
        const stage = stageWith([fixedCost, otherFixedCost]);

        const state = readConversionCost(stage, { c1: 650, c3: 50 });

        expect(state).toEqual({ mode: 'multi', value: 700 });
        expect(countConversionCosts(stage)).toBe(2);
    });

    it('reports multi for a single cost that is not fixed-per-output', () => {
        const stage = stageWith([unitCost]);

        const state = readConversionCost(stage, { c4: 80 });

        expect(state).toEqual({ mode: 'multi', value: 80 });
    });

    it('ignores percentage costs, so a fixed cost plus overhead stays single', () => {
        const stage = stageWith([fixedCost, percentCost]);

        const state = readConversionCost(stage, { c1: 650, c2: 50 });

        expect(state).toEqual({ mode: 'single', value: 650 });
    });

    it('reports none when the only cost is a percentage', () => {
        const stage = stageWith([percentCost]);

        expect(readConversionCost(stage, { c2: 80 })).toEqual({
            mode: 'none',
            value: 0,
        });
    });

    it('returns a null total when the result is missing', () => {
        const stage = stageWith([fixedCost, otherFixedCost]);

        expect(readConversionCost(stage, undefined).value).toBeNull();
        expect(readConversionCost(stage, null).value).toBeNull();
    });

    it('returns a null total when any component is null or absent', () => {
        const stage = stageWith([fixedCost, otherFixedCost]);

        expect(readConversionCost(stage, { c1: 650, c3: null }).value).toBeNull();
        expect(readConversionCost(stage, { c1: 650 }).value).toBeNull();
    });
});

describe('setConversionCost', () => {
    it('creates one fixed-per-output conversion cost when the stage has none', () => {
        const stage = stageWith([]);

        const next = setConversionCost(stage, 420, newId);

        expect(next.costs).toEqual([
            {
                id: 'new1',
                label: CONVERSION_COST_LABEL,
                formula: 'fixed-per-output',
                category: 'conversion',
                value: 420,
            },
        ]);
    });

    it('does not create a zero-value cost for an empty stage', () => {
        const stage = stageWith([]);

        expect(setConversionCost(stage, 0, newId)).toBe(stage);
    });

    it('updates the value of the only fixed cost and keeps its label and id', () => {
        const stage = stageWith([fixedCost]);

        const next = setConversionCost(stage, 900, newId);

        expect(next.costs).toEqual([{ ...fixedCost, value: 900 }]);
    });

    it('allows setting the single cost back to zero', () => {
        const stage = stageWith([fixedCost]);

        expect(setConversionCost(stage, 0, newId).costs[0]).toMatchObject({
            value: 0,
        });
    });

    it('never overwrites or deletes costs in multi mode', () => {
        const stage = stageWith([fixedCost, otherFixedCost]);

        const next = setConversionCost(stage, 1, newId);

        expect(next).toBe(stage);
    });

    it('adds the conversion cost next to an existing overhead cost without touching it', () => {
        const stage = stageWith([percentCost]);

        const next = setConversionCost(stage, 2000, newId);

        expect(next.costs).toHaveLength(2);
        expect(next.costs[0]).toBe(percentCost);
        expect(next.costs[1]).toMatchObject({ id: 'new1', value: 2000 });
    });

    it('edits the fixed cost and leaves the overhead cost alone', () => {
        const stage = stageWith([percentCost, fixedCost]);

        const next = setConversionCost(stage, 900, newId);

        expect(next.costs).toEqual([percentCost, { ...fixedCost, value: 900 }]);
    });

    it('never mutates the input stage', () => {
        const stage = stageWith([fixedCost]);
        const snapshot = structuredClone(stage);
        const empty = stageWith([]);
        const emptySnapshot = structuredClone(empty);

        setConversionCost(stage, 900, newId);
        setConversionCost(empty, 900, newId);

        expect(stage).toEqual(snapshot);
        expect(empty).toEqual(emptySnapshot);
    });

    it.each([
        ['negative', -1],
        ['NaN', Number.NaN],
        ['infinite', Number.POSITIVE_INFINITY],
        ['above the limit', OWNER_HPP_LIMITS.maxNumber + 1],
    ])('ignores a %s value', (_name, value) => {
        const stage = stageWith([fixedCost]);

        expect(setConversionCost(stage, value, newId)).toBe(stage);
    });
});

describe('readOverheadPercent', () => {
    it('reports none with 0 when the stage has no percentage cost', () => {
        const stage = stageWith([fixedCost]);

        expect(readOverheadPercent(stage)).toEqual({
            mode: 'none',
            value: 0,
            count: 0,
        });
    });

    it('reports single with the stored percent for one percentage cost', () => {
        const stage = stageWith([fixedCost, percentCost]);

        expect(readOverheadPercent(stage)).toEqual({
            mode: 'single',
            value: 5,
            count: 1,
        });
    });

    it('reports multi with the percents added up for several percentage costs', () => {
        const stage = stageWith([
            percentCost,
            { ...percentCost, id: 'c9', percentage: 3 },
        ]);

        expect(readOverheadPercent(stage)).toEqual({
            mode: 'multi',
            value: 8,
            count: 2,
        });
    });
});

describe('setOverheadPercent', () => {
    it('creates one percentage cost when the stage has none', () => {
        const stage = stageWith([fixedCost]);

        const next = setOverheadPercent(stage, 10, newId);

        expect(next.costs).toEqual([
            fixedCost,
            {
                id: 'new1',
                label: OVERHEAD_COST_LABEL,
                formula: 'percentage-of-pre-overhead',
                percentage: 10,
            },
        ]);
    });

    it('updates the only percentage cost and keeps its id and label', () => {
        const stage = stageWith([percentCost, fixedCost]);

        const next = setOverheadPercent(stage, 12, newId);

        expect(next.costs).toEqual([{ ...percentCost, percentage: 12 }, fixedCost]);
    });

    it('removes the percentage cost when the percent is 0', () => {
        const stage = stageWith([fixedCost, percentCost]);

        const next = setOverheadPercent(stage, 0, newId);

        expect(next.costs).toEqual([fixedCost]);
    });

    it('does not create a cost for 0 on a stage without overhead', () => {
        const stage = stageWith([fixedCost]);

        expect(setOverheadPercent(stage, 0, newId)).toBe(stage);
    });

    it('leaves the stage alone when several percentage costs exist', () => {
        const stage = stageWith([
            percentCost,
            { ...percentCost, id: 'c9', percentage: 3 },
        ]);

        expect(setOverheadPercent(stage, 10, newId)).toBe(stage);
        expect(setOverheadPercent(stage, 0, newId)).toBe(stage);
    });

    it.each([
        ['negative', -1],
        ['NaN', Number.NaN],
        ['infinite', Number.POSITIVE_INFINITY],
        ['above the limit', OWNER_HPP_LIMITS.maxOverheadPercent + 1],
    ])('ignores a %s percent', (_name, percent) => {
        const stage = stageWith([percentCost]);

        expect(setOverheadPercent(stage, percent, newId)).toBe(stage);
    });

    it('accepts the maximum allowed percent', () => {
        const stage = stageWith([]);

        const next = setOverheadPercent(stage, OWNER_HPP_LIMITS.maxOverheadPercent, newId);

        expect(next.costs).toHaveLength(1);
    });

    it('does not add a cost when the cost list is full', () => {
        const full = stageWith(
            Array.from({ length: OWNER_HPP_LIMITS.maxCosts }, (_, index) => ({
                ...otherFixedCost,
                id: `f${index}`,
            })),
        );

        expect(setOverheadPercent(full, 10, newId)).toBe(full);
    });

    it('never mutates the input stage', () => {
        const stage = stageWith([fixedCost, percentCost]);
        const snapshot = structuredClone(stage);

        setOverheadPercent(stage, 0, newId);
        setOverheadPercent(stage, 20, newId);

        expect(stage).toEqual(snapshot);
    });
});
