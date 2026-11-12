import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import { voiceCommandSchema, type VoiceCommand } from '../voice-commands';
import {
    applyVoiceCommands,
    resolveByName,
    validateAppliedScenario,
} from '../voice-apply';
import {
    OWNER_HPP_LIMITS,
    OWNER_HPP_WORKSPACE_VERSION,
    parseOwnerHppWorkspace,
    type OwnerHppScenario,
    type OwnerHppWorkspace,
} from '../workspace-schema';

function counter() {
    let next = 0;
    return () => `v${++next}`;
}

function cmd(input: Record<string, unknown>): VoiceCommand {
    return voiceCommandSchema.parse({ heard: 'ucapan', ...input });
}

function run(commands: VoiceCommand[], scenario = chainScenario(), active = 'ext') {
    return applyVoiceCommands(scenario, active, commands, counter());
}

function stageOf(scenario: OwnerHppScenario, id: string) {
    const stage = scenario.stages.find((entry) => entry.id === id);
    if (!stage) throw new Error(`stage ${id} missing`);
    return stage;
}

function asWorkspace(scenario: OwnerHppScenario): OwnerHppWorkspace {
    return { version: OWNER_HPP_WORKSPACE_VERSION, scenarios: [scenario] };
}

describe('applyVoiceCommands', () => {
    it('set_output changes quantity and unit of the active stage', () => {
        const result = run([cmd({ op: 'set_output', qty: 500, unit: 'kg' })]);

        expect(stageOf(result.scenario, 'ext')).toMatchObject({ outputQty: 500, outputUnit: 'KG' });
        expect(result.lines[0].text).toContain('500 KG');
        expect(result.lines[0].heard).toBe('ucapan');
    });

    it('add_material appends a raw row with the spoken values', () => {
        const result = run([
            cmd({ op: 'add_material', name: 'Benang', unit: 'kg', qty: 120, price: 14500, scrapPercent: 3 }),
        ]);

        const added = stageOf(result.scenario, 'ext').materials.at(-1);
        expect(added).toMatchObject({
            kind: 'raw', name: 'Benang', unit: 'KG', qty: 120, price: 14500, scrapPercent: 3, erpPrice: null,
        });
        expect(result.lines[0].text).toBe('+ Bahan Benang 120 KG @ Rp 14.500, scrap 3%');
    });

    it('add_material without scrap defaults to zero and leaves it out of the line', () => {
        const result = run([cmd({ op: 'add_material', name: 'Benang', unit: 'KG', qty: 1, price: 2 })]);

        expect(stageOf(result.scenario, 'ext').materials.at(-1)).toMatchObject({ scrapPercent: 0 });
        expect(result.lines[0].text).not.toContain('scrap');
    });

    it('update_material patches only the said fields of the matched row', () => {
        const result = run([cmd({ op: 'update_material', name: 'resin', price: 15250 })]);

        const resin = stageOf(result.scenario, 'ext').materials.find((m) => m.id === 'm1');
        expect(resin).toMatchObject({ price: 15250, qty: 0.92 });
    });

    it('remove_material deletes the matched row', () => {
        const result = run([cmd({ op: 'remove_material', name: 'Kalsium' })]);

        expect(stageOf(result.scenario, 'ext').materials.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('add_cost builds each formula with its fields', () => {
        const result = run([
            cmd({ op: 'add_cost', label: 'Sewa', formula: 'fixed-per-output', value: 300 }),
            cmd({ op: 'add_cost', label: 'Gas', formula: 'quantity-times-unit-cost', quantity: 2, unitCost: 5000, unit: 'tabung' }),
            cmd({
                op: 'add_cost', label: 'Mesin', category: 'conversion', formula: 'batch-cost-per-good-output',
                batchQuantity: 1, costPerBatchUnit: 100000, goodOutputQuantity: 500, batchUnit: 'shift',
            }),
            cmd({ op: 'add_cost', label: 'Overhead tambahan', formula: 'percentage-of-pre-overhead', percentage: 2.5 }),
        ]);

        const costs = stageOf(result.scenario, 'ext').costs.slice(-4);
        expect(costs[0]).toMatchObject({ label: 'Sewa', value: 300, category: 'conversion' });
        expect(costs[1]).toMatchObject({ quantity: 2, unitCost: 5000, unit: 'tabung' });
        expect(costs[2]).toMatchObject({ batchQuantity: 1, costPerBatchUnit: 100000, goodOutputQuantity: 500 });
        expect(costs[3]).toMatchObject({ percentage: 2.5 });
        expect(costs[3]).not.toHaveProperty('category');
        expect(parseOwnerHppWorkspace(asWorkspace(result.scenario)).success).toBe(true);
    });

    it('update_cost changes matching fields and warns when none apply', () => {
        const ok = run([cmd({ op: 'update_cost', label: 'Listrik', value: 700 })]);
        const none = run([cmd({ op: 'update_cost', label: 'Listrik', percentage: 5 })]);

        expect(stageOf(ok.scenario, 'ext').costs.find((c) => c.id === 'c1')).toMatchObject({ value: 700 });
        expect(none.warnings[0]).toContain('tidak punya kolom');
        expect(none.lines).toEqual([]);
    });

    it('remove_cost deletes the matched cost', () => {
        const result = run([cmd({ op: 'remove_cost', label: 'Tenaga kerja' })]);

        expect(stageOf(result.scenario, 'ext').costs.map((c) => c.id)).toEqual(['c1', 'c3']);
    });

    it('set_sell_price replaces the selling price', () => {
        const result = run([cmd({ op: 'set_sell_price', price: 21000 })]);

        expect(result.scenario.sellPrice).toBe(21000);
    });

    it('add_stage appends a stage, selects it and later commands go there', () => {
        const result = run([
            cmd({ op: 'add_stage', name: 'Cetak', outputUnit: 'pcs', outputQty: 10 }),
            cmd({ op: 'add_material', name: 'Tinta', unit: 'L', qty: 1, price: 5 }),
        ]);

        expect(result.scenario.stages).toHaveLength(4);
        const added = result.scenario.stages[3];
        expect(added).toMatchObject({ name: 'Cetak', outputUnit: 'PCS', outputQty: 10 });
        expect(result.activeStageId).toBe(added.id);
        expect(added.materials).toHaveLength(1);
        expect(parseOwnerHppWorkspace(asWorkspace(result.scenario)).success).toBe(true);
    });

    it('add_stage defaults the unit to KG and quantity to 1', () => {
        const result = run([cmd({ op: 'add_stage', name: 'Cetak' })]);

        expect(result.scenario.stages[3]).toMatchObject({ outputUnit: 'KG', outputQty: 1 });
    });

    it('select_stage switches the active stage by partial name', () => {
        const result = run([cmd({ op: 'select_stage', stage: 'pack' })]);

        expect(result.activeStageId).toBe('pack');
    });

    it('stage field redirects a command to a named stage', () => {
        const result = run([cmd({ op: 'set_output', qty: 9, stage: 'Packing' })]);

        expect(stageOf(result.scenario, 'pack').outputQty).toBe(9);
        expect(stageOf(result.scenario, 'ext').outputQty).toBe(1);
    });

    it('skips an unknown name with a warning and keeps going', () => {
        const result = run([
            cmd({ op: 'remove_material', name: 'Tidak ada' }),
            cmd({ op: 'set_sell_price', price: 5 }),
        ]);

        expect(result.warnings[0]).toContain('tidak ditemukan');
        expect(result.lines).toHaveLength(1);
        expect(result.scenario.sellPrice).toBe(5);
    });

    it('skips an ambiguous name instead of guessing', () => {
        const result = run([cmd({ op: 'remove_material', name: 's' })]);

        expect(result.warnings[0]).toContain('cocok dengan beberapa');
        expect(stageOf(result.scenario, 'ext').materials).toHaveLength(3);
    });

    it('skips a command aimed at an unknown stage', () => {
        const result = run([cmd({ op: 'set_output', qty: 3, stage: 'Gudang' })]);

        expect(result.warnings[0]).toContain('Tahap "Gudang" tidak ditemukan');
    });

    it('stops adding materials at the limit', () => {
        const base = chainScenario();
        const filled: OwnerHppScenario = {
            ...base,
            stages: base.stages.map((stage) =>
                stage.id === 'ext'
                    ? {
                          ...stage,
                          materials: Array.from({ length: OWNER_HPP_LIMITS.maxMaterials }, (_v, i) => ({
                              id: `f${i}`, kind: 'raw' as const, name: `B${i}`, unit: 'KG',
                              qty: 1, scrapPercent: 0, price: 1, erpPrice: null,
                          })),
                      }
                    : stage,
            ),
        };

        const result = run([cmd({ op: 'add_material', name: 'Lagi', unit: 'KG', qty: 1, price: 1 })], filled);

        expect(result.warnings[0]).toContain('sudah penuh');
        expect(stageOf(result.scenario, 'ext').materials).toHaveLength(OWNER_HPP_LIMITS.maxMaterials);
    });

    it('stops adding costs and stages at their limits', () => {
        const base = chainScenario();
        const fullCosts: OwnerHppScenario = {
            ...base,
            stages: base.stages.map((stage) =>
                stage.id === 'ext'
                    ? {
                          ...stage,
                          costs: Array.from({ length: OWNER_HPP_LIMITS.maxCosts }, (_v, i) => ({
                              id: `k${i}`, label: `K${i}`, formula: 'fixed-per-output' as const,
                              category: 'conversion' as const, value: 1,
                          })),
                      }
                    : stage,
            ),
        };
        const fullStages: OwnerHppScenario = {
            ...base,
            stages: Array.from({ length: OWNER_HPP_LIMITS.maxStages }, (_v, i) => ({
                ...base.stages[0], id: `s${i}`, name: `S${i}`, materials: [], costs: [],
            })),
            finalStageId: 's0',
        };

        const costResult = run(
            [cmd({ op: 'add_cost', label: 'X', formula: 'fixed-per-output', value: 1 })],
            fullCosts,
        );
        const stageResult = run([cmd({ op: 'add_stage', name: 'Baru' })], fullStages, 's0');

        expect(costResult.warnings[0]).toContain('sudah penuh');
        expect(stageResult.warnings[0]).toContain('sudah penuh');
        expect(stageResult.scenario.stages).toHaveLength(OWNER_HPP_LIMITS.maxStages);
    });

    it('never mutates the input scenario', () => {
        const scenario = chainScenario();
        const before = JSON.stringify(scenario);

        run([
            cmd({ op: 'add_material', name: 'Benang', unit: 'KG', qty: 1, price: 1 }),
            cmd({ op: 'update_material', name: 'Resin', qty: 2 }),
            cmd({ op: 'remove_cost', label: 'Listrik' }),
            cmd({ op: 'add_stage', name: 'Baru' }),
            cmd({ op: 'set_sell_price', price: 1 }),
        ], scenario);

        expect(JSON.stringify(scenario)).toBe(before);
    });

    it('produces a scenario that passes the workspace validation', () => {
        const result = run([
            cmd({ op: 'add_material', name: 'Benang', unit: 'kg', qty: 120, price: 14500, scrapPercent: 3 }),
            cmd({ op: 'update_cost', label: 'Listrik', value: 700 }),
            cmd({ op: 'set_sell_price', price: 21000 }),
        ]);

        expect(validateAppliedScenario(asWorkspace(chainScenario()), result.scenario).success).toBe(true);
    });
});

describe('validateAppliedScenario', () => {
    it('reports an invalid result instead of accepting it', () => {
        const broken: OwnerHppScenario = { ...chainScenario(), finalStageId: 'hilang' };

        const check = validateAppliedScenario(asWorkspace(chainScenario()), broken);

        expect(check.success).toBe(false);
    });
});

describe('resolveByName', () => {
    const items = ['Resin', 'Resin bekas', 'Kalsium'];

    it('prefers an exact match over partial ones', () => {
        expect(resolveByName(items, (x) => x, ' resin ')).toEqual({ kind: 'found', item: 'Resin' });
    });

    it('accepts a unique partial match', () => {
        expect(resolveByName(items, (x) => x, 'kals')).toEqual({ kind: 'found', item: 'Kalsium' });
    });

    it('reports ambiguity and absence', () => {
        expect(resolveByName(items, (x) => x, 'res')).toEqual({ kind: 'ambiguous', names: ['Resin', 'Resin bekas'] });
        expect(resolveByName(items, (x) => x, 'xyz')).toEqual({ kind: 'none' });
        expect(resolveByName(items, (x) => x, '  ')).toEqual({ kind: 'none' });
    });
});
