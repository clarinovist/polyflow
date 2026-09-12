import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    findMany: vi.fn(),
    count: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <TArgs extends unknown[], TResult>(
        fn: (...args: TArgs) => Promise<TResult>,
    ) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        journalEntry: {
            findMany: db.findMany,
            count: db.count,
        },
    },
}));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn(),
    requireFinanceApprover: vi.fn(),
}));
vi.mock('@/services/accounting/journals-service', () => ({
    postBulkJournals: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getJournalEntries } from '../journal-actions';

describe('getJournalEntries pagination validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.findMany.mockResolvedValue([]);
        db.count.mockResolvedValue(250);
    });

    it.each([
        [{ page: -4, limit: 0 }, { page: 1, limit: 10, skip: 0 }],
        [{ page: 2.8, limit: 1000 }, { page: 2, limit: 100, skip: 100 }],
        [{ page: Number.NaN, limit: Number.NaN }, { page: 1, limit: 10, skip: 0 }],
    ])('normalizes %j to safe bounded pagination', async (params, expected) => {
        const result = await getJournalEntries(params);

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                skip: expected.skip,
                take: expected.limit,
                orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
            }),
        );
        expect(result).toMatchObject({
            success: true,
            data: {
                meta: {
                    page: expected.page,
                    limit: expected.limit,
                },
            },
        });
        expect(db.count.mock.invocationCallOrder[0]).toBeLessThan(
            db.findMany.mock.invocationCallOrder[0],
        );
    });

    it.each([
        ['entryNumber', 'asc'],
        ['entryDate', 'desc'],
        ['description', 'asc'],
        ['reference', 'desc'],
        ['status', 'asc'],
    ] as const)(
        'applies allowlisted %s %s sorting before pagination with a stable id tie-breaker',
        async (sortBy, sortDirection) => {
            await getJournalEntries({
                page: 2,
                limit: 10,
                sortBy,
                sortDirection,
            });

            expect(db.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: [
                        { [sortBy]: sortDirection },
                        { id: sortDirection },
                    ],
                    skip: 10,
                    take: 10,
                }),
            );
        },
    );

    it('rejects non-allowlisted sort input and falls back to the default order', async () => {
        await getJournalEntries({
            sortBy: 'createdBy' as never,
            sortDirection: 'sideways' as never,
        });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
            }),
        );
    });

    it('counts first, clamps an out-of-range page, then fetches the stable last page', async () => {
        db.count.mockResolvedValue(21);

        const result = await getJournalEntries({ page: 99, limit: 10 });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
                skip: 20,
                take: 10,
            }),
        );
        expect(result).toMatchObject({
            success: true,
            data: { meta: { total: 21, page: 3, limit: 10, totalPages: 3 } },
        });
    });

    it('returns page one and no rows when there are zero results', async () => {
        db.count.mockResolvedValue(0);

        const result = await getJournalEntries({ page: 9, limit: 20 });

        expect(db.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0, take: 20 }),
        );
        expect(result).toMatchObject({
            success: true,
            data: { data: [], meta: { total: 0, page: 1, totalPages: 0 } },
        });
    });
});
