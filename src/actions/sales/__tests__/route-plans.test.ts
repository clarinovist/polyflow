import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mutable tx mock, reconfigured per test ──────────────────────────

const txMock = {
    salesRoutePlan: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    salesRoutePlanItem: {
        findMany: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
};

const mockTransaction = vi.fn(
    async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
);
const mockPlanUpdateMany = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        $transaction: (...args: unknown[]) =>
            (mockTransaction as (...a: unknown[]) => unknown)(...args),
        salesRoutePlan: {
            updateMany: (...args: unknown[]) => mockPlanUpdateMany(...args),
        },
    },
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
    }),
    requireSalesApprover: vi.fn().mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual =
        await vi.importActual<typeof import('@/lib/errors/errors')>(
            '@/lib/errors/errors',
        );
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        },
    };
});

const mockGetWeekBoard = vi.fn();

vi.mock('@/services/sales/route-planning-service', async () => {
    const actual = await vi.importActual<
        typeof import('@/services/sales/route-planning-service')
    >('@/services/sales/route-planning-service');
    return {
        ...actual,
        getWeekBoard: (...args: unknown[]) => mockGetWeekBoard(...args),
    };
});

import {
    createRoutePlan,
    updateRoutePlanItems,
    getRouteWeekBoard,
    publishWeekRoutes,
} from '../route-plans';
import { logActivity } from '@/lib/tools/audit';

function resetTx() {
    txMock.salesRoutePlan.findUnique.mockReset();
    txMock.salesRoutePlan.create.mockReset();
    txMock.salesRoutePlan.update.mockReset();
    txMock.salesRoutePlanItem.findMany.mockReset();
    txMock.salesRoutePlanItem.deleteMany.mockReset().mockResolvedValue({
        count: 0,
    });
    txMock.salesRoutePlanItem.update.mockReset();
    txMock.salesRoutePlanItem.createMany.mockReset().mockResolvedValue({
        count: 0,
    });
}

describe('route-plans actions — R2 guard (item bervisit dipertahankan)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetTx();
        mockTransaction.mockImplementation(async (cb) => cb(txMock));
    });

    it('createRoutePlan: item bervisit pada plan PUBLISHED TIDAK dihapus, hanya sortOrder-nya yang berubah', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue({
            id: 'plan-1',
            status: 'PUBLISHED',
        });
        txMock.salesRoutePlanItem.findMany.mockResolvedValue([
            {
                id: 'item-visited',
                customerId: 'cus-visited',
                visits: [{ id: 'visit-1' }],
            },
            {
                id: 'item-no-visit',
                customerId: 'cus-no-visit',
                visits: [],
            },
        ]);
        txMock.salesRoutePlan.update.mockResolvedValue({
            id: 'plan-1',
            status: 'PUBLISHED',
            items: [],
        });

        // Caller mengirim daftar baru yang TIDAK menyertakan cus-visited sama
        // sekali (mis. user mencoba menghapusnya dari UI).
        const result = await createRoutePlan({
            date: '2026-08-10',
            userId: 'rep-1',
            items: [{ customerId: 'cus-new', sortOrder: 1 }],
        });

        expect(result?.success).toBe(true);

        // Hanya item TANPA visit yang boleh dihapus.
        expect(
            txMock.salesRoutePlanItem.deleteMany,
        ).toHaveBeenCalledWith({
            where: { id: { in: ['item-no-visit'] } },
        });

        // Item bervisit dipertahankan — sortOrder-nya di-update, bukan dihapus.
        expect(txMock.salesRoutePlanItem.update).toHaveBeenCalledWith({
            where: { id: 'item-visited' },
            data: { sortOrder: 2 }, // desiredItems.length (1) + 1, karena tidak ada di desired
        });

        // Item baru dibuat, item bervisit TIDAK ikut dibuat ulang.
        expect(txMock.salesRoutePlanItem.createMany).toHaveBeenCalledWith({
            data: [
                {
                    routePlanId: 'plan-1',
                    customerId: 'cus-new',
                    sortOrder: 1,
                    status: 'PENDING',
                },
            ],
        });

        const logCall = vi.mocked(logActivity).mock.calls[0]?.[0];
        expect(logCall?.details).toContain('1 item dipertahankan');
    });

    it('createRoutePlan: item bervisit yang tetap disertakan caller memakai sortOrder baru', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue({
            id: 'plan-1',
            status: 'PUBLISHED',
        });
        txMock.salesRoutePlanItem.findMany.mockResolvedValue([
            {
                id: 'item-visited',
                customerId: 'cus-visited',
                visits: [{ id: 'visit-1' }],
            },
        ]);
        txMock.salesRoutePlan.update.mockResolvedValue({
            id: 'plan-1',
            status: 'PUBLISHED',
            items: [],
        });

        await createRoutePlan({
            date: '2026-08-10',
            userId: 'rep-1',
            items: [{ customerId: 'cus-visited', sortOrder: 3 }],
        });

        expect(txMock.salesRoutePlanItem.update).toHaveBeenCalledWith({
            where: { id: 'item-visited' },
            data: { sortOrder: 3 },
        });
        // Tidak perlu deleteMany karena tidak ada item non-protected.
        expect(txMock.salesRoutePlanItem.deleteMany).not.toHaveBeenCalled();
        // Tidak perlu createMany karena satu-satunya item diinginkan sudah protected.
        expect(txMock.salesRoutePlanItem.createMany).not.toHaveBeenCalled();
    });

    it('createRoutePlan: plan DRAFT (belum publish) boleh dihapus total seperti sebelumnya', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue({
            id: 'plan-2',
            status: 'DRAFT',
        });
        txMock.salesRoutePlanItem.findMany.mockResolvedValue([
            {
                id: 'item-old',
                customerId: 'cus-old',
                visits: [{ id: 'visit-1' }], // ada visit, tapi plan-nya DRAFT
            },
        ]);
        txMock.salesRoutePlan.update.mockResolvedValue({
            id: 'plan-2',
            status: 'DRAFT',
            items: [],
        });

        await createRoutePlan({
            date: '2026-08-10',
            userId: 'rep-1',
            items: [{ customerId: 'cus-new', sortOrder: 1 }],
        });

        // DRAFT: guard tidak berlaku, item lama (walau bervisit) tetap dihapus.
        expect(txMock.salesRoutePlanItem.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ['item-old'] } },
        });
        expect(txMock.salesRoutePlanItem.update).not.toHaveBeenCalled();
    });

    it('createRoutePlan: plan belum ada → create langsung tanpa reconcile', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue(null);
        txMock.salesRoutePlan.create.mockResolvedValue({
            id: 'plan-new',
            status: 'DRAFT',
            items: [],
        });

        const result = await createRoutePlan({
            date: '2026-08-10',
            userId: 'rep-1',
            items: [{ customerId: 'cus-1', sortOrder: 1 }],
        });

        expect(result?.success).toBe(true);
        expect(txMock.salesRoutePlanItem.findMany).not.toHaveBeenCalled();
        expect(txMock.salesRoutePlan.create).toHaveBeenCalled();
    });

    it('updateRoutePlanItems: guard yang sama berlaku (item bervisit dipertahankan)', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue({
            id: 'plan-3',
            status: 'PUBLISHED',
        });
        txMock.salesRoutePlanItem.findMany.mockResolvedValue([
            {
                id: 'item-visited',
                customerId: 'cus-visited',
                visits: [{ id: 'visit-1' }],
            },
            {
                id: 'item-no-visit',
                customerId: 'cus-no-visit',
                visits: [],
            },
        ]);
        txMock.salesRoutePlan.update.mockResolvedValue({
            id: 'plan-3',
            status: 'PUBLISHED',
            items: [],
        });

        const result = await updateRoutePlanItems({
            id: 'plan-3',
            items: [],
        });

        expect(result?.success).toBe(true);
        expect(txMock.salesRoutePlanItem.deleteMany).toHaveBeenCalledWith({
            where: { id: { in: ['item-no-visit'] } },
        });
        expect(txMock.salesRoutePlanItem.update).toHaveBeenCalledWith({
            where: { id: 'item-visited' },
            data: { sortOrder: 1 }, // desiredItems.length (0) + 1
        });
    });

    it('updateRoutePlanItems: gagal (NotFoundError) kalau plan tidak ada, tidak menyentuh apa pun', async () => {
        txMock.salesRoutePlan.findUnique.mockResolvedValue(null);

        const result = await updateRoutePlanItems({
            id: 'missing',
            items: [],
        });

        expect(result?.success).toBe(false);
        expect(txMock.salesRoutePlanItem.deleteMany).not.toHaveBeenCalled();
    });
});

describe('getRouteWeekBoard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetWeekBoard.mockResolvedValue({
            days: [],
            coverage: { activeCustomers: 0, scheduledThisWeek: 0 },
            overdue: [],
            conflicts: [],
        });
    });

    it('delegates to the service with a parsed Date weekStart', async () => {
        const result = await getRouteWeekBoard('2026-08-03', [
            'rep-1',
            'rep-2',
        ]);

        expect(result?.success).toBe(true);
        expect(mockGetWeekBoard).toHaveBeenCalledWith(
            expect.objectContaining({
                weekStart: new Date('2026-08-03'),
                userIds: ['rep-1', 'rep-2'],
            }),
        );
    });
});

describe('publishWeekRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes all DRAFT plans within the week range for the given reps', async () => {
        mockPlanUpdateMany.mockResolvedValue({ count: 4 });

        const result = await publishWeekRoutes('2026-08-03', [
            'rep-1',
            'rep-2',
        ]);

        expect(result?.success).toBe(true);
        if (result?.success) {
            expect(result.data).toEqual({ count: 4 });
        }
        expect(mockPlanUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    userId: { in: ['rep-1', 'rep-2'] },
                    status: 'DRAFT',
                }),
                data: { status: 'PUBLISHED' },
            }),
        );
        expect(logActivity).toHaveBeenCalled();
    });

    it('short-circuits with count 0 and skips the query when userIds is empty', async () => {
        const result = await publishWeekRoutes('2026-08-03', []);

        expect(result?.success).toBe(true);
        if (result?.success) {
            expect(result.data).toEqual({ count: 0 });
        }
        expect(mockPlanUpdateMany).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('does not log activity when nothing was published (count 0)', async () => {
        mockPlanUpdateMany.mockResolvedValue({ count: 0 });

        const result = await publishWeekRoutes('2026-08-03', ['rep-1']);

        expect(result?.success).toBe(true);
        expect(logActivity).not.toHaveBeenCalled();
    });
});
