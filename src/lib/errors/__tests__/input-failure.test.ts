import { describe, expect, it } from 'vitest';
import { inputFailure, interruptedInput } from '../input-failure';

describe('input failure presentation', () => {
    it('keeps WIP internals out of the operator message and preserves a support code', () => {
        const result = inputFailure({ code: 'PRODUCTION_WIP_UNRESOLVED', error: 'vektor jurnal tidak valid' }, 'production');
        expect(result.title).toBe('Hasil belum tersimpan');
        expect(result.message).toContain('Finance');
        expect(result.message).not.toMatch(/WIP|vektor|jurnal/);
        expect(result.code).toBe('PRODUCTION_WIP_UNRESOLVED');
    });

    it.each(['INTERNAL_USAGE_MISSING_MAPPING', 'INTERNAL_USAGE_MISSING_COST', 'INTERNAL_USAGE_MISSING_SOURCE_BASIS', 'INTERNAL_USAGE_SOURCE_ACCOUNT_MISMATCH', 'INTERNAL_USAGE_INSUFFICIENT_GL'])(
        'explains %s without exposing account balances', (code) => {
            const result = inputFailure({ code, error: 'secret account balance' }, 'usage');
            expect(result.message).toContain('Finance');
            expect(result.message).not.toContain('secret');
            expect(result.title).toBe('Pemakaian belum dicatat');
        },
    );

    it('keeps the affected item in a bulk error, but does not expose other details', () => {
        const result = inputFailure({ code: 'OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS', details: { productName: 'Barang contoh', accountBalance: 999, reason: 'internal' } }, 'opname');
        expect(result.message).toContain('Barang contoh');
        expect(result.message).not.toMatch(/999|internal/);
    });

    it('does not tell users to create receipts or adjustments to bypass a GL shortage', () => {
        const result = inputFailure({ code: 'INVENTORY_GL_INSUFFICIENT', error: 'di-receipt/adjustment' }, 'adjustment');
        expect(result.message).toContain('Finance');
        expect(result.message).not.toMatch(/receipt|adjustment/);
    });

    it('keeps business validation specific without pretending every conflict is unsaved', () => {
        expect(inputFailure({ code: 'INSUFFICIENT_STOCK', error: 'Bahan A kurang 2 KG.' }, 'production').message).toBe('Bahan A kurang 2 KG.');
        const duplicate = inputFailure({ code: 'PACKAGED_REQUEST_REUSED', error: 'raw' }, 'production');
        expect(duplicate.title).toContain('Periksa riwayat');
        expect(duplicate.message).not.toContain('belum tersimpan');
        expect(duplicate.message).toContain('dibatalkan');
    });

    it.each(['INTERNAL_ERROR', 'EXTERNAL_SERVICE_ERROR'])(
        'does not claim a rollback for %s (including failure after commit)', (code) => {
            const result = inputFailure({ code, error: 'database host secret' }, 'opname');
            expect(result.title).toBe('Status penyimpanan belum diketahui');
            expect(result.message).toContain('Periksa');
            expect(result.message).not.toContain('secret');
        },
    );

    it('preserves permission recovery without blaming data', () => {
        expect(inputFailure({ code: 'AUTHORIZATION_ERROR', error: 'raw' }, 'void').message).toContain('akses');
    });

    it.each(['production', 'usage', 'adjustment', 'opname', 'void'] as const)(
        'treats a transport interruption for %s as an unknown result', (scope) => {
            const result = interruptedInput(new Error('Failed to fetch'), scope);
            expect(result.title).toBe('Status penyimpanan belum diketahui');
            expect(result.message).toContain('Periksa');
        },
    );

    it('warns to retain input before reloading an outdated page', () => {
        const result = interruptedInput(new Error('Failed to find Server Action abc'), 'production');
        expect(result.title).toBe('Halaman perlu dimuat ulang');
        expect(result.message).toContain('Catat isian');
        expect(result.message).not.toContain('abc');
    });
});
