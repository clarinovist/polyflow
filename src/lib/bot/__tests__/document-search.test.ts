import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { documentNumberPredicate, documentSearchMeta, normalizeDocumentSearch, normalizedDocumentPredicate } from '../document-search';
import { resolveOutcome } from '../chat-audit';

const outcome = (answer: string, disposition?: 'RESOLVED') => resolveOutcome({
    channel: 'web', product: 'polyflow', question: 'fixture', allowed: true,
    success: true, latencyMs: 1, answer, disposition,
});

describe('document search normalization', () => {
    it.each([
        [' PO PO-2026-0421 ', 'PO-2026-0421'],
        ['BILL - 2026 -0422', 'BILL-2026-0422'],
        ['BILL‑2026‑0422', 'BILL-2026-0422'],
        ['PO–2026–0421', 'PO-2026-0421'],
        ['SO SO — 2026 — 0421', 'SO-2026-0421'],
        ['INV\u00a0-\u00a02026 - 0421', 'INV-2026-0421'],
    ])('normalizes %s without a digit-only fallback', (raw, expected) => {
        const candidates = normalizeDocumentSearch(raw);
        expect(candidates).toContain(expected);
        expect(candidates).toContain(raw.trim());
        expect(candidates.length).toBeLessThanOrEqual(3);
        expect(candidates).not.toContain('0421');
    });
    it.each(['Fixture - Supplier', 'Customer 0421', '0421', '%', '', 'PO-2026-0421 extra text'])('does not rewrite ordinary text %s', raw => {
        expect(normalizeDocumentSearch(raw)).toEqual([raw.trim()]);
    });
    it('uses bound SQL values with literal wildcard escaping', () => {
        const sql = documentNumberPredicate(Prisma.sql`po."orderNumber"`, "A%_\\' OR 1=1");
        expect(sql.sql).toBe('po."orderNumber" ILIKE ?');
        expect(sql.values).toEqual(["%A\\%\\_\\\\' OR 1=1%"]);
    });
    it('normalizes stored delimiters only for recognized documents with bound values', () => {
        expect(normalizedDocumentPredicate(Prisma.sql`"invoiceNumber"`, 'Fixture Name').sql).toBe('FALSE');
        const predicate = normalizedDocumentPredicate(Prisma.sql`"invoiceNumber"`, 'bill - 2026 -0421');
        expect(predicate.sql).toContain('regexp_replace');
        expect(predicate.values.at(-1)).toBe('BILL-2026-0421');
    });
    it('retains only allowlisted document inputs in audit metadata', () => {
        expect(documentSearchMeta('PO PO-2026-0421', 0)).toMatchObject({
            searchTerm: 'PO PO-2026-0421', candidates: ['PO PO-2026-0421', 'PO-2026-0421'], matchCount: 0, matchCountScope: 'returned',
        });
        for (const raw of ['Fixture Person', 'user@example.invalid', 'PO-2026-0421 private note', 'UNKNOWN-2026-0421', undefined, {}]) {
            expect(documentSearchMeta(raw, null)).toEqual({ searchTerm: null, candidates: [], matchCount: null, matchCountScope: 'unknown' });
        }
    });
});

describe('unresolved outcomes cannot be marked resolved', () => {
    it.each([
        'Maaf, saya belum dapat dipastikan karena data belum lengkap.',
        'Saya tidak menemukan panduan untuk masalah ini.',
        'Saya belum menemukan artikel yang menjawab pertanyaan itu.',
    ])('marks weak answer PARTIAL with or without disposition: %s', answer => {
        expect(outcome(answer)).toBe('PARTIAL');
        expect(outcome(answer, 'RESOLVED')).toBe('PARTIAL');
    });
    it('classifies the actual empty-model fallback as FAILED', () => {
        expect(outcome('Maaf, saya belum dapat merangkum analisis pada saat ini.')).toBe('FAILED');
    });
    it('still accepts a substantive resolved answer', () => {
        expect(outcome('Buka Sales → Order, pilih dokumen lalu lihat status.', 'RESOLVED')).toBe('SUCCESS');
    });
});
