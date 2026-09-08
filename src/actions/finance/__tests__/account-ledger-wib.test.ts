import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    account: vi.fn(), lines: vi.fn(), auth: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    account: { findUnique: mocks.account },
    journalLine: { findMany: mocks.lines },
} }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: mocks.auth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getAccountLedger } from '../account-actions';

const line = (id: string, date: string, debit: number, credit = 0, status = 'POSTED', accountId = 'account') => ({
    id, accountId, debit, credit, description: id,
    journalEntry: { id, entryNumber: id, entryDate: new Date(date), status,
        description: id, reference: null, referenceType: null },
});
const rows = [
    line('opening', '2026-05-20T00:00:00Z', 0, 400),
    line('jun-early', '2026-06-02T03:00:00Z', 50),
    line('jun-last', '2026-06-30T08:55:00Z', 75),
    line('jul-last', '2026-07-31T03:17:00Z', 20),
    line('aug-first', '2026-07-31T17:00:00Z', 30),
    line('aug-last', '2026-08-31T16:59:59.999Z', 40),
    line('sep-first', '2026-08-31T17:00:00Z', 60),
    line('void', '2026-07-31T05:00:00Z', 999, 0, 'VOIDED'),
    line('draft', '2026-07-31T05:00:00Z', 999, 0, 'DRAFT'),
    line('other', '2026-07-31T05:00:00Z', 999, 0, 'POSTED', 'other'),
];

type Query = { where: { accountId: string; journalEntry: {
    status: string; entryDate?: { lt?: Date; lte?: Date; gte?: Date };
} } };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.account.mockResolvedValue({ id: 'account', code: '60000', name: 'Expense',
        type: 'EXPENSE', category: 'OPERATING_EXPENSE', parent: null });
    mocks.auth.mockResolvedValue({ user: { id: 'finance' } });
    mocks.lines.mockImplementation(async ({ where }: Query) => rows.filter((row) => {
        const bounds = where.journalEntry.entryDate;
        const date = row.journalEntry.entryDate;
        return row.accountId === where.accountId && row.journalEntry.status === where.journalEntry.status
            && (!bounds?.lt || date < bounds.lt)
            && (!bounds?.lte || date <= bounds.lte)
            && (!bounds?.gte || date >= bounds.gte);
    }));
});

async function ledger(month: string, last: string) {
    const result = await getAccountLedger('account', new Date(`${month}-01`), new Date(`${month}-${last}`));
    if (!result.success) throw new Error(result.error);
    return result.data;
}

describe('account ledger WIB continuity', () => {
    it.each([
        [new Date('invalid'), new Date('2026-07-31')],
        [new Date('2026-07-01'), new Date('invalid')],
        [new Date('2026-08-02'), new Date('2026-08-01')],
    ])('rejects invalid or reversed bounds before querying lines', async (from, to) => {
        const result = await getAccountLedger('account', from, to);
        expect(result.success).toBe(false);
        expect(mocks.lines).not.toHaveBeenCalled();
    });
    it('normalizes date-picker instants without changing the caller Dates', async () => {
        const from = new Date('2026-07-31T17:00:00Z');
        const to = new Date('2026-08-30T17:00:00Z');
        const result = await getAccountLedger('account', from, to);
        expect(result.success && result.data.entries.map((row) => row.id)).toEqual(['aug-first', 'aug-last']);
        expect(to.toISOString()).toBe('2026-08-30T17:00:00.000Z');
    });
    it('preserves unbounded and one-sided queries', async () => {
        const all = await getAccountLedger('account');
        expect(all.success && all.data.summary.beginningBalance).toBe(0);
        const through = await getAccountLedger('account', undefined, new Date('2026-06-30'));
        expect(through.success && through.data.summary.endingBalance).toBe(-275);
        const after = await getAccountLedger('account', new Date('2026-08-01'));
        expect(after.success && after.data.summary.beginningBalance).toBe(-255);
    });
    it('uses credit-normal signs for liability accounts', async () => {
        mocks.account.mockResolvedValue({ id: 'account', code: '20000', name: 'Liability', type: 'LIABILITY', parent: null });
        const data = await ledger('2026-08', '31');
        expect(data.summary).toEqual({ beginningBalance: 255, totalDebit: 70, totalCredit: 0, endingBalance: 185 });
    });
    it('includes June last-day transactions', async () => {
        const data = await ledger('2026-06', '30');
        expect(data.summary).toEqual({ beginningBalance: -400, totalDebit: 125, totalCredit: 0, endingBalance: -275 });
    });
    it('connects June, July and August without losing boundary entries', async () => {
        const june = await ledger('2026-06', '30');
        const july = await ledger('2026-07', '31');
        const august = await ledger('2026-08', '31');
        expect(july.summary.beginningBalance).toBe(june.summary.endingBalance);
        expect(august.summary.beginningBalance).toBe(july.summary.endingBalance);
        expect(july.entries.map((row) => row.id)).toEqual(['jul-last']);
        expect(august.entries.map((row) => row.id)).toEqual(['aug-first', 'aug-last']);
        expect(august.summary.totalDebit).toBe(70);
    });
});
