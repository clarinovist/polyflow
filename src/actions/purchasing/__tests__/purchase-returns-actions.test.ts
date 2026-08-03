import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReturnService } = vi.hoisted(() => {
    const mockReturnService = {
        getReturns: vi.fn(),
        getReturnById: vi.fn(),
        createReturn: vi.fn(),
        updateReturn: vi.fn(),
        confirmReturn: vi.fn(),
        shipReturn: vi.fn(),
        completeReturn: vi.fn(),
        cancelReturn: vi.fn(),
    };
    return { mockReturnService };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true as const, data };
        } catch (e) {
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
}));
vi.mock('@/services/purchasing/returns-service', () => ({
    PurchaseReturnService: mockReturnService,
}));
vi.mock('@/lib/schemas/returns', () => ({
    createPurchaseReturnSchema: { parse: (d: unknown) => d },
    updatePurchaseReturnSchema: { parse: (d: unknown) => d },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequirePurchasingAccess = vi.fn();

vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingAccess: (...args: unknown[]) =>
        mockRequirePurchasingAccess(...args),
    requirePurchasingApprover: vi.fn(),
    requirePurchasingFinance: vi.fn(),
    requirePurchasingCreator: vi.fn(),
    requirePurchasingAnalyticsRead: vi.fn(),
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

import {
    getPurchaseReturns,
    getPurchaseReturnById,
    createPurchaseReturnAction,
    updatePurchaseReturnAction,
    confirmPurchaseReturnAction,
    shipPurchaseReturnAction,
    completePurchaseReturnAction,
    cancelPurchaseReturnAction,
} from '../purchase-returns';

function session(userId: string, roles: string[]) {
    return {
        user: { id: userId, name: `User ${userId}`, role: roles[0], roles },
    } as any;
}

describe('purchase-returns.ts action auth', () => {
    beforeEach(() => vi.clearAllMocks());

    // ─── Read actions ───
    describe('getPurchaseReturns', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await getPurchaseReturns();
            expect(result.success).toBe(false);
        });

        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['ADMIN']),
            );
            mockReturnService.getReturns.mockResolvedValue([]);
            const result = await getPurchaseReturns();
            expect(result.success).toBe(true);
        });
    });

    describe('getPurchaseReturnById', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await getPurchaseReturnById('r-1');
            expect(result.success).toBe(false);
        });

        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['PLANNING']),
            );
            mockReturnService.getReturnById.mockResolvedValue({ id: 'r-1' });
            const result = await getPurchaseReturnById('r-1');
            expect(result.success).toBe(true);
        });
    });

    // ─── Mutation actions ───
    const mutations: [
        string,
        (...args: any[]) => Promise<any>,
        any[],
    ][] = [
        ['createPurchaseReturnAction', createPurchaseReturnAction, [{ supplierId: 's-1', items: [] }]],
        ['updatePurchaseReturnAction', updatePurchaseReturnAction, [{ id: 'r-1', items: [] }]],
        ['confirmPurchaseReturnAction', confirmPurchaseReturnAction, ['r-1']],
        ['shipPurchaseReturnAction', shipPurchaseReturnAction, ['r-1']],
        ['completePurchaseReturnAction', completePurchaseReturnAction, ['r-1']],
        ['cancelPurchaseReturnAction', cancelPurchaseReturnAction, ['r-1']],
    ];

    for (const [name, fn, args] of mutations) {
        describe(name, () => {
            it('rejects when no session', async () => {
                mockRequirePurchasingAccess.mockRejectedValue(
                    new Error('Unauthorized'),
                );
                const result = await fn(...args);
                expect(result.success).toBe(false);
            });

            it('allows PROCUREMENT', async () => {
                mockRequirePurchasingAccess.mockResolvedValue(
                    session('u1', ['PROCUREMENT']),
                );
                const mockMethods: Record<string, any> = {
                    createPurchaseReturnAction: mockReturnService.createReturn,
                    updatePurchaseReturnAction: mockReturnService.updateReturn,
                    confirmPurchaseReturnAction: mockReturnService.confirmReturn,
                    shipPurchaseReturnAction: mockReturnService.shipReturn,
                    completePurchaseReturnAction: mockReturnService.completeReturn,
                    cancelPurchaseReturnAction: mockReturnService.cancelReturn,
                };
                mockMethods[name].mockResolvedValue({ id: 'r-1' });
                const result = await fn(...args);
                expect(result.success).toBe(true);
            });

            it('rejects FINANCE', async () => {
                mockRequirePurchasingAccess.mockRejectedValue(
                    new Error(
                        'Unauthorized: Akses purchasing hanya untuk admin, procurement, atau planning.',
                    ),
                );
                const result = await fn(...args);
                expect(result.success).toBe(false);
            });
        });
    }
});
