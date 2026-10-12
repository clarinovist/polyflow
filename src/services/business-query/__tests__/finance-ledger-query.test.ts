import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    extractFinanceKeywords,
    financeLedgerQuerySchema,
    queryFinanceLedger,
} from '../finance-ledger-query';

const journalLine = {
    count: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
};
const db = { journalLine } as never;

beforeEach(() => {
    vi.clearAllMocks();
    journalLine.count.mockResolvedValue(1);
    journalLine.aggregate.mockResolvedValue({ _sum: { debit: 500, credit: 50 } });
    journalLine.findMany.mockResolvedValue([
        {
            id: 'line-1',
            journalEntryId: 'journal-1',
            accountId: 'expense-1',
            description: 'Solar untuk rit',
            debit: 500,
            credit: 50,
            account: {
                code: '6101',
                name: 'Biaya Kendaraan',
                description: null,
                type: 'EXPENSE',
            },
            journalEntry: {
                entryNumber: 'JE-001',
                entryDate: new Date('2026-09-14T17:00:00Z'),
                description: 'Muatan ke Ali',
                reference: 'TEMANGGUNG',
                referenceId: null,
                referenceType: 'PETTY_CASH',
                details: [{ type: 'FUEL', description: 'Solar', amount: 450 }],
            },
        },
    ]);
});

describe('finance ledger business query', () => {
    it('extracts meaningful, deduplicated keywords from a natural question', () => {
        expect(
            extractFinanceKeywords(
                'Berapa biaya solar untuk muatan ke Ali Temanggung?',
            ),
        ).toEqual(['solar', 'ali', 'temanggung']);
        expect(extractFinanceKeywords('BIAYA')).toEqual(['biaya']);
    });

    it('builds AND-across-keywords query with server-owned expense guards', async () => {
        const result = await queryFinanceLedger(
            {
                dataset: 'ledger_expenses',
                keywords: ['solar', 'ali', 'temanggung'],
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                limit: 20,
            },
            { db },
        );

        expect(result).toMatchObject({
            dataset: 'ledger_expenses',
            totalCount: 1,
            totalDebit: 500,
            totalCredit: 50,
            netAmount: 450,
            truncated: false,
            period: {
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                preset: null,
            },
            rows: [
                {
                    entryNumber: 'JE-001',
                    netAmount: 450,
                    matchedOn: expect.arrayContaining([
                        'keterangan baris',
                        'keterangan jurnal',
                        'referensi',
                        'detail jurnal',
                    ]),
                },
            ],
        });
        const where = journalLine.count.mock.calls[0][0].where;
        expect(where.account).toEqual({ is: { type: 'EXPENSE' } });
        expect(where.AND).toHaveLength(5);
        expect(JSON.stringify(where.AND[1])).not.toContain('entryNumber');
        expect(JSON.stringify(where.AND[1])).not.toContain('reference');
        expect(JSON.stringify(where)).toContain('POSTED');
        expect(JSON.stringify(where)).toContain('CLOSING-');
        expect(JSON.stringify(where)).toContain('CLOSE-');
    });

    it('uses explicit WIB current-month default and preserves totals when truncated', async () => {
        journalLine.count.mockResolvedValue(12);
        const result = await queryFinanceLedger(
            { dataset: 'ledger_lines', keywords: ['solar'], limit: 1 },
            { db, now: new Date('2026-10-12T03:00:00Z') },
        );

        expect(result.period).toEqual({
            startDate: '2026-10-01',
            endDate: '2026-10-12',
            preset: 'CURRENT_MONTH',
        });
        expect(result.truncated).toBe(true);
        expect(result.basis).toContain('Pencocokan teks');
        expect(result.basis).toContain('POSTED');
        const where = journalLine.count.mock.calls[0][0].where;
        expect(where.account).toBeUndefined();
        expect(JSON.stringify(where)).not.toContain('CLOSING-');
    });

    it('supports the bounded 90-day preset across calendar boundaries', async () => {
        const result = await queryFinanceLedger(
            {
                dataset: 'ledger_expenses',
                keywords: ['solar'],
                datePreset: 'LAST_90_DAYS',
            },
            { db, now: new Date('2026-01-15T03:00:00Z') },
        );
        expect(result.period).toEqual({
            startDate: '2025-10-18',
            endDate: '2026-01-15',
            preset: 'LAST_90_DAYS',
        });
    });

    it.each([
        { dataset: 'unknown', keywords: ['solar'] },
        { dataset: 'ledger_lines', keywords: [] },
        { dataset: 'ledger_lines', keywords: ['x'] },
        { dataset: 'ledger_lines', keywords: ['a'.repeat(241)] },
        { dataset: 'ledger_lines', keywords: ['solar'], startDate: '2026-01-01' },
        { dataset: 'ledger_lines', keywords: ['solar'], startDate: '2026-02-30', endDate: '2026-03-01' },
        { dataset: 'ledger_lines', keywords: ['solar'], startDate: '2025-01-01', endDate: '2026-01-02' },
        { dataset: 'ledger_lines', keywords: ['solar'], sql: 'SELECT 1' },
    ])('rejects unallowlisted or unbounded input %#', (input) => {
        expect(financeLedgerQuerySchema.safeParse(input).success).toBe(false);
    });
});
