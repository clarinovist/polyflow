import { beforeEach, describe, expect, it, vi } from 'vitest';
const findFirst = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const createMessage = vi.fn();
const update = vi.fn();
const transaction = vi.fn();
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    helpConversation: { findFirst: (...args: unknown[]) => findFirst(...args), findUnique: (...args: unknown[]) => findUnique(...args), create: (...args: unknown[]) => create(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
} }));
import { getOrCreateConversation, loadConversationContext, saveConversationExchange } from '../conversation-service';

beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation(async (fn) => fn({ $queryRaw: vi.fn().mockResolvedValue([]), helpMessage: { create: createMessage, findFirst: vi.fn().mockResolvedValue(null) }, helpConversation: { update } }));
    createMessage.mockResolvedValue({ id: 'm', createdAt: new Date('2026-09-11T01:00:00Z') });
    update.mockResolvedValue({});
});

describe('conversation persistence', () => {
    it('persists whole ordered exchange atomically and preserves full text/metadata', async () => {
        const answer = 'x'.repeat(5000);
        await saveConversationExchange({ conversationId: 'conv-1', question: 'Question', answer, metadata: { accessScope: 'scope', contextKey: 'key' }, assistantMetadata: { entities: [], response: { answer } } });
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(createMessage.mock.calls[0][0].data).toMatchObject({ role: 'USER', evidenceJson: { accessScope: 'scope', contextKey: 'key' } });
        expect(createMessage.mock.calls[1][0].data.content.length).toBe(5000);
        expect(createMessage.mock.calls[1][0].data.createdAt.getTime()).toBeGreaterThan(new Date('2026-09-11T01:00:00Z').getTime());
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'conv-1' } }));
    });
    it('propagates persistence failure, rather than silently reporting saved', async () => {
        createMessage.mockRejectedValueOnce(new Error('write failed'));
        await expect(saveConversationExchange({ conversationId: 'c', question: 'q', answer: 'a', metadata: {} })).rejects.toThrow('write failed');
        expect(update).not.toHaveBeenCalled();
    });
    it('scopes resume by tenant/user/channel/current grants and context', async () => {
        findFirst.mockResolvedValue({ id: 'owned' });
        expect(await getOrCreateConversation({ tenantId: 't', userId: 'u', channel: 'web', conversationId: 'owned', accessScope: 'scope', contextKey: 'key' })).toEqual({ id: 'owned' });
        expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: 'owned', tenantId: 't', userId: 'u', channel: 'web', status: 'ACTIVE', messages: { every: { AND: [ { evidenceJson: { path: ['accessScope'], equals: 'scope' } }, { evidenceJson: { path: ['contextKey'], equals: 'key' } } ] } } });
    });
    it('creates a fresh thread when ID is not authorized or context changed', async () => {
        findFirst.mockResolvedValue(null); create.mockResolvedValue({ id: 'fresh' });
        expect(await getOrCreateConversation({ tenantId: 't', userId: 'u', channel: 'web', conversationId: 'foreign' })).toEqual({ id: 'fresh' });
        expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: 't', userId: 'u', channel: 'web' });
    });
    it('also filters resumed LLM context by access scope, excluding legacy/stale permissions', async () => {
        findUnique.mockResolvedValue({ id: 'c', summary: 'old', messages: [] });
        await loadConversationContext('c', 'key', 'scope');
        expect(findUnique.mock.calls[0][0].select.messages.where).toEqual({ evidenceJson: { path: ['contextKey'], equals: 'key' }, AND: [{ evidenceJson: { path: ['accessScope'], equals: 'scope' } }] });
    });
});
