import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import { calculateScenario } from '../calculate-chain';
import { createDefaultScenario } from '../workspace-edit';

let idCounter = 0;

describe('calculateScenario', () => {
    it('chains stage HPP into the next stage with scrap and conversion costs', () => {
        const result = calculateScenario(chainScenario());

        expect(result.error).toBeNull();
        const byId = Object.fromEntries(
            result.stages.map((stage) => [stage.stageId, stage]),
        );
        expect(byId.ext.hppPerOutput).toBeCloseTo(16453.5, 6);
        expect(byId.cut.hppPerOutput).toBeCloseTo(17696.175, 6);
        expect(byId.pack.hppPerOutput).toBeCloseTo(17912.175, 6);
        expect(result.finalHpp).toBeCloseTo(17912.175, 6);
        expect(result.finalUnit).toBe('KG');
    });

    it('splits the final HPP into per-stage contributions that add up to 100%', () => {
        const result = calculateScenario(chainScenario());
        const byId = Object.fromEntries(
            result.stages.map((stage) => [stage.stageId, stage]),
        );

        expect(byId.ext.contributionPct).toBeCloseTo(91.86, 1);
        expect(byId.cut.contributionPct).toBeCloseTo(6.94, 1);
        expect(byId.pack.contributionPct).toBeCloseTo(1.21, 1);
        const total = result.stages.reduce(
            (sum, stage) => sum + (stage.contributionPct ?? 0),
            0,
        );
        expect(total).toBeCloseTo(100, 6);
    });

    it('computes profit and margin on the selling price', () => {
        const result = calculateScenario(chainScenario());

        expect(result.profitPerOutput).toBeCloseTo(2587.825, 6);
        expect(result.marginPercent).toBeCloseTo(12.6235, 3);
    });

    it('reports no margin when there is no selling price', () => {
        const result = calculateScenario(chainScenario({ sellPrice: null }));

        expect(result.finalHpp).toBeCloseTo(17912.175, 6);
        expect(result.profitPerOutput).toBeNull();
        expect(result.marginPercent).toBeNull();
    });

    it('recomputes downstream stages when an upstream price changes', () => {
        const base = chainScenario();
        const changed = chainScenario({
            stages: base.stages.map((stage) =>
                stage.id === 'ext'
                    ? {
                          ...stage,
                          materials: stage.materials.map((material) =>
                              material.kind === 'raw' && material.id === 'm1'
                                  ? { ...material, price: 15000 }
                                  : material,
                          ),
                      }
                    : stage,
            ),
        });

        const before = calculateScenario(base).finalHpp as number;
        const after = calculateScenario(changed).finalHpp as number;

        // +500/kg resin * 0.92 kg, through 5% overhead then 5% cut scrap.
        expect(after - before).toBeCloseTo(0.92 * 500 * 1.05 * 1.05, 6);
    });

    it('weights contributions when a stage feeds the next one at a ratio', () => {
        const scenario = chainScenario({
            stages: chainScenario().stages.map((stage) =>
                stage.id === 'pack'
                    ? {
                          ...stage,
                          outputQty: 2,
                          materials: [
                              {
                                  id: 'm5',
                                  kind: 'stage' as const,
                                  from: 'cut',
                                  qty: 1,
                                  scrapPercent: 0,
                              },
                          ],
                      }
                    : stage,
            ),
        });

        const result = calculateScenario(scenario);
        const total = result.stages.reduce(
            (sum, stage) => sum + (stage.contributionPct ?? 0),
            0,
        );

        // 1 unit of "cut" per 2 output units halves what flows through.
        // Materials are divided by the output quantity; fixed-per-output is not.
        expect(result.finalHpp).toBeCloseTo(17696.175 / 2 + 216, 6);
        expect(total).toBeCloseTo(100, 6);
    });

    it('flags stages that do not feed the final stage', () => {
        const scenario = chainScenario({ finalStageId: 'cut' });

        const result = calculateScenario(scenario);
        const pack = result.stages.find((stage) => stage.stageId === 'pack');

        expect(result.finalHpp).toBeCloseTo(17696.175, 6);
        expect(pack?.contributionPct).toBeNull();
    });

    it('blocks downstream stages when an upstream stage is invalid', () => {
        const base = chainScenario();
        const scenario = chainScenario({
            stages: base.stages.map((stage) =>
                stage.id === 'ext' ? { ...stage, outputQty: 0 } : stage,
            ),
        });

        const result = calculateScenario(scenario);
        const byId = Object.fromEntries(
            result.stages.map((stage) => [stage.stageId, stage]),
        );

        expect(byId.ext.status).toBe('blocked');
        expect(byId.cut.status).toBe('blocked');
        expect(result.finalHpp).toBeNull();
    });

    it('returns the graph error for a cyclic scenario', () => {
        const base = chainScenario();
        const scenario = chainScenario({
            stages: base.stages.map((stage) =>
                stage.id === 'ext'
                    ? {
                          ...stage,
                          materials: [
                              {
                                  id: 'loop',
                                  kind: 'stage' as const,
                                  from: 'pack',
                                  qty: 1,
                                  scrapPercent: 0,
                              },
                          ],
                      }
                    : stage,
            ),
        });

        const result = calculateScenario(scenario);

        expect(result.error).toMatch(/siklus/i);
        expect(result.finalHpp).toBeNull();
    });

    it('supports quantity and batch cost formulas', () => {
        const scenario = chainScenario({
            finalStageId: 'ext',
            stages: [
                {
                    id: 'ext',
                    name: 'Extrusion',
                    outputUnit: 'KG',
                    outputQty: 100,
                    materials: [],
                    costs: [
                        {
                            id: 'q',
                            label: 'Listrik',
                            formula: 'quantity-times-unit-cost',
                            category: 'conversion',
                            quantity: 2,
                            unitCost: 1500,
                            unit: 'kWh',
                        },
                        {
                            id: 'b',
                            label: 'Shift',
                            formula: 'batch-cost-per-good-output',
                            category: 'conversion',
                            batchQuantity: 1,
                            costPerBatchUnit: 50000,
                            goodOutputQuantity: 200,
                            batchUnit: 'shift',
                        },
                    ],
                },
            ],
        });

        const result = calculateScenario(scenario);

        // 2 * 1500 + 50000 / 200
        expect(result.finalHpp).toBeCloseTo(3250, 6);
    });

    it('warns about raw materials that still have no price', () => {
        const base = chainScenario();
        const scenario = chainScenario({
            stages: base.stages.map((stage) =>
                stage.id === 'ext'
                    ? {
                          ...stage,
                          materials: stage.materials.map((material) =>
                              material.kind === 'raw' && material.id === 'm3'
                                  ? { ...material, price: 0, erpPrice: null }
                                  : material,
                          ),
                      }
                    : stage,
            ),
        });

        const ext = calculateScenario(scenario).stages.find(
            (stage) => stage.stageId === 'ext',
        );

        expect(ext?.warnings.join(' ')).toMatch(/Kalsium/);
    });

    it('merges several empty-priced materials into one count warning', () => {
        const scenario = createDefaultScenario(() => `id${++idCounter}`);

        const [stage] = calculateScenario(scenario).stages;

        expect(stage.warnings).toEqual(['4 bahan masih belum berharga.']);
    });

    it('keeps the per-name warning when exactly one material is empty', () => {
        const base = createDefaultScenario(() => `id${++idCounter}`);
        const [first, ...rest] = base.stages[0].materials;
        const priced = rest.map((material) =>
            material.kind === 'raw' ? { ...material, price: 100 } : material,
        );
        const scenario = {
            ...base,
            stages: [{ ...base.stages[0], materials: [first, ...priced] }],
        };

        const [stage] = calculateScenario(scenario).stages;

        expect(stage.warnings).toEqual(['Harga "Bahan baru" masih kosong.']);
    });
});
