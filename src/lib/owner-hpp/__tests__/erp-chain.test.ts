import { describe, expect, it } from 'vitest';
import {
    OWNER_HPP_LIMITS,
    OWNER_HPP_WORKSPACE_VERSION,
    parseOwnerHppWorkspace,
} from '../workspace-schema';
import { buildStagesFromErp, type ErpBomNode } from '../erp-chain';

const FETCHED_AT = '2026-11-03';

function node(
    variantId: string,
    overrides: Partial<ErpBomNode> = {},
): ErpBomNode {
    return {
        variantId,
        variantName: `Produk ${variantId}`,
        outputUnit: 'KG',
        bomName: `BOM ${variantId}`,
        outputQuantity: 1,
        materials: [],
        ...overrides,
    };
}

function material(
    variantId: string,
    overrides: Partial<ErpBomNode['materials'][number]> = {},
) {
    return {
        variantId,
        name: `Bahan ${variantId}`,
        unit: 'KG',
        quantity: 1,
        scrapPercent: 0,
        unitCost: 1000,
        ...overrides,
    };
}

function asNodes(...nodes: ErpBomNode[]) {
    return new Map(nodes.map((entry) => [entry.variantId, entry]));
}

function validate(result: ReturnType<typeof buildStagesFromErp>) {
    return parseOwnerHppWorkspace({
        version: OWNER_HPP_WORKSPACE_VERSION,
        scenarios: [
            {
                id: 'sc',
                name: 'ERP',
                finalStageId: result.finalStageId,
                sellPrice: null,
                stages: result.stages,
            },
        ],
    });
}

describe('buildStagesFromErp', () => {
    it('turns a mixing -> extrusion -> packing BOM tree into ordered stages', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'pack',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('pack', {
                    outputUnit: 'BAL',
                    materials: [
                        material('roll', { quantity: 10, scrapPercent: 2 }),
                        material('karung', { quantity: 1, unitCost: 1650 }),
                    ],
                }),
                node('roll', { materials: [material('mix', { quantity: 1 })] }),
                node('mix', {
                    materials: [
                        material('resin', { quantity: 0.9, unitCost: 14500 }),
                    ],
                }),
            ),
        });

        expect(result.stages.map((stage) => stage.name)).toEqual([
            'Produk mix',
            'Produk roll',
            'Produk pack',
        ]);
        expect(result.finalStageId).toBe(result.stages[2].id);
        const [mix, roll, pack] = result.stages;
        expect(mix.materials[0]).toMatchObject({
            kind: 'raw',
            name: 'Bahan resin',
            qty: 0.9,
            price: 14500,
            erpPrice: 14500,
            erpAt: FETCHED_AT,
        });
        expect(roll.materials[0]).toMatchObject({
            kind: 'stage',
            from: mix.id,
            qty: 1,
        });
        expect(pack.outputUnit).toBe('BAL');
        expect(pack.materials[0]).toMatchObject({
            kind: 'stage',
            from: roll.id,
            qty: 10,
            scrapPercent: 2,
        });
        expect(pack.materials[1]).toMatchObject({ kind: 'raw', price: 1650 });
        expect(result.warnings).toEqual([]);
        expect(validate(result).success).toBe(true);
    });

    it('keeps the real BOM output quantity per batch', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'roll',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('roll', {
                    outputQuantity: 40,
                    materials: [material('resin', { quantity: 36 })],
                }),
            ),
        });

        expect(result.stages[0].outputQty).toBe(40);
    });

    it('shares one stage between two consumers instead of copying it', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'pack',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('pack', {
                    materials: [material('a'), material('b')],
                }),
                node('a', { materials: [material('mix')] }),
                node('b', { materials: [material('mix')] }),
                node('mix', { materials: [material('resin')] }),
            ),
        });

        expect(result.stages).toHaveLength(4);
        const mixId = result.stages[0].id;
        const consumers = result.stages.filter((stage) =>
            stage.materials.some(
                (entry) => entry.kind === 'stage' && entry.from === mixId,
            ),
        );
        expect(consumers).toHaveLength(2);
        expect(validate(result).success).toBe(true);
    });

    it('treats a BOM cycle as a raw material and warns', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'a',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('a', { materials: [material('b')] }),
                node('b', { materials: [material('a')] }),
            ),
        });

        expect(result.warnings.join(' ')).toMatch(/siklus/i);
        expect(validate(result).success).toBe(true);
    });

    it('stops expanding at the stage cap and warns', () => {
        const total = OWNER_HPP_LIMITS.maxStages + 4;
        const nodes = Array.from({ length: total }, (_, i) =>
            node(`n${i}`, {
                materials:
                    i + 1 < total ? [material(`n${i + 1}`)] : [material('raw')],
            }),
        );

        const result = buildStagesFromErp({
            rootVariantId: 'n0',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(...nodes),
        });

        expect(result.stages).toHaveLength(OWNER_HPP_LIMITS.maxStages);
        expect(result.warnings.join(' ')).toMatch(/batas/i);
        expect(validate(result).success).toBe(true);
    });

    it('marks materials without an ERP cost as empty with a warning', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'roll',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('roll', {
                    materials: [material('resin', { unitCost: null })],
                }),
            ),
        });

        expect(result.stages[0].materials[0]).toMatchObject({
            kind: 'raw',
            price: 0,
            erpPrice: null,
        });
        expect(result.warnings.join(' ')).toMatch(/Bahan resin/);
    });

    it('trims long names and extra materials so the result stays valid', () => {
        const longName = 'x'.repeat(200);
        const result = buildStagesFromErp({
            rootVariantId: 'roll',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(
                node('roll', {
                    variantName: longName,
                    materials: Array.from(
                        { length: OWNER_HPP_LIMITS.maxMaterials + 5 },
                        (_, i) => material(`m${i}`, { name: longName }),
                    ),
                }),
            ),
        });

        expect(result.stages[0].materials).toHaveLength(
            OWNER_HPP_LIMITS.maxMaterials,
        );
        expect(result.warnings.join(' ')).toMatch(/bahan/i);
        expect(validate(result).success).toBe(true);
    });

    it('returns a single empty stage when the root has no BOM', () => {
        const result = buildStagesFromErp({
            rootVariantId: 'x',
            fetchedAt: FETCHED_AT,
            nodes: asNodes(),
        });

        expect(result.stages).toEqual([]);
        expect(result.warnings.join(' ')).toMatch(/BOM/);
    });
});
