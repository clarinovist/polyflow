import { describe, expect, it } from 'vitest';
import {
    buildTroubleshootingResponse,
    isRelevantTroubleshootingArticle,
    isUiIssueReport,
} from '../troubleshooting';
import type { HelpSearchResult } from '../help-articles';

function article(overrides: Partial<HelpSearchResult> = {}): HelpSearchResult {
    return {
        title: 'Mengisi nominal desimal',
        slug: 'nominal-desimal',
        summary: 'Panduan memasukkan nominal dengan pecahan desimal.',
        modules: ['finance'],
        tags: ['nominal', 'desimal'],
        bodyExcerpt: 'Masukkan nominal lalu periksa kembali nilai yang tampil.',
        helpfulCount: 2,
        ...overrides,
    };
}

describe('troubleshooting fallback', () => {
    it('does not steal operational diagnosis questions from the agentic tool path', () => {
        expect(isUiIssueReport('Kenapa SO-2026-0001 gagal dikirim?')).toBe(false);
        expect(isUiIssueReport('Kenapa invoice gagal dibayar?')).toBe(false);
        expect(isUiIssueReport('Kenapa invoice tidak bisa dibayar?')).toBe(false);
        expect(isUiIssueReport('Penulisan koma tidak bisa dan nilainya berubah')).toBe(
            true,
        );
    });

    it('asks for reproduction and warns against saving changed critical values without guessing a menu', () => {
        const response = buildTroubleshootingResponse(
            'Penulisan koma di nominal tidak bisa dan nilainya berubah',
            [],
        );

        expect(response.disposition).toBe('NEEDS_CLARIFICATION');
        expect(response.needsClarification).toBe(true);
        expect(response.answer).toContain('belum dapat memastikan penyebabnya');
        expect(response.answer).toContain('input persis yang diketik');
        expect(response.answer).toContain('jangan simpan, post');
        expect(response.answer).not.toMatch(/Finance\s*[>→]/i);
        expect(response.answer).not.toContain('bukan bug');
    });

    it('ignores a KB result that only shares generic issue words', () => {
        const unrelated = article({
            title: 'Mengatasi printer error',
            slug: 'printer-error',
            summary: 'Panduan koneksi printer label.',
            tags: ['printer'],
            bodyExcerpt: 'Periksa kabel printer.',
        });
        expect(
            isRelevantTroubleshootingArticle(
                'Penulisan koma di nominal tidak bisa',
                unrelated,
            ),
        ).toBe(false);
        expect(
            buildTroubleshootingResponse(
                'Penulisan koma di nominal tidak bisa',
                [unrelated],
            ).citedArticles,
        ).toEqual([]);
    });

    it('cites relevant KB as guidance without claiming a verified diagnosis', () => {
        const response = buildTroubleshootingResponse(
            'Nominal desimal berubah setelah diketik',
            [article()],
        );

        expect(response.citedArticles?.[0].slug).toBe('nominal-desimal');
        expect(response.answer).toContain('bukan diagnosis terverifikasi');
        expect(response.answer).toContain('/support/nominal-desimal');
        expect(response.disposition).toBe('NEEDS_CLARIFICATION');
    });
});
