import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import {
    OWNER_HPP_LIMITS,
    OWNER_HPP_WORKSPACE_VERSION,
    parseOwnerHppWorkspace,
} from '../workspace-schema';

function workspace(scenario = chainScenario()) {
    return { version: OWNER_HPP_WORKSPACE_VERSION, scenarios: [scenario] };
}

describe('parseOwnerHppWorkspace', () => {
    it('accepts a valid multi-stage workspace', () => {
        const result = parseOwnerHppWorkspace(workspace());

        expect(result.success).toBe(true);
    });

    it('rejects an unknown version', () => {
        const result = parseOwnerHppWorkspace({ ...workspace(), version: 1 });

        expect(result.success).toBe(false);
    });

    it('rejects negative and non-finite numbers', () => {
        const negative = chainScenario();
        const stages = negative.stages.map((stage, index) =>
            index === 0
                ? {
                      ...stage,
                      materials: stage.materials.map((material) =>
                          material.kind === 'raw'
                              ? { ...material, price: -1 }
                              : material,
                      ),
                  }
                : stage,
        );
        const infinite = chainScenario({ sellPrice: Number.POSITIVE_INFINITY });

        expect(
            parseOwnerHppWorkspace(workspace({ ...negative, stages })).success,
        ).toBe(false);
        expect(parseOwnerHppWorkspace(workspace(infinite)).success).toBe(false);
    });

    it('rejects a zero output quantity and a zero selling price', () => {
        const base = chainScenario();
        const zeroOutput = chainScenario({
            stages: base.stages.map((stage, index) =>
                index === 0 ? { ...stage, outputQty: 0 } : stage,
            ),
        });

        expect(parseOwnerHppWorkspace(workspace(zeroOutput)).success).toBe(
            false,
        );
        expect(
            parseOwnerHppWorkspace(workspace(chainScenario({ sellPrice: 0 })))
                .success,
        ).toBe(false);
    });

    it('rejects duplicate stage ids and a missing final stage', () => {
        const base = chainScenario();
        const duplicate = chainScenario({
            stages: [base.stages[0], { ...base.stages[1], id: 'ext' }],
            finalStageId: 'ext',
        });

        expect(parseOwnerHppWorkspace(workspace(duplicate)).success).toBe(false);
        expect(
            parseOwnerHppWorkspace(
                workspace(chainScenario({ finalStageId: 'nope' })),
            ).success,
        ).toBe(false);
    });

    it('rejects a cyclic stage graph with a readable message', () => {
        const base = chainScenario();
        const cyclic = chainScenario({
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

        const result = parseOwnerHppWorkspace(workspace(cyclic));

        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toMatch(/siklus/i);
    });

    it('rejects ids with unsafe characters', () => {
        const base = chainScenario();
        const unsafe = chainScenario({
            stages: base.stages.map((stage, index) =>
                index === 0 ? { ...stage, id: 'a b/../c' } : stage,
            ),
        });

        expect(parseOwnerHppWorkspace(workspace(unsafe)).success).toBe(false);
    });

    it('rejects documents above the size limit', () => {
        const base = chainScenario();
        const bulky = chainScenario({
            stages: base.stages.map((stage, index) =>
                index === 0
                    ? {
                          ...stage,
                          materials: Array.from(
                              { length: OWNER_HPP_LIMITS.maxMaterials + 1 },
                              (_, i) => ({
                                  id: `x${i}`,
                                  kind: 'raw' as const,
                                  name: 'x'.repeat(80),
                                  unit: 'KG',
                                  qty: 1,
                                  scrapPercent: 0,
                                  price: 1,
                                  erpPrice: null,
                              }),
                          ),
                      }
                    : stage,
            ),
        });

        expect(parseOwnerHppWorkspace(workspace(bulky)).success).toBe(false);
        expect(
            parseOwnerHppWorkspace({
                version: OWNER_HPP_WORKSPACE_VERSION,
                scenarios: [],
                pad: 'x'.repeat(OWNER_HPP_LIMITS.maxDocumentBytes),
            }),
        ).toEqual({ success: false, error: 'Dokumen terlalu besar.' });
    });

    it('rejects non-object input', () => {
        expect(parseOwnerHppWorkspace(null).success).toBe(false);
        expect(parseOwnerHppWorkspace('x').success).toBe(false);
    });
});
