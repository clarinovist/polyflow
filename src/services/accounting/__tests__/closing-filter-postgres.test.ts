import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/core/prisma', async () => {
    const { guardedClient } = await import('../../finance/__tests__/finance-dry-run-postgres-fixture');
    return { prisma: guardedClient(process.env.TEST_DATABASE_URL, 'polyflow_recognition_test') };
});
vi.mock('../account-resolver', () => ({ resolveAccount: vi.fn().mockResolvedValue({ id: 'equity' }) }));
vi.mock('../journals-service', () => ({ createJournalEntry: vi.fn().mockResolvedValue({ entryNumber: 'TEST-CLOSE' }) }));
import { prisma as db } from '@/lib/core/prisma';
import { createJournalEntry } from '../journals-service';
import { getIncomeStatement, getClosingBalances, closePeriod, getAccountBalance } from '../reports-service';
import { reconcileFinance } from '../../finance/finance-reconciliation-service';

const start = new Date('2026-08-01T00:00:00Z');
const end = new Date('2026-08-31T00:00:00Z');
async function entry(id: string, accountId: string, net: number, overrides: Partial<Prisma.JournalEntryCreateInput> = {}) {
    await db.journalEntry.create({ data: {
        id, entryNumber: id, entryDate: new Date('2026-08-15T00:00:00Z'), reference: id,
        description: 'Synthetic closing regression', status: 'POSTED', referenceType: 'MANUAL_ENTRY',
        lines: { create: [
            { accountId, debit: Math.max(net, 0), credit: Math.max(-net, 0) },
            { accountId: 'equity', debit: Math.max(-net, 0), credit: Math.max(net, 0) },
        ] }, ...overrides,
    } });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('closing exclusion on disposable PostgreSQL', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        expect((await db.$queryRaw<{ name: string }[]>`SELECT current_database() name`)[0].name).toBe('polyflow_recognition_test');
        await db.$executeRaw`TRUNCATE "JournalLine", "JournalEntry", "Account" CASCADE`;
        await db.account.createMany({ data: [
            { id: 'rev', code: 'R', name: 'Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE' },
            { id: 'cogs', code: 'C', name: 'Cost', type: 'EXPENSE', category: 'COGS' },
            { id: 'opex', code: 'O', name: 'Expense', type: 'EXPENSE', category: 'OPERATING_EXPENSE' },
            { id: 'equity', code: 'E', name: 'Equity', type: 'EQUITY', category: 'RETAINED_EARNINGS' },
        ] });
    });
    afterAll(async () => { await db.$disconnect(); });

    it('preserves WIB limits, statuses, reference NULL policy and legitimate negative revenue', async () => {
        await entry('START', 'rev', -100, { entryDate: new Date('2026-07-31T17:00:00Z') });
        await entry('END', 'rev', 150, { reference: '', entryDate: new Date('2026-08-31T16:59:59.999Z') });
        await entry('BEFORE', 'rev', -999, { entryDate: new Date('2026-07-31T16:59:59.999Z') });
        await entry('AFTER', 'rev', -999, { entryDate: new Date('2026-08-31T17:00:00Z') });
        await entry('DRAFT', 'rev', -999, { status: 'DRAFT' });
        await entry('VOID', 'rev', -999, { status: 'VOIDED' });
        // Compatibility only: NULL references remain out of scope for this fix.
        await entry('NULL', 'rev', -999, { reference: null });
        expect((await getIncomeStatement(start, end)).totalRevenue).toBe(-50);
        expect(await getClosingBalances(start, end)).toEqual([{ id: 'rev', type: 'REVENUE', netBalance: -50 }]);
    });

    it('excludes both closing families across revenue and expenses, not manual adjustments', async () => {
        await entry('SALE', 'rev', -1000);
        await entry('COST', 'cogs', 300);
        await entry('REFUND', 'rev', 40);
        await entry('COST-REVERSAL', 'cogs', -20);
        await entry('EXPENSE', 'opex', 50);
        for (const prefix of ['CLOSING-', 'CLOSE-']) {
            await entry(`${prefix}R`, 'rev', 5000, { reference: `${prefix}JULY`, entryDate: new Date('2026-07-31T23:59:59Z') });
            await entry(`${prefix}C`, 'cogs', -2000);
            await entry(`${prefix}O`, 'opex', -1000);
        }
        const report = await getIncomeStatement(start, end);
        expect(report).toMatchObject({ totalRevenue: 960, totalCOGS: 280, totalOpEx: 50, netIncome: 630 });
        expect(await getClosingBalances(start, end)).toEqual(expect.arrayContaining([
            { id: 'rev', type: 'REVENUE', netBalance: 960 },
            { id: 'cogs', type: 'EXPENSE', netBalance: 280 },
            { id: 'opex', type: 'EXPENSE', netBalance: 50 },
        ]));
        const closing = await closePeriod(end, 'test-user');
        expect(closing).toMatchObject({ totalRevenue: 960, totalExpense: 330, netIncome: 630 });
        expect(createJournalEntry).toHaveBeenCalledOnce();
        // Ledger still includes actual closing postings; never hide them globally.
        expect(await getAccountBalance('rev', start, end)).toBe(-9040);
        const reconciled = await db.$transaction(tx => reconcileFinance(tx, { startDate: '2026-08-01', endDate: '2026-08-31' }));
        expect(reconciled.cogs).toMatchObject({ count: 2, total: 280 });
        expect(reconciled.cogsDifference).toBe(0);
    });
});
