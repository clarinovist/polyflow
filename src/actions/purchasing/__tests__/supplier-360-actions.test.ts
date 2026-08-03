import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
    const mockPrisma = {
        purchaseOrder: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        purchaseReturn: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        purchaseInvoice: {
            findMany: vi.fn(),
        },
    };
    return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
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
    listPurchaseOrdersBySupplier,
    listPurchaseReturnsBySupplier,
    listPurchaseInvoicesBySupplier,
    getSupplierPerformanceStats,
    getSupplierSpendingAnalytics,
} from '../supplier-360';

function session(userId: string, roles: string[]) {
    return {
        user: { id: userId, name: `User ${userId}`, role: roles[0], roles },
    } as any;
}

describe('supplier-360.ts action auth', () => {
    beforeEach(() => vi.clearAllMocks());

    const readActions: [string, (id: string) => Promise<any>][] = [
        ['listPurchaseOrdersBySupplier', listPurchaseOrdersBySupplier],
        ['listPurchaseReturnsBySupplier', listPurchaseReturnsBySupplier],
        ['listPurchaseInvoicesBySupplier', listPurchaseInvoicesBySupplier],
        ['getSupplierPerformanceStats', getSupplierPerformanceStats],
        ['getSupplierSpendingAnalytics', getSupplierSpendingAnalytics],
    ];

    for (const [name, fn] of readActions) {
        describe(name, () => {
            it('rejects when no session', async () => {
                mockRequirePurchasingAccess.mockRejectedValue(
                    new Error('Unauthorized'),
                );
                const result = await fn('sup-1');
                expect(result.success).toBe(false);
            });

            it('allows ADMIN', async () => {
                mockRequirePurchasingAccess.mockResolvedValue(
                    session('u1', ['ADMIN']),
                );
                // Minimal DB stubs
                mockPrisma.purchaseOrder.findMany.mockResolvedValue([]);
                mockPrisma.purchaseReturn.findMany.mockResolvedValue([]);
                mockPrisma.purchaseReturn.count.mockResolvedValue(0);

                const result = await fn('sup-1');
                expect(result.success).toBe(true);
            });

            it('allows PROCUREMENT', async () => {
                mockRequirePurchasingAccess.mockResolvedValue(
                    session('u1', ['PROCUREMENT']),
                );
                mockPrisma.purchaseOrder.findMany.mockResolvedValue([]);
                mockPrisma.purchaseReturn.findMany.mockResolvedValue([]);
                mockPrisma.purchaseReturn.count.mockResolvedValue(0);

                const result = await fn('sup-1');
                expect(result.success).toBe(true);
            });

            it('rejects FINANCE (not in read set)', async () => {
                mockRequirePurchasingAccess.mockRejectedValue(
                    new Error(
                        'Unauthorized: Akses purchasing hanya untuk admin, procurement, atau planning.',
                    ),
                );
                const result = await fn('sup-1');
                expect(result.success).toBe(false);
            });
        });
    }
});
