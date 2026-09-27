import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({}), prisma: {} }));
vi.mock('@/lib/config/logger', () => ({ logger: {} }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('../metrics', () => ({ recordVirtualCsMetric: vi.fn() }));
import { buildIntentInstructions, detectAssistantIntent } from '../assistant-intent';
import { helpSearchTerms } from '../help-search-terms';
import { analyzeForClarification, calculateConfidence } from '../clarifier';
import { resolveOutcome } from '../chat-audit';
import { createEvidence } from '../evidence';
import { enforceGuardrails } from '../guardrails';

const kb = createEvidence({ summary: 'Panduan', facts: [{ label: 'PO', value: 'Langkah' }], source: 'global-kb', entities: [
    { type: 'HelpArticle', id: 'a', label: 'Panduan A' },
    { type: 'HelpArticle', id: 'b', label: 'Panduan B' },
] });

describe('anonymized assistant misunderstanding regressions', () => {
    it.each(['cara closed PO', 'cara menghapus order pembelian', 'aku cuma nanya cara mengisi retur penjualan di finance gmn?', 'form retur penjualan di sebelah mana ya?'])(
        'treats %s as guidance, not executing a transaction', (question) => {
            expect(detectAssistantIntent(question)).toBe('guidance');
            expect(enforceGuardrails(question).allowed).toBe(true);
            expect(buildIntentInstructions(question)).toContain('bukan menjelaskan langkah UI');
        },
    );
    it('distinguishes diagnosis, data lookup, execution and conversation', () => {
        expect(detectAssistantIntent('ini knp posting kredit retur nya masi abu abu ya')).toBe('diagnosis');
        expect(detectAssistantIntent('apakah ada draft retur?')).toBe('data');
        expect(detectAssistantIntent('tolong hapus PO sekarang')).toBe('execution');
        expect(detectAssistantIntent('terima kasih')).toBe('conversation');
        expect(enforceGuardrails('hapus invoice INV-SYNTHETIC').allowed).toBe(false);
    });
    it('does not ask which article just because multiple KB results were retrieved', () => {
        expect(analyzeForClarification('cara closed PO', [kb], []).needsClarification).toBe(false);
    });
    it('does not turn small talk and follow-up acknowledgements into data-not-found', () => {
        expect(analyzeForClarification('terima kasih', [], []).needsClarification).toBe(false);
        expect(analyzeForClarification('iya', [], [{ role: 'assistant', content: 'Mau panduan?' }]).needsClarification).toBe(false);
    });
    it('does not inflate confidence by repeating KB searches', () => {
        expect(calculateConfidence([kb, kb, kb, kb], false)).toBe(calculateConfidence([kb], false));
        expect(calculateConfidence([kb], false)).toBeLessThan(0.8);
        expect(calculateConfidence([], false)).toBe(0.3);
        expect(calculateConfidence([{ ...kb, completeness: 'partial' }], false)).toBe(0.3);
    });
    it.each([
        'Belum dapat dipastikan dari data yang tersedia.',
        'Saya belum menemukan artikel yang membahas cara menutup PO.',
        'Saya tidak punya akses alat data transaksi untuk memeriksa status retur.',
    ])('does not mark an unresolved response successful: %s', (answer) => {
        expect(resolveOutcome({ channel: 'web', product: 'polyflow', question: 'Pertanyaan sintetis', answer, allowed: true, success: true, latencyMs: 1 })).toBe('PARTIAL');
    });
    it('removes filler, handles short PO and common mixed-language terms', () => {
        expect(helpSearchTerms('cara closed PO')).toEqual([
            ['tutup', 'penutupan', 'close', 'closed'], ['po', 'purchase', 'pembelian'],
        ]);
        expect(helpSearchTerms('gimana cara create akun baru')).toEqual([['akun', 'coa']]);
        expect(helpSearchTerms('cara mentup pesanan pembelian')).toContainEqual(['tutup', 'penutupan', 'close', 'closed']);
        expect(helpSearchTerms('halo cara')).toEqual([]);
        expect(helpSearchTerms('po purchase pembelian')).toHaveLength(1);
    });
});
