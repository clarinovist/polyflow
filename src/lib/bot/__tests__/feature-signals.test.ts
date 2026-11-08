import { describe, it, expect } from 'vitest';
import {
    isFeatureRequest,
    normalizeRequest,
    canonicalizeRequest,
    FEATURE_CANDIDATE_MIN_USERS,
} from '../feature-signals';

describe('feature request detection', () => {
    it('detects Indonesian explicit requests', () => {
        expect(isFeatureRequest('Tolong tambahkan fitur laporan umur piutang')).toBe(true);
        expect(isFeatureRequest('Minta dibuatkan menu rekap borongan dong')).toBe(true);
        expect(isFeatureRequest('Kapan bisa ada tombol export excel?')).toBe(true);
        expect(isFeatureRequest('Seharusnya ada peringatan stok minus')).toBe(true);
        expect(isFeatureRequest('Usulan fitur: template WO berulang')).toBe(true);
    });

    it('detects English explicit requests', () => {
        expect(isFeatureRequest('Please add a dark mode button')).toBe(true);
        expect(isFeatureRequest('I wish there was a quarterly report page')).toBe(true);
    });

    it('ignores how-to questions and noise', () => {
        expect(isFeatureRequest('Bagaimana cara input sales order?')).toBe(false);
        expect(isFeatureRequest('Kenapa stok minus?')).toBe(false);
        expect(isFeatureRequest('ok')).toBe(false);
        expect(isFeatureRequest('')).toBe(false);
    });
});

describe('request normalization', () => {
    it('is stable across politeness variants', () => {
        const a = normalizeRequest("Tolong tambahkan fitur laporan umur piutang");
        const b = normalizeRequest("minta dibuatkan laporan umur piutang dong");
        expect(a).toBe(b);
        expect(a.length).toBeGreaterThan(0);
    });

    it('caps canonical length', () => {
        expect(canonicalizeRequest('x'.repeat(500)).length).toBe(200);
    });
});

describe('candidate threshold', () => {
    it('requires multiple distinct users', () => {
        expect(FEATURE_CANDIDATE_MIN_USERS).toBeGreaterThanOrEqual(2);
    });
});

describe('signal kind resolution', () => {
    it('keeps explicit requests as explicit_request whatever the outcome', async () => {
        const { resolveSignalKind } = await import('../feature-signals');
        expect(resolveSignalKind('Tolong tambahkan fitur laporan umur piutang', 'SUCCESS')).toBe('explicit_request');
        expect(resolveSignalKind('Tolong tambahkan fitur laporan umur piutang', 'PARTIAL')).toBe('explicit_request');
    });

    it('treats a partially answered question as unanswered_repeat', async () => {
        const { resolveSignalKind } = await import('../feature-signals');
        expect(resolveSignalKind('Bagaimana rekap borongan per minggu?', 'PARTIAL')).toBe('unanswered_repeat');
    });

    it('ignores system failures, blocked, escalated and answered questions', async () => {
        const { resolveSignalKind } = await import('../feature-signals');
        for (const outcome of ['FAILED', 'BLOCKED', 'ESCALATED', 'SUCCESS'] as const) {
            expect(resolveSignalKind('Bagaimana rekap borongan per minggu?', outcome)).toBeNull();
        }
    });
});
