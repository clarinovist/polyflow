import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { resolveProductionRecipeVariant } from '../packaging-bom-resolver';
describe('brand stock vs core recipe identity', () => {
    it('resolves different stock brands to one recipe, preserving unmapped products', async () => {
        const findUnique = vi.fn(async ({ where }: { where: { outputVariantId: string } }) =>
            ['brand-a', 'brand-b'].includes(where.outputVariantId) ? { baseVariantId: 'base' } : null);
        const db = { productionPackagingOption: { findUnique } } as unknown as Prisma.TransactionClient;
        expect(await resolveProductionRecipeVariant(db, 'brand-a')).toBe('base');
        expect(await resolveProductionRecipeVariant(db, 'brand-b')).toBe('base');
        expect(await resolveProductionRecipeVariant(db, 'plain')).toBe('plain');
    });
});
