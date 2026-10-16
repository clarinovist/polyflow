import { describe, expect, it } from 'vitest';
import { describeServerActionFailure } from '../server-action-errors';

describe('describeServerActionFailure', () => {
    it('explains a stale deploy instead of reporting a generic failure', () => {
        const result = describeServerActionFailure(
            new Error(
                'Failed to find Server Action "40ee15e03c0d543fcd528ff2f4f272e11d63d1f73f". This request might be from an older or newer deployment.',
            ),
            'Gagal menyimpan',
        );

        expect(result.isStaleDeploy).toBe(true);
        expect(result.isNetworkError).toBe(false);
        expect(result.message).toContain('Muat ulang halaman');
    });

    it('reports a connectivity failure distinctly', () => {
        const result = describeServerActionFailure(
            new Error('TypeError: fetch failed'),
            'Gagal menyimpan',
        );

        expect(result.isStaleDeploy).toBe(false);
        expect(result.isNetworkError).toBe(true);
    });

    it('falls back to the caller message for anything else', () => {
        const result = describeServerActionFailure(
            new Error('boom'),
            'Gagal menyimpan',
        );

        expect(result).toEqual({
            message: 'Gagal menyimpan',
            isStaleDeploy: false,
            isNetworkError: false,
        });
    });

    it('handles non-Error throwables without crashing', () => {
        const result = describeServerActionFailure(undefined, 'Gagal');

        expect(result.message).toBe('Gagal');
        expect(result.isStaleDeploy).toBe(false);
    });
});
