import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'user-1' } })),
}));

vi.mock('@/services/production/bom-cost-cascade-service', () => ({
    BomCostCascadeService: {
        cascadeFromVariants: vi.fn(async () => ({ updatedCount: 1 })),
    },
}));

vi.mock('@/lib/core/prisma', () => {
    const mockPrisma = {
        productVariant: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                if (where.id === 'missing-variant') return null;
                return { standardCost: { toNumber: () => 100 } };
            }),
            update: vi.fn(async ({ where, data }: { where: { id: string }; data: { standardCost: number } }) => ({
                id: where.id,
                standardCost: data.standardCost,
            })),
        },
        costHistory: {
            create: vi.fn(async () => ({ id: 'history-1' })),
        },
        $transaction: vi.fn(async (input: unknown) => {
            if (typeof input === 'function') {
                return (input as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
            }
            return input;
        }),
    };

    return {
        prisma: mockPrisma,
    };
});

import { prisma } from '@/lib/core/prisma';
import { BomCostCascadeService } from '@/services/production/bom-cost-cascade-service';
import { updateStandardCost } from './cost-history';

describe('updateStandardCost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('triggers cascade for non-BOM reasons without transaction client', async () => {
        const result = await updateStandardCost('variant-1', 123, 'MANUAL', 'manual-ref');

        expect(result.success).toBe(true);
        expect(BomCostCascadeService.cascadeFromVariants).toHaveBeenCalledWith({
            rootVariantIds: ['variant-1'],
            defaultOnly: true,
            referenceId: 'cost-update:manual-ref',
            userId: 'user-1',
        });
    });

    it('does not trigger cascade for BOM_UPDATE reason', async () => {
        const result = await updateStandardCost('variant-2', 150, 'BOM_UPDATE', 'bom-ref');

        expect(result.success).toBe(true);
        expect(BomCostCascadeService.cascadeFromVariants).not.toHaveBeenCalled();
    });

    it('triggers cascade when tx is provided for non-BOM reasons', async () => {
        const tx = prisma as unknown as import('@prisma/client').Prisma.TransactionClient;
        const result = await updateStandardCost('variant-3', 175, 'PURCHASE_GR', 'gr-ref', tx);

        expect(result.success).toBe(true);
        expect(BomCostCascadeService.cascadeFromVariants).toHaveBeenCalledWith({
            rootVariantIds: ['variant-3'],
            defaultOnly: true,
            referenceId: 'cost-update:gr-ref',
            userId: 'user-1',
            tx,
        });
    });

    it('does not trigger cascade when skipCascade option is enabled', async () => {
        const result = await updateStandardCost('variant-4', 180, 'IMPORT', 'import-ref', undefined, { skipCascade: true });

        expect(result.success).toBe(true);
        expect(BomCostCascadeService.cascadeFromVariants).not.toHaveBeenCalled();
    });
});