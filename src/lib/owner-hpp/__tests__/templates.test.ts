import { describe, expect, it } from 'vitest';
import { calculateScenario } from '../calculate-chain';
import { createExtrusionTemplateScenario } from '../templates';
import { setConversionCost } from '../conversion-cost';
import {
    OWNER_HPP_WORKSPACE_VERSION,
    parseOwnerHppWorkspace,
    type OwnerHppScenario,
} from '../workspace-schema';

function counter() {
    let next = 0;
    return () => `t${++next}`;
}

const REFERENCE_PRICES = [15500, 14700, 26000, 14000];
const LABOUR_PER_KG = 2000;

function withReferenceInputs(scenario: OwnerHppScenario): OwnerHppScenario {
    const [stage] = scenario.stages;
    const priced = stage.materials.map((material, index) =>
        material.kind === 'raw'
            ? { ...material, price: REFERENCE_PRICES[index] }
            : material,
    );
    const withLabour = setConversionCost(
        { ...stage, materials: priced },
        LABOUR_PER_KG,
        () => 'labour1',
    );
    return { ...scenario, stages: [withLabour] };
}

describe('createExtrusionTemplateScenario', () => {
    it('passes workspace validation', () => {
        const scenario = createExtrusionTemplateScenario(counter());

        const parsed = parseOwnerHppWorkspace({
            version: OWNER_HPP_WORKSPACE_VERSION,
            scenarios: [scenario],
        });

        expect(parsed.success).toBe(true);
    });

    it('builds one 100 kg stage with four materials at 25% scrap and 10% overhead', () => {
        const scenario = createExtrusionTemplateScenario(counter());

        const [stage] = scenario.stages;
        expect(scenario.name).toBe('Ekstrusi HDPE');
        expect(scenario.stages).toHaveLength(1);
        expect(scenario.finalStageId).toBe(stage.id);
        expect(stage).toMatchObject({ name: 'Ekstrusi HDPE', outputUnit: 'kg', outputQty: 100 });
        expect(stage.materials.map((m) => (m.kind === 'raw' ? [m.name, m.qty] : null))).toEqual([
            ['HD PE', 69],
            ['PE', 30],
            ['Pewarna', 0.5],
            ['Pelembab', 0.5],
        ]);
        expect(stage.materials.every((m) => m.scrapPercent === 25)).toBe(true);
        expect(stage.materials.every((m) => m.kind === 'raw' && m.price === 0 && m.erpPrice === null)).toBe(true);
        expect(stage.costs).toEqual([
            expect.objectContaining({ formula: 'percentage-of-pre-overhead', percentage: 10 }),
        ]);
    });

    it('starts with empty prices and one merged warning', () => {
        const scenario = createExtrusionTemplateScenario(counter());

        const [stage] = calculateScenario(scenario).stages;

        expect(stage.warnings).toEqual(['4 bahan masih belum berharga.']);
    });

    it('gives the worksheet HPP once prices and labour are filled in', () => {
        const scenario = withReferenceInputs(createExtrusionTemplateScenario(counter()));

        const result = calculateScenario(scenario);

        // (1.530.500 * 1,25 / 100 + 2.000) * 1,10
        expect(result.error).toBeNull();
        expect(result.finalHpp).toBeCloseTo(23244.375, 6);
    });

    it('creates a new scenario each time without reusing ids', () => {
        const makeId = counter();

        const first = createExtrusionTemplateScenario(makeId);
        const second = createExtrusionTemplateScenario(makeId);

        expect(first.id).not.toBe(second.id);
        expect(first.stages[0].id).not.toBe(second.stages[0].id);
    });
});
