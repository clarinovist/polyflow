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
