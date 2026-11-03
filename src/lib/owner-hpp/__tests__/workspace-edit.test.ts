import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import { parseOwnerHppWorkspace } from '../workspace-schema';
import {
    addCost,
    addRawMaterial,
    addStage,
    addStageLink,
    applyErpChain,
    availableUpstreamStages,
    createDefaultWorkspace,
    duplicateScenario,
    removeStage,
    updateMaterial,
} from '../workspace-edit';

function counter() {
    let next = 0;
    return () => `id${++next}`;
}

describe('createDefaultWorkspace', () => {
    it('is a valid workspace with one empty stage', () => {
        const workspace = createDefaultWorkspace(counter());

        expect(parseOwnerHppWorkspace(workspace).success).toBe(true);
        expect(workspace.scenarios[0].stages).toHaveLength(1);
        expect(workspace.scenarios[0].finalStageId).toBe(
            workspace.scenarios[0].stages[0].id,
        );
    });
});

describe('stage editing', () => {
    it('adds a stage without changing the original scenario', () => {
        const before = chainScenario();

        const after = addStage(before, counter());

        expect(after.stages).toHaveLength(4);
        expect(before.stages).toHaveLength(3);
        expect(after.finalStageId).toBe(before.finalStageId);
    });

    it('removes a stage together with every link that pointed at it', () => {
        const scenario = removeStage(chainScenario(), 'cut');

        expect(scenario.stages.map((stage) => stage.id)).toEqual(['ext', 'pack']);
        const pack = scenario.stages.find((stage) => stage.id === 'pack');
        expect(pack?.materials).toEqual([]);
        expect(parseOwnerHppWorkspace({ version: 2, scenarios: [scenario] }).success).toBe(true);
    });

    it('moves the final stage when the final stage is removed', () => {
        const scenario = removeStage(chainScenario(), 'pack');

        expect(scenario.finalStageId).toBe('cut');
    });

    it('keeps the last remaining stage', () => {
        const single = { ...chainScenario(), stages: [chainScenario().stages[0]], finalStageId: 'ext' };

        expect(removeStage(single, 'ext').stages).toHaveLength(1);
    });
});

describe('material and cost editing', () => {
    it('adds a raw material with an empty ERP price', () => {
        const stage = addRawMaterial(chainScenario().stages[0], counter());

        const added = stage.materials[stage.materials.length - 1];
        expect(added).toMatchObject({ kind: 'raw', price: 0, erpPrice: null });
    });

    it('adds a link to an upstream stage', () => {
        const stage = addStageLink(chainScenario().stages[2], 'ext', counter());

        expect(stage.materials[stage.materials.length - 1]).toMatchObject({
            kind: 'stage',
            from: 'ext',
            qty: 1,
        });
    });

    it('updates one material without touching the others', () => {
        const before = chainScenario().stages[0];

        const after = updateMaterial(before, 'm1', { price: 15000 });

        expect(after.materials[0]).toMatchObject({ price: 15000 });
        expect(after.materials[1]).toEqual(before.materials[1]);
    });

    it('adds each cost formula in a valid default shape', () => {
        const ids = counter();
        let stage = chainScenario().stages[0];
        for (const formula of [
            'fixed-per-output',
            'quantity-times-unit-cost',
            'batch-cost-per-good-output',
            'percentage-of-pre-overhead',
        ] as const) {
            stage = addCost(stage, formula, ids);
        }
        const scenario = { ...chainScenario(), stages: [stage], finalStageId: 'ext' };

        expect(
            parseOwnerHppWorkspace({ version: 2, scenarios: [scenario] }).success,
        ).toBe(true);
    });
});

describe('availableUpstreamStages', () => {
    it('excludes the stage itself and every stage that depends on it', () => {
        const scenario = chainScenario();

        expect(availableUpstreamStages(scenario, 'ext').map((s) => s.id)).toEqual([]);
        expect(availableUpstreamStages(scenario, 'cut').map((s) => s.id)).toEqual(['ext']);
        expect(availableUpstreamStages(scenario, 'pack').map((s) => s.id)).toEqual(['ext', 'cut']);
    });
});

describe('duplicateScenario', () => {
    it('copies the scenario under a new id and a distinct name', () => {
        const copy = duplicateScenario(chainScenario(), counter());

        expect(copy.id).not.toBe('sc1');
        expect(copy.name).toBe('Standar (salinan)');
        expect(copy.stages).toEqual(chainScenario().stages);
    });

    it('keeps the copied name within the length limit', () => {
        const copy = duplicateScenario(
            { ...chainScenario(), name: 'x'.repeat(80) },
            counter(),
        );

        expect(copy.name.length).toBeLessThanOrEqual(80);
    });
});

describe('applyErpChain', () => {
    it('replaces stages and final stage but keeps name and selling price', () => {
        const base = chainScenario();
        const stages = [base.stages[0]];

        const next = applyErpChain(base, { stages, finalStageId: 'ext', warnings: [] });

        expect(next.stages).toEqual(stages);
        expect(next.finalStageId).toBe('ext');
        expect(next.name).toBe(base.name);
        expect(next.sellPrice).toBe(base.sellPrice);
    });

    it('ignores an empty chain', () => {
        const base = chainScenario();

        const next = applyErpChain(base, { stages: [], finalStageId: '', warnings: [] });

        expect(next).toBe(base);
    });
});

describe('changeCostFormula', () => {
    it('switches the formula, keeps id and label, and stays valid', async () => {
        const { changeCostFormula } = await import('../workspace-edit');
        const stage = chainScenario().stages[0];

        const next = changeCostFormula(stage, 'c1', 'batch-cost-per-good-output');

        const changed = next.costs.find((cost) => cost.id === 'c1');
        expect(changed).toMatchObject({
            id: 'c1',
            label: 'Listrik',
            formula: 'batch-cost-per-good-output',
        });
        expect(next.costs).toHaveLength(stage.costs.length);
        const scenario = { ...chainScenario(), stages: [next], finalStageId: 'ext' };
        expect(parseOwnerHppWorkspace({ version: 2, scenarios: [scenario] }).success).toBe(true);
    });
});
