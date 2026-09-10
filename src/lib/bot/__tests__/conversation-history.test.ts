import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantUserContext } from '../assistant-types';
const findMany = vi.fn();
const findFirst = vi.fn();
vi.mock('@/lib/core/prisma', () => ({ prisma: { helpConversation: { findMany: (...args: unknown[]) => findMany(...args), findFirst: (...args: unknown[]) => findFirst(...args) } } }));
import { historyQuerySchema, queryConversationHistory } from '../conversation-history';
import { conversationAccessScope } from '../conversation-scope';

const context: AssistantUserContext = { tenantId: 'tenant-1', userId: 'user-1', roles: ['FINANCE'], allowedResources: ['/finance'], channel: 'web', locale: 'id-ID' };
const pathname = '/finance/invoices/sales/inv-1';
const contextKey = `finance:${pathname}:invoice:inv-1`;
const meta = { pathname, profile: 'finance', contextKey, accessScope: conversationAccessScope(context) };
function message(id = 'm-1') { return { id, role: 'ASSISTANT', content: 'Private answer', createdAt: new Date(), evidenceJson: { ...meta, response: { citedArticles: [{ slug: 'help', title: 'Help' }], evidence: [{ source: 'tenant-data', label: 'Data', checkedAt: '2026-09-11' }], confidence: 0.8, interactionId: 'must-not-expose' } } }; }

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ASSISTANT_CONTEXTUAL_PROFILES', 'true'); });

describe('private conversation history', () => {
    it('scopes list and previews to live tenant/user/web permissions and limits pages', async () => {
        findMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ id: String(i), lastMessageAt: new Date(), messages: [{ content: 'Q'.repeat(200), evidenceJson: meta }] })));
        const result = await queryConversationHistory(context, { mode: 'list', pathname, offset: 20 });
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', channel: 'web', status: 'ACTIVE', messages: { some: { evidenceJson: { path: ['accessScope'], equals: meta.accessScope } } } }), take: 21, skip: 20 }));
        expect(findMany.mock.calls[0][0].select.messages.where.evidenceJson.equals).toBe(meta.accessScope);
        expect('conversations' in result && result.conversations).toHaveLength(20);
        expect('nextOffset' in result && result.nextOffset).toBe(40);
        expect('conversations' in result && result.conversations?.[0].title.length).toBe(100);
    });

    it('restores latest matching context and whitelists presentation, not audit IDs', async () => {
        findFirst.mockResolvedValue({ id: 'conv-1', messages: [message('new'), message('old')] });
        const result = await queryConversationHistory(context, { mode: 'latest', pathname, offset: 0 });
        const query = findFirst.mock.calls[0][0];
        expect(query.where.messages.some.AND[0].evidenceJson.equals).toBe(contextKey);
        expect(query.select.messages.where).toEqual(query.where.messages.some);
        expect('conversation' in result && result.conversation?.canContinue).toBe(true);
        expect('conversation' in result && result.conversation?.messages[0].id).toBe('old');
        expect(JSON.stringify(result)).not.toContain('must-not-expose');
        expect(JSON.stringify(result)).toContain('citedArticles');
    });

    it('detail IDOR is scoped, missing and foreign IDs return indistinguishable null', async () => {
        findFirst.mockResolvedValue(null);
        for (const id of ['foreign-user-id', 'foreign-tenant-id', 'missing']) {
            expect(await queryConversationHistory(context, { mode: 'detail', pathname, conversationId: id, offset: 0 })).toEqual({ conversation: null });
            expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id, tenantId: 'tenant-1', userId: 'user-1', channel: 'web' }) }));
        }
    });

    it('a role/grant/policy change changes scope; equivalent grants have stable scope', () => {
        expect(conversationAccessScope({ ...context, roles: ['FINANCE', 'FINANCE'] })).toBe(meta.accessScope);
        expect(conversationAccessScope({ ...context, allowedResources: [] })).not.toBe(meta.accessScope);
        expect(conversationAccessScope({ ...context, roles: ['ADMIN'] })).not.toBe(meta.accessScope);
        expect(conversationAccessScope({ ...context, tenantId: 'tenant-2' })).not.toBe(meta.accessScope);
        expect(conversationAccessScope({ ...context, userId: 'user-2' })).not.toBe(meta.accessScope);
        expect(conversationAccessScope({ ...context, allowedResources: 'ALL' })).not.toBe(meta.accessScope);
    });

    it('bounds message pagination and marks different context read-only', async () => {
        findFirst.mockResolvedValue({ id: 'conv-1', messages: Array.from({ length: 51 }, (_, i) => message(String(i))) });
        const result = await queryConversationHistory(context, { mode: 'detail', pathname: '/dashboard', conversationId: 'conv-1', offset: 50 });
        expect(findFirst.mock.calls[0][0].select.messages).toMatchObject({ skip: 50, take: 51 });
        expect('conversation' in result && result.conversation).toMatchObject({ canContinue: false, nextOffset: 100 });
        expect('conversation' in result && result.conversation?.messages).toHaveLength(50);
    });

    it('rejects missing authority and malformed queries, without database access', async () => {
        await expect(queryConversationHistory({ ...context, tenantId: '' }, { mode: 'list', pathname, offset: 0 })).rejects.toThrow();
        expect(findMany).not.toHaveBeenCalled();
        for (const value of [{ mode: 'detail' }, { offset: -1 }, { offset: 1.2 }, { conversationId: '../x' }, { pathname: 'x'.repeat(301) }]) expect(historyQuerySchema.safeParse(value).success).toBe(false);
    });

    it('handles empty list and malformed optional display metadata safely', async () => {
        findMany.mockResolvedValue([]);
        expect(await queryConversationHistory(context, { mode: 'list', pathname, offset: 0 })).toEqual({ conversations: [], nextOffset: null });
        findFirst.mockResolvedValue({ id: 'c', messages: [{ ...message(), evidenceJson: null }] });
        const result = await queryConversationHistory(context, { mode: 'detail', pathname, conversationId: 'c', offset: 0 });
        expect('conversation' in result && result.conversation).toMatchObject({ pathname: '/', canContinue: false });
    });
});
