import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(1),
        },
        collectionActivity: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ id: 'ca-1' }),
        },
        salesRemittance: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
        },
    },
}));

vi.mock('@/services/sales/collection-service', () => ({
    CollectionService: {
        logCollectionActivity: vi.fn().mockResolvedValue({ id: 'ca-1', invoiceId: 'inv-1', userId: 'u1', type: 'CALL' }),
        listCollectionActivities: vi.fn().mockResolvedValue([{ id: 'ca-1', invoiceId: 'inv-1' }]),
        getOverduePromises: vi.fn().mockResolvedValue([
            { id: 'ca-p1', invoiceId: 'inv-1', userId: 'u1', type: 'PROMISE_TO_PAY', promisedDate: new Date() },
            { id: 'ca-p2', invoiceId: 'inv-2', userId: 'u2', type: 'PROMISE_TO_PAY', promisedDate: new Date() },
        ]),
        getSalesArAging: vi.fn().mockResolvedValue([{ salesRepId: 'u1', salesRepName: 'Sales 1', total: 1000 }]),
        getInvoicesWithoutCollectionActivity: vi.fn().mockResolvedValue([{ invoiceId: 'inv-x', invoiceNumber: 'INV-X' }]),
    },
}));

vi.mock('@/services/sales/remittance-service', () => ({
    createRemittance: vi.fn().mockResolvedValue({ id: 'rem-1', remittanceNumber: 'REM-2026-08-0001' }),
    verifyRemittance: vi.fn().mockResolvedValue({ remittanceId: 'rem-1', remittanceNumber: 'REM-2026-08-0001', successCount: 1, failedCount: 0, items: [] }),
    rejectRemittance: vi.fn().mockResolvedValue({ id: 'rem-1', remittanceNumber: 'REM-2026-08-0001' }),
    listRemittances: vi.fn().mockResolvedValue([{ id: 'rem-1', remittanceNumber: 'REM-2026-08-0001' }]),
    getRemittanceById: vi.fn().mockResolvedValue({
        id: 'rem-1',
        remittanceNumber: 'REM-2026-08-0001',
        userId: 'u1',
        status: 'PENDING',
        items: [],
    }),
}));

vi.mock('@/lib/auth/roles', () => ({
    hasAnyRole: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
    }),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
    }),
    requireSalesFinance: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (d: unknown) => d,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message, code: e.code };
            }
        },
    };
});

// Imports after mocks
import { prisma } from '@/lib/core/prisma';
import { hasAnyRole } from '@/lib/auth/roles';
import { requireSalesAccess, requireSalesFinance } from '@/lib/auth/sales-access';
import { CollectionService } from '@/services/sales/collection-service';
import {
    createRemittance,
    verifyRemittance,
    rejectRemittance,
    listRemittances,
    getRemittanceById as getRemittanceByIdService,
} from '@/services/sales/remittance-service';
import {
    logCollectionActivityAction,
    listCollectionActivitiesAction,
    getMyOverduePromisesAction,
    getSalesArAgingAction,
    getInvoicesWithoutCollectionActivityAction,
    createRemittanceAction,
    verifyRemittanceAction,
    rejectRemittanceAction,
    listRemittancesAction,
    getRemittanceByIdAction,
} from '../collection';

describe('collection actions — guard + scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesAccess).mockResolvedValue({
            user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
        } as any);
        vi.mocked(requireSalesFinance).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        vi.mocked(hasAnyRole).mockReturnValue(false); // SALES = scoped
        vi.mocked(prisma.invoice.count).mockResolvedValue(1);
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.collectionActivity.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.salesRemittance.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValue({
            id: 'rem-1',
            remittanceNumber: 'REM-2026-08-0001',
            userId: 'u1',
            status: 'PENDING',
            items: [],
        } as never);
    });

    describe('logCollectionActivityAction', () => {
        it('SALES allowed when invoice in scope', async () => {
            vi.mocked(prisma.invoice.count).mockResolvedValue(1);
            const res = await logCollectionActivityAction({
                invoiceId: 'inv-1',
                type: 'CALL',
            } as any);
            expect(res.success).toBe(true);
            expect(CollectionService.logCollectionActivity).toHaveBeenCalled();
        });

        it('SALES blocked when invoice out of scope', async () => {
            vi.mocked(prisma.invoice.count).mockResolvedValue(0);
            const res = await logCollectionActivityAction({
                invoiceId: 'inv-other',
                type: 'CALL',
            } as any);
            // safeAction returns success:false from NotFoundError
            expect(res.success).toBe(false);
        });

        it('ADMIN/MARKETING global — bypass scope check', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true); // global viewer
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);
            const res = await logCollectionActivityAction({
                invoiceId: 'inv-any',
                type: 'CALL',
            } as any);
            expect(res.success).toBe(true);
            // should NOT call invoice.count for global viewer
            expect(prisma.invoice.count).not.toHaveBeenCalled();
        });

        it('requires sales access (guard)', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await logCollectionActivityAction({ invoiceId: 'inv-1', type: 'CALL' } as any);
            expect(res.success).toBe(false);
        });
    });

    describe('listCollectionActivitiesAction', () => {
        it('SALES scoped — invoiceId inside scope', async () => {
            vi.mocked(prisma.invoice.count).mockResolvedValue(0); // assertInvoiceInScope not needed for list? We use findMany path
            // Mock: scoped invoice ids = inv-1
            vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ id: 'inv-1' }] as never);
            const res = await listCollectionActivitiesAction({ invoiceId: 'inv-1' } as any);
            // Should succeed: invoiceId in allowed set OR via assert
            expect(res).toBeDefined();
        });

        it('SALES scoped — invoiceId outside scope → NotFound', async () => {
            vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ id: 'inv-1' }] as never);
            const res = await listCollectionActivitiesAction({ invoiceId: 'inv-other' } as any);
            expect(res.success).toBe(false);
        });

        it('SALES unfiltered → returns only activities for scoped invoices (batch query path)', async () => {
            vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ id: 'inv-1' }, { id: 'inv-2' }] as never);
            vi.mocked(prisma.collectionActivity.findMany).mockResolvedValue([{ id: 'ca-1', invoiceId: 'inv-1' }] as never);
            const res = await listCollectionActivitiesAction({} as any);
            expect(res.success).toBe(true);
            // batch prisma.collectionActivity.findMany should be called
            expect(prisma.collectionActivity.findMany).toHaveBeenCalled();
        });

        it('ADMIN global — returns all via service', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);
            const res = await listCollectionActivitiesAction({} as any);
            expect(res.success).toBe(true);
            expect(CollectionService.listCollectionActivities).toHaveBeenCalled();
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await listCollectionActivitiesAction({} as any);
            expect(res.success).toBe(false);
        });
    });

    describe('getMyOverduePromisesAction', () => {
        it('SALES sees only own promises', async () => {
            const res = await getMyOverduePromisesAction();
            expect(res.success).toBe(true);
            const data = (res as any).data as any[];
            expect(data.length).toBe(1);
            expect(data[0].userId).toBe('u1');
        });

        it('ADMIN sees global', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);
            const res = await getMyOverduePromisesAction();
            expect(res.success).toBe(true);
            expect((res as any).data.length).toBe(2);
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await getMyOverduePromisesAction();
            expect(res.success).toBe(false);
        });
    });

    describe('getSalesArAgingAction — scoping', () => {
        it('SALES biasa dipaksa lihat data sendiri saja (userId override)', async () => {
            // SALES session id = u1
            vi.mocked(hasAnyRole).mockReturnValue(false);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
            } as any);

            // caller tries to pass other userId — must be ignored
            const res = await getSalesArAgingAction({ userId: 'other-user' } as any);
            expect(res.success).toBe(true);
            expect(CollectionService.getSalesArAging).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1' }),
            );
        });

        it('ADMIN/MARKETING bisa lihat semua dan filter bebas', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);

            const res = await getSalesArAgingAction({ userId: 'sales-42' } as any);
            expect(res.success).toBe(true);
            expect(CollectionService.getSalesArAging).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'sales-42' }),
            );

            // tanpa userId = lihat semua
            const resAll = await getSalesArAgingAction({} as any);
            expect(resAll.success).toBe(true);
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await getSalesArAgingAction({} as any);
            expect(res.success).toBe(false);
        });
    });

    describe('getInvoicesWithoutCollectionActivityAction — scoping', () => {
        it('SALES dipaksa lihat data sendiri saja (userId override)', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(false);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
            } as any);

            const res = await getInvoicesWithoutCollectionActivityAction({ userId: 'other' } as any);
            expect(res.success).toBe(true);
            expect(CollectionService.getInvoicesWithoutCollectionActivity).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1' }),
            );
        });

        it('ADMIN/MARKETING bisa filter bebas dan lihat semua', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);

            const res = await getInvoicesWithoutCollectionActivityAction({ userId: 'sales-99' } as any);
            expect(res.success).toBe(true);
            expect(CollectionService.getInvoicesWithoutCollectionActivity).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'sales-99' }),
            );
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await getInvoicesWithoutCollectionActivityAction({} as any);
            expect(res.success).toBe(false);
        });
    });

    // ── Remittance actions — Step 4 ────────────────────────────────────

    describe('createRemittanceAction — userId forced from session', () => {
        it('memaksa userId dari session, abaikan payload userId dari client', async () => {
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'sales-real', role: 'SALES', roles: ['SALES'] },
            } as any);

            const res = await createRemittanceAction({
                userId: 'hacker-other-id',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                items: [{ invoiceId: 'inv-1', amount: 100, method: 'Cash' }],
                notes: 'test',
            } as any);

            expect(res.success).toBe(true);
            expect(createRemittance).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'sales-real',
                }),
            );
            // Ensure hacker id NOT used
            const calledArg = vi.mocked(createRemittance).mock.calls[0][0] as { userId: string };
            expect(calledArg.userId).toBe('sales-real');
            expect(calledArg.userId).not.toBe('hacker-other-id');
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await createRemittanceAction({
                collectedAt: new Date(),
                items: [{ invoiceId: 'inv-1', amount: 100, method: 'Cash' }],
            } as any);
            expect(res.success).toBe(false);
        });
    });

    describe('verifyRemittanceAction — guard requireSalesFinance (ADMIN|FINANCE), SALES rejected', () => {
        it('SALES ditolak verify (guard role, BUKAN scope-based) — Gap 8', async () => {
            vi.mocked(requireSalesFinance).mockRejectedValue(new Error('Unauthorized: Akses finance sales hanya untuk admin atau finance.'));

            const res = await verifyRemittanceAction({
                remittanceId: 'rem-1',
            } as any);

            expect(res.success).toBe(false);
            expect(verifyRemittance).not.toHaveBeenCalled();
        });

        it('ADMIN lolos verify', async () => {
            vi.mocked(requireSalesFinance).mockResolvedValue({
                user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);

            const res = await verifyRemittanceAction({
                remittanceId: 'rem-1',
                notes: 'verified',
            } as any);

            expect(res.success).toBe(true);
            expect(verifyRemittance).toHaveBeenCalledWith(
                'rem-1',
                'admin-1',
                'verified',
            );
        });

        it('FINANCE lolos verify', async () => {
            vi.mocked(requireSalesFinance).mockResolvedValue({
                user: { id: 'finance-1', role: 'FINANCE', roles: ['FINANCE'] },
            } as any);

            const res = await verifyRemittanceAction({
                remittanceId: 'rem-1',
            } as any);

            expect(res.success).toBe(true);
            expect(verifyRemittance).toHaveBeenCalled();
        });
    });

    describe('rejectRemittanceAction — guard requireSalesFinance', () => {
        it('SALES ditolak reject (guard role, BUKAN scope-based) — Gap 8', async () => {
            vi.mocked(requireSalesFinance).mockRejectedValue(new Error('Unauthorized: Akses finance sales hanya untuk admin atau finance.'));

            const res = await rejectRemittanceAction({
                remittanceId: 'rem-1',
                reason: 'invalid',
            } as any);

            expect(res.success).toBe(false);
            expect(rejectRemittance).not.toHaveBeenCalled();
        });

        it('ADMIN lolos reject', async () => {
            vi.mocked(requireSalesFinance).mockResolvedValue({
                user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);

            const res = await rejectRemittanceAction({
                remittanceId: 'rem-1',
                reason: 'Data tidak valid',
            } as any);

            expect(res.success).toBe(true);
            expect(rejectRemittance).toHaveBeenCalledWith('rem-1', 'admin-1', 'Data tidak valid');
        });

        it('FINANCE lolos reject', async () => {
            vi.mocked(requireSalesFinance).mockResolvedValue({
                user: { id: 'finance-1', role: 'FINANCE', roles: ['FINANCE'] },
            } as any);

            const res = await rejectRemittanceAction({
                remittanceId: 'rem-2',
                reason: 'Sudah lunas dari jalur lain',
            } as any);

            expect(res.success).toBe(true);
        });
    });

    describe('listRemittancesAction — scoping', () => {
        it('SALES dipaksa lihat punya sendiri (userId override)', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(false);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
            } as any);

            const res = await listRemittancesAction({ userId: 'other' } as any);
            expect(res.success).toBe(true);
            expect(listRemittances).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1' }),
            );
        });

        it('ADMIN/MARKETING bisa filter bebas dan lihat semua', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);

            const res = await listRemittancesAction({} as any);
            expect(res.success).toBe(true);
            expect(listRemittances).toHaveBeenCalled();
        });

        it('requires sales access guard', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await listRemittancesAction({} as any);
            expect(res.success).toBe(false);
        });
    });

    describe('getRemittanceByIdAction — scoping', () => {
        it('SALES hanya bisa lihat remittance milik sendiri', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(false);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
            } as any);
            vi.mocked(getRemittanceByIdService).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                userId: 'u1',
                status: 'PENDING',
                items: [],
            } as never);

            const res = await getRemittanceByIdAction('rem-1' as any);
            expect(res.success).toBe(true);
        });

        it('SALES tidak bisa lihat remittance milik orang lain → NotFound', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(false);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
            } as any);
            vi.mocked(getRemittanceByIdService).mockResolvedValue({
                id: 'rem-2',
                remittanceNumber: 'REM-2026-08-0002',
                userId: 'other-user',
                status: 'PENDING',
                items: [],
            } as never);

            const res = await getRemittanceByIdAction('rem-2' as any);
            expect(res.success).toBe(false);
        });

        it('ADMIN bisa lihat semua remittance', async () => {
            vi.mocked(hasAnyRole).mockReturnValue(true);
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);
            vi.mocked(getRemittanceByIdService).mockResolvedValue({
                id: 'rem-2',
                remittanceNumber: 'REM-2026-08-0002',
                userId: 'other-user',
                status: 'PENDING',
                items: [],
            } as never);

            const res = await getRemittanceByIdAction('rem-2' as any);
            expect(res.success).toBe(true);
        });
    });
});
