import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    findMany: vi.fn(),
    count: vi.fn(),
}));
const requireFinanceAccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <TArgs extends unknown[], TResult>(
        fn: (...args: TArgs) => Promise<TResult>,
    ) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: {
            findMany: db.findMany,
            count: db.count,
            fields: { totalAmount: 'totalAmount-field-reference' },
        },
    },
}));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess,
    requireFinanceMutation: vi.fn(),
    requireFinanceReadCrossPortal: vi.fn(),
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));
vi.mock('@/services/finance/invoice-service', () => ({ InvoiceService: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
    getFinanceSalesInvoicePage,
    getInvoices,
} from '../invoice';

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T00:00:00.000Z'));
    db.findMany.mockResolvedValue([]);
    db.count.mockResolvedValue(0);
});

describe('getFinanceSalesInvoicePage', () => {
    it('defaults to the first 50 rows and uses the same filters for data and count', async () => {
        const result = await getFinanceSalesInvoicePage();

        expect(requireFinanceAccess).toHaveBeenCalledOnce();
        expect(result).toMatchObject({
            success: true,
            data: {
                data: [],
                meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
            },
        });
        const findArgs = db.findMany.mock.calls[0][0];
        const countArgs = db.count.mock.calls[0][0];
        expect(findArgs).toMatchObject({
            skip: 0,
            take: 50,
            orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
        });
        expect(findArgs.where).toEqual(countArgs.where);
    });

    it('applies an allowed sort before pagination with a deterministic id tie-breaker', async () => {
        await getFinanceSalesInvoicePage({
            sort: 'totalAmount',
            direction: 'asc',
        });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ totalAmount: 'asc' }, { id: 'asc' }],
                skip: 0,
                take: 50,
            }),
        );
    });

    it('falls back safely when sort and direction are outside the allowlist', async () => {
        await getFinanceSalesInvoicePage({
            sort: 'paidAmount' as 'invoiceDate',
            direction: 'sideways' as 'asc',
        });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
            }),
        );
    });

    it('orders entity sorting through the customer relation before pagination', async () => {
        await getFinanceSalesInvoicePage({ sort: 'entity', direction: 'desc' });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [
                    { salesOrder: { customer: { name: 'desc' } } },
                    { id: 'desc' },
                ],
                skip: 0,
                take: 50,
            }),
        );
    });

    it('uses the start of the current Asia/Jakarta business day as the overdue cutoff', async () => {
        await getFinanceSalesInvoicePage({ overdue: true });

        const whereJson = JSON.stringify(db.findMany.mock.calls[0][0].where);
        expect(whereJson).toContain('2026-09-11T17:00:00.000Z');
        expect(whereJson).not.toContain('2026-09-12T00:00:00.000Z');
    });

    it('clamps an out-of-range page after count and fetches the last valid page', async () => {
        db.count.mockResolvedValue(120);

        const result = await getFinanceSalesInvoicePage({
            page: 99,
            pageSize: 50,
        });

        expect(db.count.mock.invocationCallOrder[0]).toBeLessThan(
            db.findMany.mock.invocationCallOrder[0],
        );
        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 100, take: 50 }),
        );
        expect(result).toMatchObject({
            success: true,
            data: {
                meta: { page: 3, pageSize: 50, total: 120, totalPages: 3 },
            },
        });
    });

    it('keeps zero-result pagination on page one', async () => {
        const result = await getFinanceSalesInvoicePage({
            page: 8,
            pageSize: 20,
        });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0, take: 20 }),
        );
        expect(result).toMatchObject({
            success: true,
            data: {
                meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
            },
        });
    });

    it('applies every finance-list filter before bounded pagination', async () => {
        db.count.mockResolvedValue(240);

        await getFinanceSalesInvoicePage({
            page: 2,
            pageSize: 500,
            search: 'INV-42',
            demandType: 'customer',
            status: 'OVERDUE',
            overdue: true,
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-09-30T23:59:59.999Z'),
        });

        const findArgs = db.findMany.mock.calls[0][0];
        const countArgs = db.count.mock.calls[0][0];
        expect(findArgs).toMatchObject({ skip: 100, take: 100 });
        expect(findArgs.where).toEqual(countArgs.where);
        expect(JSON.stringify(findArgs.where)).toContain('INV-42');
        expect(JSON.stringify(findArgs.where)).toContain('customerId');
        expect(JSON.stringify(findArgs.where)).toContain('dueDate');
        expect(findArgs.where.AND).toContainEqual({ status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, remainingAmount: { gt: 0 } });
        expect(JSON.stringify(findArgs.where)).toContain('invoiceDate');
    });
});

describe('getInvoices compatibility', () => {
    it('keeps the existing full-list query unpaginated', async () => {
        await getInvoices(undefined, 'customer');

        const findArgs = db.findMany.mock.calls[0][0];
        expect(findArgs.skip).toBeUndefined();
        expect(findArgs.take).toBeUndefined();
    });
});
