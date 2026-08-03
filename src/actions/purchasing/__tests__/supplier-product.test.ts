import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
    const transactionClient = {
        supplierProduct: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
        },
        productVariant: {
            update: vi.fn(),
        },
    };
    const mockPrisma = {
        ...transactionClient,
        $transaction: vi.fn(
            async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
                callback(transactionClient),
        ),
    };
    return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
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
    BusinessRuleError: class BusinessRuleError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'BusinessRuleError';
        }
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { requireAuth } from '@/lib/tools/auth-checks';
import {
    linkSupplierToProduct,
    unlinkSupplierFromProduct,
    getSupplierProducts,
    getProductSuppliers,
    setPreferredSupplier,
} from '../supplier-product';

function mockSession(role: string) {
    return {
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as any;
}

describe('supplier-product action authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.supplierProduct.findMany.mockResolvedValue([]);
        mockPrisma.supplierProduct.findUnique.mockResolvedValue(null);
    });

    describe('linkSupplierToProduct (mutation)', () => {
        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            mockPrisma.supplierProduct.upsert.mockResolvedValue({});
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PROCUREMENT'));
            mockPrisma.supplierProduct.upsert.mockResolvedValue({});
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(true);
        });

        it('rejects PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(false);
        });

        it('rejects WAREHOUSE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(false);
        });

        it('rejects HRD', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('HRD'));
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(false);
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(false);
        });

        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const res = await linkSupplierToProduct({
                supplierId: 's1',
                productVariantId: 'pv1',
                isPreferred: false,
            });
            expect(res.success).toBe(false);
        });
    });

    describe('unlinkSupplierFromProduct (mutation)', () => {
        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            mockPrisma.supplierProduct.findUnique.mockResolvedValue({
                id: 'sp1',
                isPreferred: false,
                supplierId: 's1',
                productVariantId: 'pv1',
            });
            mockPrisma.supplierProduct.delete.mockResolvedValue({});
            const res = await unlinkSupplierFromProduct('sp1');
            expect(res.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PROCUREMENT'));
            mockPrisma.supplierProduct.findUnique.mockResolvedValue({
                id: 'sp1',
                isPreferred: false,
                supplierId: 's1',
                productVariantId: 'pv1',
            });
            mockPrisma.supplierProduct.delete.mockResolvedValue({});
            const res = await unlinkSupplierFromProduct('sp1');
            expect(res.success).toBe(true);
        });

        it('rejects PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            const res = await unlinkSupplierFromProduct('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const res = await unlinkSupplierFromProduct('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const res = await unlinkSupplierFromProduct('sp1');
            expect(res.success).toBe(false);
        });
    });

    describe('getSupplierProducts (read)', () => {
        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PROCUREMENT'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(true);
        });

        it('allows PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(true);
        });

        it('rejects FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(false);
        });

        it('rejects WAREHOUSE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(false);
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(false);
        });

        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const res = await getSupplierProducts('s1');
            expect(res.success).toBe(false);
        });
    });

    describe('getProductSuppliers (read)', () => {
        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const res = await getProductSuppliers('pv1');
            expect(res.success).toBe(true);
        });

        it('allows PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            const res = await getProductSuppliers('pv1');
            expect(res.success).toBe(true);
        });

        it('rejects FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const res = await getProductSuppliers('pv1');
            expect(res.success).toBe(false);
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            const res = await getProductSuppliers('pv1');
            expect(res.success).toBe(false);
        });

        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const res = await getProductSuppliers('pv1');
            expect(res.success).toBe(false);
        });
    });

    describe('setPreferredSupplier (mutation)', () => {
        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            mockPrisma.supplierProduct.findUnique.mockResolvedValue({
                id: 'sp1',
                isPreferred: false,
                supplierId: 's1',
                productVariantId: 'pv1',
            });
            mockPrisma.supplierProduct.updateMany.mockResolvedValue({});
            mockPrisma.supplierProduct.update.mockResolvedValue({});
            mockPrisma.productVariant.update.mockResolvedValue({});
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PROCUREMENT'));
            mockPrisma.supplierProduct.findUnique.mockResolvedValue({
                id: 'sp1',
                isPreferred: false,
                supplierId: 's1',
                productVariantId: 'pv1',
            });
            mockPrisma.supplierProduct.updateMany.mockResolvedValue({});
            mockPrisma.supplierProduct.update.mockResolvedValue({});
            mockPrisma.productVariant.update.mockResolvedValue({});
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(true);
        });

        it('rejects PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects WAREHOUSE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects HRD', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('HRD'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });

        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            const res = await setPreferredSupplier('sp1');
            expect(res.success).toBe(false);
        });
    });
});
