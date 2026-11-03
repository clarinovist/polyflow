import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    readDefault: vi.fn(),
    workspaceFindUnique: vi.fn(),
    workspaceUpsert: vi.fn(),
    bomFindMany: vi.fn(),
}));

vi.mock('@/actions/production/hpp-price-simulator-query', () => ({
    readHppPriceSimulatorDefault: mocks.readDefault,
}));

import { ValidationError } from '@/lib/errors/errors';
import { chainScenario } from '@/lib/owner-hpp/__tests__/fixtures';
import {
    ERP_CHAIN_MAX_DEPTH,
    readOwnerHppErpNodes,
    readOwnerHppWorkspace,
    writeOwnerHppWorkspace,
} from '../owner-hpp-query';

const db = {
    ownerHppWorkspace: {
        findUnique: mocks.workspaceFindUnique,
        upsert: mocks.workspaceUpsert,
    },
    bom: { findMany: mocks.bomFindMany },
} as never;

const manual = (value: number | null) => ({
    mode: 'default' as const,
    defaultSnapshot: { value, metadata: { source: 'bom' as const } },
});

function dto(
    variantId: string,
    materials: Array<{ id: string; cost?: number | null; qty?: number }> = [],
) {
    return {
        variant: {
            id: variantId,
            name: `Produk ${variantId}`,
            skuCode: variantId,
            primaryOutputUnit: 'KG',
        },
        bom: { id: `bom-${variantId}`, name: `BOM ${variantId}`, outputQuantity: manual(1) },
        materials: materials.map((material) => ({
            id: `i-${variantId}-${material.id}`,
            productVariantId: material.id,
            name: `Bahan ${material.id}`,
            skuCode: material.id,
            primaryUnit: 'KG',
            quantity: manual(material.qty ?? 1),
            scrapPercentage: manual(0),
            unitCost: manual(material.cost === undefined ? 1000 : material.cost),
            costSource: 'inventory_average',
            costCandidates: {},
            costWarnings: [],
        })),
    };
}

describe('readOwnerHppWorkspace', () => {
    beforeEach(() => vi.resetAllMocks());

    it('returns a fresh workspace when nothing is stored', async () => {
        mocks.workspaceFindUnique.mockResolvedValue(null);

        const result = await readOwnerHppWorkspace(db, 'u1');

        expect(result.isStored).toBe(false);
        expect(result.workspace.scenarios).toHaveLength(1);
        expect(result.notice).toBeNull();
        expect(mocks.workspaceFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: 'u1' } }),
        );
    });

    it('returns the stored workspace when it is valid', async () => {
        const stored = { version: 2, scenarios: [chainScenario()] };
        const updatedAt = new Date('2026-11-03T07:00:00Z');
        mocks.workspaceFindUnique.mockResolvedValue({ document: stored, updatedAt });

        const result = await readOwnerHppWorkspace(db, 'u1');

        expect(result.isStored).toBe(true);
        expect(result.workspace).toEqual(stored);
        expect(result.updatedAt).toBe(updatedAt.toISOString());
        expect(result.notice).toBeNull();
    });

    it('falls back to a blank workspace with a notice when the stored JSON is invalid', async () => {
        mocks.workspaceFindUnique.mockResolvedValue({
            document: { version: 99 },
            updatedAt: new Date('2026-11-03T07:00:00Z'),
        });

        const result = await readOwnerHppWorkspace(db, 'u1');

        expect(result.workspace.scenarios).toHaveLength(1);
        expect(result.notice).toMatch(/tidak valid/i);
    });
});

describe('writeOwnerHppWorkspace', () => {
    beforeEach(() => vi.resetAllMocks());

    it('upserts the document for that user only', async () => {
        const updatedAt = new Date('2026-11-03T08:00:00Z');
        mocks.workspaceUpsert.mockResolvedValue({ updatedAt });
        const workspace = { version: 2 as const, scenarios: [chainScenario()] };

        const result = await writeOwnerHppWorkspace(db, 'u1', workspace);

        expect(result.updatedAt).toBe(updatedAt.toISOString());
        const call = mocks.workspaceUpsert.mock.calls[0][0];
        expect(call.where).toEqual({ userId: 'u1' });
        expect(call.create).toEqual({ userId: 'u1', document: workspace });
        expect(call.update).toEqual({ document: workspace });
    });
});

describe('readOwnerHppErpNodes', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.bomFindMany.mockResolvedValue([]);
    });

    it('walks default BOMs from the root down through intermediate products', async () => {
        mocks.readDefault.mockImplementation(async (_db, id: string) =>
            ({
                pack: dto('pack', [{ id: 'roll' }, { id: 'karung' }]),
                roll: dto('roll', [{ id: 'resin' }]),
            })[id] ?? null,
        );
        mocks.bomFindMany.mockImplementation(async ({ where }) =>
            (where.productVariantId.in as string[])
                .filter((id) => id === 'roll')
                .map((id) => ({ productVariantId: id })),
        );

        const nodes = await readOwnerHppErpNodes(db, 'pack');

        expect([...nodes.keys()]).toEqual(['pack', 'roll']);
        expect(nodes.get('pack')?.materials.map((m) => m.variantId)).toEqual([
            'roll',
            'karung',
        ]);
        expect(nodes.get('roll')?.materials[0]).toMatchObject({
            variantId: 'resin',
            unitCost: 1000,
            quantity: 1,
        });
        // One BOM read per node that has a default BOM, not one per material.
        expect(mocks.readDefault).toHaveBeenCalledTimes(2);
    });

    it('returns no nodes when the root has no default BOM', async () => {
        mocks.readDefault.mockResolvedValue(null);

        const nodes = await readOwnerHppErpNodes(db, 'x');

        expect(nodes.size).toBe(0);
    });

    it('does not loop on a cyclic BOM', async () => {
        mocks.readDefault.mockImplementation(async (_db, id: string) =>
            id === 'a' ? dto('a', [{ id: 'b' }]) : dto('b', [{ id: 'a' }]),
        );
        mocks.bomFindMany.mockImplementation(async ({ where }) =>
            (where.productVariantId.in as string[]).map((id) => ({
                productVariantId: id,
            })),
        );

        const nodes = await readOwnerHppErpNodes(db, 'a');

        expect([...nodes.keys()].sort()).toEqual(['a', 'b']);
    });

    it('stops at the maximum depth', async () => {
        mocks.readDefault.mockImplementation(async (_db, id: string) => {
            const n = Number(id.slice(1));
            return dto(id, [{ id: `n${n + 1}` }]);
        });
        mocks.bomFindMany.mockImplementation(async ({ where }) =>
            (where.productVariantId.in as string[]).map((id) => ({
                productVariantId: id,
            })),
        );

        const nodes = await readOwnerHppErpNodes(db, 'n0');

        expect(nodes.size).toBe(ERP_CHAIN_MAX_DEPTH + 1);
    });

    it('skips a child whose BOM is invalid instead of failing the chain', async () => {
        mocks.readDefault.mockImplementation(async (_db, id: string) => {
            if (id === 'roll') throw new ValidationError('BOM rusak');
            return dto('pack', [{ id: 'roll' }]);
        });
        mocks.bomFindMany.mockImplementation(async () => [
            { productVariantId: 'roll' },
        ]);

        const nodes = await readOwnerHppErpNodes(db, 'pack');

        expect([...nodes.keys()]).toEqual(['pack']);
    });

    it('propagates an invalid root BOM', async () => {
        mocks.readDefault.mockRejectedValue(new ValidationError('BOM rusak'));

        await expect(readOwnerHppErpNodes(db, 'pack')).rejects.toBeInstanceOf(
            ValidationError,
        );
    });
});
