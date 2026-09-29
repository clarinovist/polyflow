import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/prisma', () => ({ prisma: {}, tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() }));
vi.mock('../help-articles', () => ({ searchHelpArticles: vi.fn().mockResolvedValue([{ slug: 'global-guide', title: 'Global', summary: 'Guide', bodyExcerpt: 'Public' }]) }));
vi.mock('../feature-flags', () => ({ isFeatureEnabled: vi.fn().mockReturnValue(true) }));
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { isFeatureEnabled } from '../feature-flags';
import { searchCombinedKnowledge } from '../tenant-knowledge';
import { getToolByName } from '../tool-registry';
import type { AssistantUserContext } from '../assistant-types';
const context: AssistantUserContext = { userId: 'user', tenantId: 'a', roles: ['FINANCE'], allowedResources: ['/finance'], channel: 'web', locale: 'id-ID' };
const query = vi.fn();
const readOnly = vi.fn();
const tx = { $executeRaw: readOnly, $queryRaw: query };
const db = { $transaction: vi.fn(async fn => fn(tx)) } as unknown as PrismaClient;
const run = (fn: () => unknown, tenantId = 'a') => tenantContext.run(db, () => tenantIdContext.run(tenantId, fn));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(isFeatureEnabled).mockReturnValue(true); query.mockResolvedValue([{ id: 'private-id', slug: 'global-guide', title: 'Internal', summary: 'Internal SOP', bodyExcerpt: 'Private content', source: 'tenant-kb' }]); });
describe('combined knowledge read path', () => {
    it('keeps anonymous/global-only access without querying private tables', async () => {
        expect((await searchCombinedKnowledge('invoice', undefined, undefined))[0].source).toBe('global-kb');
        vi.mocked(isFeatureEnabled).mockReturnValue(false);
        await searchCombinedKnowledge('invoice', undefined, context);
        expect(query).not.toHaveBeenCalled();
    });
    it('rejects missing and mismatched live tenant contexts', async () => {
        await expect(searchCombinedKnowledge('invoice', undefined, context)).rejects.toThrow(/tenant/);
        await expect(run(() => searchCombinedKnowledge('invoice', undefined, context), 'b')).rejects.toThrow(/tenant/);
        expect(query).not.toHaveBeenCalled();
    });
    it('executes bounded read-only query with row tenant, publication, sensitivity and resource constraints', async () => {
        const result = await run(() => searchCombinedKnowledge('invoice draft', 'finance', context));
        expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'global-kb' }), expect.objectContaining({ source: 'tenant-kb' })]));
        const sql = query.mock.calls[0][0];
        expect(sql.sql).toContain('"tenantId" = ?');
        expect(sql.sql).toContain("a.status = 'PUBLISHED'");
        expect(sql.sql).toContain("a.sensitivity = 'INTERNAL'");
        expect(sql.sql).toContain('NOT EXISTS');
        expect(sql.values).toContain('a');
        expect(sql.values).toContain('finance');
        expect(readOnly.mock.calls[0][0].join('')).toBe('SET TRANSACTION READ ONLY');
    });
    it('wires registry evidence without creating a global article URL for a tenant slug collision', async () => {
        const result = await run(() => getToolByName('search_help_articles')!.execute({ query: 'invoice' }, context));
        expect(result).toMatchObject({ source: 'tenant-kb', entities: expect.arrayContaining([{ type: 'TenantKnowledgeArticle', id: 'private-id', label: 'Internal' }]) });
    });
    it('returns global results for stopword-only and empty tenant matches', async () => {
        await run(() => searchCombinedKnowledge('halo', undefined, context));
        expect(query).not.toHaveBeenCalled();
        query.mockResolvedValue([]);
        expect(await run(() => searchCombinedKnowledge('invoice', undefined, { ...context, allowedResources: 'ALL' }))).toEqual([expect.objectContaining({ source: 'global-kb' })]);
    });
});
