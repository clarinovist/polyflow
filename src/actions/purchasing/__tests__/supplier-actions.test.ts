import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const { mockPrisma } = vi.hoisted(() => {
    const mockPrisma = {
        supplier: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        supplierProduct: { count: vi.fn() },
        productVariant: { count: vi.fn() },
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
            if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e;
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

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequirePurchasingAccess = vi.fn();
const mockRequirePurchasingApprover = vi.fn();

vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingAccess: (...args: unknown[]) =>
        mockRequirePurchasingAccess(...args),
    requirePurchasingApprover: (...args: unknown[]) =>
        mockRequirePurchasingApprover(...args),
    requirePurchasingFinance: vi.fn(),
    requirePurchasingCreator: vi.fn(),
    requirePurchasingAnalyticsRead: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/schemas/partner', () => ({
    createSupplierSchema: {
        safeParse: (data: unknown) => ({ success: true, data }),
    },
    updateSupplierSchema: {
        safeParse: (data: unknown) => ({ success: true, data }),
    },
}));

// Import AFTER mocks
import {
    getSuppliers,
    getSupplierById,
    getNextSupplierCode,
    createSupplier,
    updateSupplier,
    deleteSupplier,
} from '../supplier';

function session(userId: string, roles: string[]) {
    return {
        user: { id: userId, name: `User ${userId}`, role: roles[0], roles },
    } as any;
}

describe('supplier.ts action auth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Read actions: requirePurchasingAccess ───

    describe('getSuppliers', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await getSuppliers();
            expect(result.success).toBe(false);
            expect(mockPrisma.supplier.findMany).not.toHaveBeenCalled();
        });

        it('allows ADMIN', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['ADMIN']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            const result = await getSuppliers();
            expect(result.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['PROCUREMENT']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            const result = await getSuppliers();
            expect(result.success).toBe(true);
        });

        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['PLANNING']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            const result = await getSuppliers();
            expect(result.success).toBe(true);
        });

        it('rejects FINANCE (not a purchasing read role)', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error(
                    'Unauthorized: Akses purchasing hanya untuk admin, procurement, atau planning.',
                ),
            );
            const result = await getSuppliers();
            expect(result.success).toBe(false);
        });

        it('rejects WAREHOUSE', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await getSuppliers();
            expect(result.success).toBe(false);
        });
    });

    describe('getSupplierById', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await getSupplierById('s-1');
            expect(result.success).toBe(false);
        });

        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['PROCUREMENT']),
            );
            mockPrisma.supplier.findUnique.mockResolvedValue({
                id: 's-1',
                name: 'Test',
            });
            const result = await getSupplierById('s-1');
            expect(result.success).toBe(true);
        });
    });

    describe('getNextSupplierCode', () => {
        it('rejects when no session (throws)', async () => {
            mockRequirePurchasingAccess.mockRejectedValue(
                new Error('Unauthorized'),
            );
            await expect(getNextSupplierCode()).rejects.toThrow(
                'Unauthorized',
            );
        });

        it('allows PLANNING', async () => {
            mockRequirePurchasingAccess.mockResolvedValue(
                session('u1', ['PLANNING']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            const code = await getNextSupplierCode();
            expect(code).toBe('SUP-001');
        });
    });

    // ─── Mutation actions: requirePurchasingApprover ───

    describe('createSupplier', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await createSupplier({
                name: 'Test Supplier',
            } as any);
            expect(result.success).toBe(false);
            expect(mockPrisma.supplier.create).not.toHaveBeenCalled();
        });

        it('allows ADMIN', async () => {
            mockRequirePurchasingApprover.mockResolvedValue(
                session('u1', ['ADMIN']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            mockPrisma.supplier.findUnique.mockResolvedValue(null);
            mockPrisma.supplier.create.mockResolvedValue({ id: 's-1' });
            const result = await createSupplier({
                name: 'Test Supplier',
            } as any);
            expect(result.success).toBe(true);
        });

        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingApprover.mockResolvedValue(
                session('u1', ['PROCUREMENT']),
            );
            mockPrisma.supplier.findMany.mockResolvedValue([]);
            mockPrisma.supplier.findUnique.mockResolvedValue(null);
            mockPrisma.supplier.create.mockResolvedValue({ id: 's-2' });
            const result = await createSupplier({
                name: 'Supplier B',
            } as any);
            expect(result.success).toBe(true);
        });

        it('rejects PLANNING (not an approver)', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error(
                    'Unauthorized: Hanya admin atau procurement yang dapat melakukan aksi ini.',
                ),
            );
            const result = await createSupplier({
                name: 'Test',
            } as any);
            expect(result.success).toBe(false);
        });

        it('rejects FINANCE', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await createSupplier({
                name: 'Test',
            } as any);
            expect(result.success).toBe(false);
        });
    });

    describe('updateSupplier', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await updateSupplier({
                id: 's-1',
                name: 'Updated',
            } as any);
            expect(result.success).toBe(false);
        });

        it('allows ADMIN', async () => {
            mockRequirePurchasingApprover.mockResolvedValue(
                session('u1', ['ADMIN']),
            );
            mockPrisma.supplier.update.mockResolvedValue({ id: 's-1' });
            const result = await updateSupplier({
                id: 's-1',
                name: 'Updated',
            } as any);
            expect(result.success).toBe(true);
        });

        it('rejects PLANNING', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await updateSupplier({
                id: 's-1',
                name: 'Updated',
            } as any);
            expect(result.success).toBe(false);
        });
    });

    describe('deleteSupplier', () => {
        it('rejects when no session', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await deleteSupplier('s-1');
            expect(result.success).toBe(false);
            expect(mockPrisma.supplier.delete).not.toHaveBeenCalled();
        });

        it('allows PROCUREMENT', async () => {
            mockRequirePurchasingApprover.mockResolvedValue(
                session('u1', ['PROCUREMENT']),
            );
            mockPrisma.supplierProduct.count.mockResolvedValue(0);
            mockPrisma.productVariant.count.mockResolvedValue(0);
            mockPrisma.supplier.delete.mockResolvedValue({ id: 's-1' });
            const result = await deleteSupplier('s-1');
            expect(result.success).toBe(true);
        });

        it('rejects PLANNING', async () => {
            mockRequirePurchasingApprover.mockRejectedValue(
                new Error('Unauthorized'),
            );
            const result = await deleteSupplier('s-1');
            expect(result.success).toBe(false);
        });
    });
});
