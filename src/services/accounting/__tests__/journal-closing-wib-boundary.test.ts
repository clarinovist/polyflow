/**
 * Regression tests for the WIB month-boundary bug fixed in
 * docs/plan/2026-08-10-fix-fiscal-period-wib-boundary-bug.md.
 *
 * Unlike closing-entries.test.ts, this file does NOT mock periods-service —
 * it exercises the real `isPeriodOpen` (and therefore the real WIB date
 * math) so the boundary bug would actually be caught here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FiscalPeriodRow = {
    id: string;
    name: string;
    year: number;
    month: number;
    status: 'OPEN' | 'CLOSED' | 'LOCKED';
    // Present to match production shape (and to reproduce the original bug
    // faithfully if this test is run against pre-fix code — the buggy code
    // reads these directly instead of deriving bounds from year/month).
    startDate: Date;
    endDate: Date;
};

const PERIODS: Record<string, FiscalPeriodRow> = {
    'period-juni': {
        id: 'period-juni',
        name: 'Juni 2026',
        year: 2026,
        month: 6,
        status: 'OPEN',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        // Naive "23:59:59" convention seen in production (fp-mel-2026-06) —
        // +7h WIB conversion shifts this into 1 Jul, which is exactly the bug.
        endDate: new Date('2026-06-30T23:59:59.000Z'),
    },
};

const PERIOD_STATUS_BY_YEAR_MONTH: Record<string, 'OPEN' | 'CLOSED'> = {
    '2026-6': 'OPEN',
    '2026-7': 'CLOSED', // the already-closed "next period" that triggered the bug
};

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        fiscalPeriod: {
            findUnique: vi.fn(
                async ({
                    where,
                }: {
                    where: { id?: string; year_month?: { year: number; month: number } };
                }) => {
                    if (where.id) return PERIODS[where.id] ?? null;
                    if (where.year_month) {
                        const { year, month } = where.year_month;
                        const status =
                            PERIOD_STATUS_BY_YEAR_MONTH[`${year}-${month}`];
                        return status ? { status } : null;
                    }
                    return null;
                },
            ),
        },
        journalEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
            findUnique: vi.fn().mockResolvedValue(null),
            deleteMany: vi.fn(),
            delete: vi.fn(),
            create: vi.fn().mockResolvedValue({ id: 'je-new', lines: [] }),
        },
        journalLine: { deleteMany: vi.fn() },
        account: { findUnique: vi.fn() },
        systemSequence: {
            update: vi
                .fn()
                .mockResolvedValue({ value: BigInt(1) }),
        },
        $transaction: vi.fn(
            async (callback: (tx: typeof prisma) => Promise<unknown>) =>
                callback(prisma),
        ),
    },
}));

vi.mock('../account-resolver', () => ({
    resolveAccount: vi.fn().mockResolvedValue({
        id: 'acc-cye',
        code: '33000',
        name: 'Current Year Earnings',
    }),
}));

vi.mock('../reports-service', () => ({
    getClosingBalances: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { getClosingBalances } from '../reports-service';
import { createClosingJournalEntry } from '../journal-closing';

describe('createClosingJournalEntry — WIB month boundary', () => {
    beforeEach(() => {
        vi.mocked(getClosingBalances).mockClear();
        vi.mocked(prisma.account.findUnique).mockResolvedValue({
            id: 'acc-cye',
            code: '33000',
        } as never);
        vi.mocked(getClosingBalances).mockResolvedValue([
            { id: 'acc-rev', type: 'REVENUE', netBalance: 5000000 },
        ]);
    });

    it('closes Juni successfully even though Juli (the next period) is already CLOSED', async () => {
        // Before the fix, this threw BusinessRuleError('FISCAL_PERIOD_CLOSED')
        // because entryDate: period.endDate resolved to 1 Jul in WIB, and
        // isPeriodOpen checked Juli's (closed) status instead of Juni's.
        const result = await createClosingJournalEntry(
            'period-juni',
            'user-1',
        );
        expect(result).toBeTruthy();
    });

    it('queries closing balances within June only — end bound does not leak into July', async () => {
        await createClosingJournalEntry('period-juni', 'user-1');

        expect(getClosingBalances).toHaveBeenCalledTimes(1);
        const [start, end] = vi.mocked(getClosingBalances).mock.calls[0];
        const july1 = new Date('2026-07-01T00:00:00.000Z');

        expect(start.toISOString()).toBe('2026-05-31T17:00:00.000Z');
        expect(end < july1).toBe(true);
        expect(end.toISOString()).toBe('2026-06-30T16:59:59.999Z');
    });

    it('posts the closing journal entryDate within June, not 1 July', async () => {
        await createClosingJournalEntry('period-juni', 'user-1');

        const createCall = vi.mocked(prisma.journalEntry.create).mock
            .calls[0][0] as { data: { entryDate: Date } };
        expect(createCall.data.entryDate.toISOString()).toBe(
            '2026-06-30T16:59:59.999Z',
        );
    });
});
