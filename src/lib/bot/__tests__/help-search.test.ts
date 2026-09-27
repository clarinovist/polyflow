import { beforeEach, describe, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({ $queryRaw: query }), prisma: {} }));
import { searchHelpArticles } from '../help-articles';
import { toolRegistry } from '../tool-registry';
import type { AssistantUserContext } from '../assistant-types';
const article = { title: 'Tutup PO', slug: 'tutup-po', summary: 'Ringkasan singkat', modules: ['purchasing'], tags: ['po'], bodyExcerpt: '1. Pilih Tutup PO. 2. Isi Alasan penutupan. 3. Konfirmasi.', helpfulCount: 0 };
beforeEach(() => { query.mockReset(); query.mockResolvedValue([article]); });

describe('bounded relevant knowledge evidence', () => {
    it('binds terms/module, filters published rows and orders before limit', async () => {
        expect(await searchHelpArticles('cara closed PO', 'purchasing', 3)).toEqual([article]);
        const sql = query.mock.calls[0][0];
        expect(sql.text).toContain("status = 'PUBLISHED'");
        expect(sql.text).toContain('ORDER BY');
        expect(sql.text).toContain('LIMIT');
        expect(sql.values).toContain('%tutup%');
        expect(sql.values).toContain('%po%');
        expect(sql.values).not.toContain('%cara%');
        expect(sql.values).toContain('purchasing');
        expect(sql.values.at(-1)).toBe(3);
    });
    it.each(['', 'cara gimana', 'halo'])('skips nonspecific searches %s', async (question) => {
        expect(await searchHelpArticles(question)).toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });
    it('caps requests and rejects non-positive/invalid limits', async () => {
        await searchHelpArticles('retur', undefined, 999);
        expect(query.mock.calls[0][0].values.at(-1)).toBe(10);
        query.mockClear();
        for (const limit of [0, -1, NaN, Infinity]) expect(await searchHelpArticles('retur', undefined, limit)).toEqual([]);
        expect(query).not.toHaveBeenCalled();
    });
    it('delivers actual steps and source rather than a 150-character summary', async () => {
        const tool = toolRegistry.find((t) => t.name === 'search_help_articles')!;
        const result = await tool.execute({ query: 'cara closed PO' }, {} as AssistantUserContext);
        expect(result.facts[0].value).toContain('Isi Alasan penutupan');
        expect(result.facts[0].value).toContain('/support/tutup-po');
        query.mockResolvedValue([]);
        expect((await tool.execute({ query: 'retur' }, {} as AssistantUserContext)).completeness).toBe('partial');
    });
});
