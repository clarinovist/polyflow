import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { salesReturn: mocks, invoice: { findMany: vi.fn().mockResolvedValue([]) } } }));
import { getFinanceReturnDetail, getFinanceReturnPage, getFinanceReturnSummary } from '../sales-return-query-service';

describe('finance return queries (read only)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.count.mockResolvedValue(0);
        mocks.findMany.mockResolvedValue([]);
        mocks.findUnique.mockResolvedValue(null);
        mocks.groupBy.mockResolvedValue([]);
    });

    it('returns draft amounts as document values, not posted credit, across all dates', async () => {
        mocks.groupBy.mockResolvedValue([
            { status: 'DRAFT', _count: { _all: 2 }, _sum: { totalAmount: '300' } },
            { status: 'CONFIRMED', _count: { _all: 1 }, _sum: { totalAmount: null } },
            { status: 'RECEIVED', _count: { _all: 1 }, _sum: { totalAmount: '50' } },
        ]);
        expect(await getFinanceReturnSummary()).toEqual({ draftCount: 2, confirmedCount: 1, receivedCount: 1, count: 4, documentAmount: 350 });
        expect(mocks.groupBy).toHaveBeenCalledWith(expect.objectContaining({
            where: { OR: [ { status: { in: ['DRAFT', 'CONFIRMED'] } }, { status: { in: ['RECEIVED', 'COMPLETED'] }, OR: [{ credit: { is: null } }, { credit: { status: { not: 'POSTED' } } }] } ] },
        }));
    });

    it('handles an empty queue', async () => {
        expect(await getFinanceReturnSummary()).toEqual({ draftCount: 0, confirmedCount: 0, receivedCount: 0, count: 0, documentAmount: 0 });
    });

    it('clamps pages and queries a stable, bounded list with status/search filters', async () => {
        mocks.count.mockResolvedValue(26);
        mocks.findMany.mockResolvedValue([{ id: 'return-1', totalAmount: '20', returnDate: new Date('2026-09-18T00:00:00Z') }]);
        const result = await getFinanceReturnPage({ page: 999, status: 'DRAFT', search: '  SR-TEST  ' });
        expect(result.page).toBe(2);
        expect(result.totalPages).toBe(2);
        expect(result.rows[0].totalAmount).toBe(20);
        expect(result.rows[0].returnDate).toBe('2026-09-18T00:00:00.000Z');
        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
            skip: 25, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            where: expect.objectContaining({ status: 'DRAFT', OR: expect.any(Array) }),
        }));
        expect(mocks.count.mock.calls[0][0].where).toEqual(mocks.findMany.mock.calls[0][0].where);
    });

    it('uses an empty default filter without a period bound', async () => {
        expect(await getFinanceReturnPage({})).toMatchObject({ rows: [], page: 1, totalPages: 1, total: 0 });
        expect(mocks.count).toHaveBeenCalledWith({ where: {} });
    });

    it('rejects invalid filter inputs before accessing data', async () => {
        for (const input of [{ status: 'POSTED' }, { page: 0 }, { page: 1.5 }, { search: 'a'.repeat(101) }]) {
            await expect(getFinanceReturnPage(input)).rejects.toThrow();
        }
        expect(mocks.count).not.toHaveBeenCalled();
    });

    it('returns null for missing or other-tenant records without a fallback DB', async () => {
        expect(await getFinanceReturnDetail('return-unknown')).toBeNull();
        expect(mocks.findUnique).toHaveBeenCalledTimes(1);
        expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'return-unknown' } }));
    });

    it('serializes detail amounts and requests only required fields', async () => {
        mocks.findUnique.mockResolvedValue({ id: 'return-1', totalAmount: null, returnDate: new Date('2026-09-18T00:00:00Z'), items: [{ id: 'item-1', returnedQty: '2.5', unitPrice: '10' }] });
        expect(await getFinanceReturnDetail('return-1')).toMatchObject({ totalAmount: 0, items: [{ returnedQty: 2.5, unitPrice: 10 }] });
        const select = mocks.findUnique.mock.calls[0][0].select;
        expect(select.customer).toEqual({ select: { name: true } });
        expect(select.salesOrder).toEqual({ select: { orderNumber: true } });
        expect(select.createdBy).toBeUndefined();
    });

    it('serializes approved manual history without pretending a quantity or snapshot exists', async () => {
        const D = (value: number) => new Prisma.Decimal(value);
        mocks.findUnique.mockResolvedValue({ id: 'return-1', returnDate: new Date('2026-09-18'), items: [], credit: { status: 'POSTED', mode: 'MANUAL', approvalReason: 'Verified amount', evidenceReference: 'Synthetic invoice reference', approvedAt: new Date('2026-09-19'), approvedBy: { name: 'Synthetic Finance' }, manualRemainingBefore: D(1110), totalAmount: D(222), taxAmount: D(22), postedAt: new Date('2026-09-19'), allocations: [{ invoice: { invoiceNumber: 'INV-SYNTHETIC' }, quantity: null, totalAmount: D(222) }] } });
        expect(await getFinanceReturnDetail('return-1')).toMatchObject({ credit: { mode: 'MANUAL', approvedBy: 'Synthetic Finance', taxAmount: '22.00', manualRemainingBefore: '1110.00', allocations: [{ quantity: null, totalAmount: '222.00' }] } });
    });
    it('rejects empty IDs and propagates query failures instead of an empty queue', async () => {
        await expect(getFinanceReturnDetail('')).rejects.toThrow();
        mocks.groupBy.mockRejectedValue(new Error('unavailable'));
        await expect(getFinanceReturnSummary()).rejects.toThrow('unavailable');
    });
});
