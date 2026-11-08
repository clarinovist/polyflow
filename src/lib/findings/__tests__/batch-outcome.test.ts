import { describe, expect, it } from 'vitest';
import { summarizeBatch } from '../batch-outcome';

type Settled = PromiseSettledResult<{ success: boolean; error?: string }>;

const fulfilled = (value: { success: boolean; error?: string }): Settled => ({
    status: 'fulfilled',
    value,
});

describe('summarizeBatch', () => {
    it('counts every successful action', () => {
        const outcome = summarizeBatch([
            fulfilled({ success: true }),
            fulfilled({ success: true }),
        ]);

        expect(outcome).toEqual({ ok: 2, failed: 0, firstError: null });
    });

    it('treats a success:false result as a failure and keeps its message', () => {
        const outcome = summarizeBatch([
            fulfilled({ success: true }),
            fulfilled({ success: false, error: 'Sudah diklaim orang lain.' }),
        ]);

        expect(outcome).toEqual({
            ok: 1,
            failed: 1,
            firstError: 'Sudah diklaim orang lain.',
        });
    });

    it('treats a rejected promise as a failure with a generic message', () => {
        const outcome = summarizeBatch([
            { status: 'rejected', reason: new Error('boom') },
        ]);

        expect(outcome.failed).toBe(1);
        expect(outcome.firstError).toBe('Terjadi kesalahan, coba lagi.');
    });

    it('handles an empty batch', () => {
        expect(summarizeBatch([])).toEqual({ ok: 0, failed: 0, firstError: null });
    });
});
