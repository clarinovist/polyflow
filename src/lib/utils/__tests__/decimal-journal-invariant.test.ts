import { describe, expect, it } from 'vitest';
import { manualJournalSchema } from '@/lib/schemas/journal';
import { parseMoneyInput } from '../decimal-input';

const journal = (debit: number | null, credit: number | null) => ({
    entryDate: new Date('2026-09-10T00:00:00.000Z'),
    description: 'Decimal regression journal',
    reference: 'TEST',
    lines: [
        { accountId: 'debit-account', debit, credit: 0 },
        { accountId: 'credit-account', debit: 0, credit },
    ],
});

describe('decimal journal invariant', () => {
    it('keeps localized debit and credit balanced at the parsed value', () => {
        const result = manualJournalSchema.safeParse(
            journal(parseMoneyInput('5.304,17'), parseMoneyInput('5,304.17')),
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.lines[0].debit).toBe(5304.17);
            expect(result.data.lines[1].credit).toBe(5304.17);
        }
    });

    it('cannot report balanced when one side has the historical x100 error', () => {
        expect(
            manualJournalSchema.safeParse(journal(5304.17, 530417)).success,
        ).toBe(false);
    });

    it('rejects an invalid amount instead of silently turning it into zero', () => {
        expect(
            manualJournalSchema.safeParse(
                journal(Number.NaN, parseMoneyInput('5304,17')),
            ).success,
        ).toBe(false);
    });
});
