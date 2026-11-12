import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    adjustStock,
    adjustStockBulk,
    transferStockBulk,
    updateThreshold,
} from '../inventory';
import { InventoryMovementService } from '@/services/inventory/movement-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));

vi.mock('@/services/inventory/movement-service', () => ({
    InventoryMovementService: {
        adjustStock: vi.fn(),
        adjustStockBulk: vi.fn(),
        transferStockBulk: vi.fn(),
    },
}));

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: { updateThreshold: vi.fn() },
}));

vi.mock('@/services/inventory/query-service', () => ({
    InventoryQueryService: {},
}));

vi.mock('@/services/inventory/analytics-service', () => ({}));

vi.mock('@/services/inventory/stock-ledger-service', () => ({
    getStockLedger: vi.fn(),
}));

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

const sessionFor = (role: string, roles: string[] = [role]) => ({
    user: { id: 'u-1', role, roles },
});

// Deliberately schema-invalid payloads: the role guard must fire before
// validation, and an allowed role then fails on validation (success=false)
// without reaching the service. The service-call assertions below use that.
const actions: Array<[string, () => Promise<{ success: boolean }>]> = [
    ['adjustStock', () => adjustStock({} as never) as never],
    ['adjustStockBulk', () => adjustStockBulk({} as never) as never],
    ['transferStockBulk', () => transferStockBulk({} as never) as never],
    ['updateThreshold', () => updateThreshold('pv-1', 5) as never],
];

function expectNoServiceCall() {
    expect(InventoryMovementService.adjustStock).not.toHaveBeenCalled();
    expect(InventoryMovementService.adjustStockBulk).not.toHaveBeenCalled();
    expect(InventoryMovementService.transferStockBulk).not.toHaveBeenCalled();
    expect(InventoryCoreService.updateThreshold).not.toHaveBeenCalled();
}

describe('inventory write actions — read-only FACTORY_MANAGER', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(actions)(
        '%s rejects FACTORY_MANAGER without ADMIN with the role message',
        async (_name, run) => {
            asMock(requireAuth).mockResolvedValue(
                sessionFor('FACTORY_MANAGER'),
            );

            const result = (await run()) as {
                success: boolean;
                error?: string;
                code?: string;
            };

            expect(result.success).toBe(false);
            expect(result.code).toBe('AUTHORIZATION_ERROR');
            expect(result.error).toMatch(/Kepala pabrik/);
            expectNoServiceCall();
        },
    );

    it('updateThreshold allows FACTORY_MANAGER that also has ADMIN', async () => {
        asMock(requireAuth).mockResolvedValue(
            sessionFor('FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']),
        );

        const result = await updateThreshold('pv-1', 5);

        expect(result.success).toBe(true);
        expect(InventoryCoreService.updateThreshold).toHaveBeenCalledWith(
            'pv-1',
            5,
        );
    });

    it.each(['PRODUCTION', 'WAREHOUSE', 'HRD'])(
        'updateThreshold is unaffected for %s',
        async (role) => {
            asMock(requireAuth).mockResolvedValue(sessionFor(role));

            const result = await updateThreshold('pv-1', 5);

            expect(result.success).toBe(true);
            expect(InventoryCoreService.updateThreshold).toHaveBeenCalledTimes(
                1,
            );
        },
    );

    it.each(['adjustStock', 'adjustStockBulk', 'transferStockBulk'])(
        '%s passes the role guard for ADMIN (fails later on validation only)',
        async (name) => {
            asMock(requireAuth).mockResolvedValue(sessionFor('ADMIN'));
            const run = actions.find(([n]) => n === name)![1];

            const result = (await run()) as { code?: string };

            expect(result.code).toBe('VALIDATION_ERROR');
        },
    );
});
