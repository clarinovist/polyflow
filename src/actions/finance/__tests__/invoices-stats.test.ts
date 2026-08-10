import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        $transaction: vi.fn(),
        invoice: {
            aggregate: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
        },
        journalEntry: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        journalLine: {
            deleteMany: vi.fn(),
        },
        payment: {
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    BusinessRuleError: class BusinessRuleError extends Error {},
    NotFoundError: class NotFoundError extends Error {},
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceReadCrossPortal: vi.fn().mockResolvedValue(undefined),
    requireFinanceMutation: vi.fn().mockResolvedValue({ user: { id: 'u-1' } }),
}));

vi.mock('@/services/accounting/periods-service', () => ({
    isPeriodOpen: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn() },
}));

import { isPeriodOpen } from '@/services/accounting/periods-service';

describe('getInvoiceStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.invoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: 3_000, paidAmount: 1_000 },
        });
        mockPrisma.invoice.findMany.mockResolvedValue([
            {
                id: 'inv-open',
                dueDate: new Date('2026-08-01T00:00:00Z'),
                status: 'UNPAID',
                totalAmount: 1_000,
                paidAmount: 0,
            },
            {
                id: 'inv-stale-paid',
                dueDate: new Date('2026-08-01T00:00:00Z'),
                status: 'OVERDUE',
                totalAmount: 2_000,
                paidAmount: 2_000,
            },
        ]);
        mockPrisma.invoice.count.mockImplementation(async (args?: any) => {
            const status = args?.where?.status;
            if (status === 'PARTIAL') return 4;
            if (status === 'PAID') return 7;
            if (status === 'UNPAID') return 3;
            return 0;
        });
        mockPrisma.$transaction.mockImplementation(
            async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
                callback(mockPrisma),
        );
    });

    it('counts actionable overdue invoices in the selected invoice period only', async () => {
        const { getInvoiceStats } = await import('../invoices');
        const startDate = new Date('2026-07-31T17:00:00.000Z');
        const endDate = new Date('2026-08-31T16:59:59.999Z');

        const result = await getInvoiceStats(
            { startDate, endDate },
            { operationalOnly: true },
        );

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;

        expect(result.data.totalOutstanding).toBe(2_000);
        expect(result.data.overdueCount).toBe(1);
        expect(result.data.partialCount).toBe(4);
        expect(result.data.paidCount).toBe(7);
        expect(result.data.unpaidCount).toBe(3);

        expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    invoiceDate: { gte: startDate, lte: endDate },
                    salesOrder: expect.objectContaining({
                        customerId: { not: null },
                        NOT: expect.arrayContaining([
                            { orderNumber: { startsWith: 'SO-OPEN-' } },
                            { orderNumber: { startsWith: 'OB-AR-' } },
                            { notes: { startsWith: 'Opening Balance Entry' } },
                            {
                                notes: {
                                    startsWith: 'Sheet Penjualan Jun:',
                                },
                            },
                        ]),
                    }),
                }),
            }),
        );
        expect(mockPrisma.invoice.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: 'PAID',
                    invoiceDate: { gte: startDate, lte: endDate },
                    salesOrder: expect.objectContaining({
                        customerId: { not: null },
                        NOT: expect.any(Array),
                    }),
                }),
            }),
        );
    });

    it('preserves closed fiscal period message when deleteInvoice is blocked', async () => {
        vi.mocked(isPeriodOpen).mockResolvedValue(false);
        mockPrisma.invoice.findUnique.mockResolvedValue({
            id: 'inv-closed',
            payments: [],
        });
        mockPrisma.journalEntry.findMany.mockResolvedValue([
            {
                entryNumber: 'AR-OB-009',
                entryDate: new Date('2026-05-29T00:00:00Z'),
            },
        ]);

        const { deleteInvoice } = await import('../invoices');

        const result = await deleteInvoice('inv-closed', 'AR');

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe(
                'Cannot delete invoice: journal entry AR-OB-009 is in a closed fiscal period',
            );
        }
    });
});
