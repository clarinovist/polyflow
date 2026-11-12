import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addProductionShift, deleteProductionShift } from '../production-shifts';
import { ProductionService } from '@/services/production/production-service';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/core/prisma', () => ({
    prisma: { productionShift: { findMany: vi.fn() } },
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        addShift: vi.fn(),
        deleteShift: vi.fn(),
    },
}));

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

const sessionFor = (role: string, roles: string[] = [role]) => ({
    user: { id: 'u-1', role, roles },
});

const shiftInput = {
    productionOrderId: 'po-1',
    shiftName: 'Shift 1',
    startTime: new Date('2026-11-12T01:00:00Z'),
    endTime: new Date('2026-11-12T09:00:00Z'),
};

describe('production shift write actions — read-only FACTORY_MANAGER', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('addProductionShift rejects FACTORY_MANAGER without ADMIN', async () => {
        asMock(requireAuth).mockResolvedValue(sessionFor('FACTORY_MANAGER'));

        const result = await addProductionShift(shiftInput);

        expect(result.success).toBe(false);
        expect(ProductionService.addShift).not.toHaveBeenCalled();
    });

    it('deleteProductionShift rejects FACTORY_MANAGER without ADMIN', async () => {
        asMock(requireAuth).mockResolvedValue(sessionFor('FACTORY_MANAGER'));

        const result = await deleteProductionShift('s-1', 'po-1');

        expect(result.success).toBe(false);
        expect(ProductionService.deleteShift).not.toHaveBeenCalled();
    });

    it('allows FACTORY_MANAGER that also has ADMIN', async () => {
        asMock(requireAuth).mockResolvedValue(
            sessionFor('FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']),
        );

        const added = await addProductionShift(shiftInput);
        const removed = await deleteProductionShift('s-1', 'po-1');

        expect(added.success).toBe(true);
        expect(removed.success).toBe(true);
        expect(ProductionService.addShift).toHaveBeenCalledTimes(1);
        expect(ProductionService.deleteShift).toHaveBeenCalledTimes(1);
    });

    it.each(['PRODUCTION', 'PLANNING', 'WAREHOUSE', 'HRD'])(
        'role %s is unaffected',
        async (role) => {
            asMock(requireAuth).mockResolvedValue(sessionFor(role));

            const result = await addProductionShift(shiftInput);

            expect(result.success).toBe(true);
            expect(ProductionService.addShift).toHaveBeenCalledTimes(1);
        },
    );
});
