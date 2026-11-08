import { describe, expect, it } from 'vitest';
import {
    CONVERSION_COST_LABEL,
    readConversionCost,
    setConversionCost,
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

    it('reports multi with the summed per-output total for several costs', () => {
        const stage = stageWith([fixedCost, percentCost]);

        const state = readConversionCost(stage, { c1: 650, c2: 50 });

        expect(state).toEqual({ mode: 'multi', value: 700 });
    });

    it('reports multi for a single cost that is not fixed-per-output', () => {
        const stage = stageWith([percentCost]);

        const state = readConversionCost(stage, { c2: 80 });

        expect(state).toEqual({ mode: 'multi', value: 80 });
    });

    it('returns a null total when the result is missing', () => {
        const stage = stageWith([fixedCost, percentCost]);

        expect(readConversionCost(stage, undefined).value).toBeNull();
        expect(readConversionCost(stage, null).value).toBeNull();
    });

    it('returns a null total when any component is null or absent', () => {
        const stage = stageWith([fixedCost, percentCost]);

        expect(readConversionCost(stage, { c1: 650, c2: null }).value).toBeNull();
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
        const stage = stageWith([fixedCost, percentCost]);

        const next = setConversionCost(stage, 1, newId);

        expect(next).toBe(stage);
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
