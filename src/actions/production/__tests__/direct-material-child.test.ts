import { describe, expect, it, vi } from 'vitest';
import { createChildProductionOrder } from '../production-child';
const mocks = vi.hoisted(() => ({ parent: vi.fn(), bom: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({
    requirePlanningRole: vi.fn().mockResolvedValue({ user: { id: 'planner' } }),
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        $transaction: (fn: (tx: object) => unknown) =>
            fn({
                productionOrder: { findUnique: mocks.parent },
                bom: { findFirst: mocks.bom },
            }),
    },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({ logger: { error: vi.fn() } }));
describe('direct order child creation guard', () => {
    it('does not create an automatic child at the parent output instead of the per-material source', async () => {
        mocks.parent.mockResolvedValue({
            materialConsumptionMode: 'DIRECT',
            location: {
                id: 'fg',
                name: 'FG',
                slug: 'fg_warehouse',
                locationPurpose: 'FINISHED_GOOD',
            },
        });
        mocks.bom.mockResolvedValue(null);
        const result = await createChildProductionOrder('po', 'goods', 5);
        expect(result).toMatchObject({
            success: false,
            code: 'DIRECT_MATERIAL_ORDER',
        });
        expect(mocks.bom).not.toHaveBeenCalled();
    });
});