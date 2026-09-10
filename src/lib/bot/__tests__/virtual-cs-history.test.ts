import { beforeEach, describe, expect, it, vi } from 'vitest';
const completion = vi.fn();
const save = vi.fn();
const getConversation = vi.fn();
const load = vi.fn();
const search = vi.fn();
vi.mock('openai', () => ({ default: class { chat = { completions: { create: completion } }; } }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { helpToolExecution: { create: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../conversation-service', () => ({
    getOrCreateConversation: (...args: unknown[]) => getConversation(...args),
    loadConversationContext: (...args: unknown[]) => load(...args),
    saveConversationExchange: (...args: unknown[]) => save(...args),
    buildLlmHistory: (context: { history: unknown[] }) => context.history,
}));
vi.mock('../tool-registry', () => ({ toolsToOpenAiFormat: () => [] }));
vi.mock('../assistant-tool-access', () => ({ getAvailableAssistantTools: () => [], findAllowedAssistantTool: () => undefined }));
vi.mock('../help-articles', () => ({ searchHelpArticles: (...args: unknown[]) => search(...args) }));
vi.mock('../injection-defense', () => ({ checkPromptInjection: () => ({ safe: true }), logInjectionAttempt: vi.fn() }));
import { generateVirtualCsReply } from '../virtual-cs-service';
import type { AssistantRequestContext } from '../assistant-types';
const context: AssistantRequestContext = { tenantId: 'tenant-1', permissionsVerified: true, sessionUser: { id: 'user-1', role: 'FINANCE', roles: ['FINANCE'], allowedResources: ['/finance'] }, workContext: { pathname: '/finance' }, conversationId: 'requested' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ASSISTANT_CONTEXTUAL_PROFILES', 'true');
    getConversation.mockResolvedValue({ id: 'authorized' });
    load.mockResolvedValue({ history: [], resolvedEntities: new Map() });
    save.mockResolvedValue(undefined);
    search.mockResolvedValue([]);
    completion.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: 'Jawaban berbukti' } }] });
});

describe('assistant exchange persistence integration', () => {
    it('persists greetings without calling the model and stamps server-only access/context', async () => {
        const result = await generateVirtualCsReply({ question: 'halo', channel: 'web' }, context);
        expect(result).toMatchObject({ conversationId: 'authorized', historySaved: true });
        expect(completion).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'authorized', question: 'halo', metadata: expect.objectContaining({ contextKey: 'finance:/finance', accessScope: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
        expect(getConversation.mock.calls[0][0]).toMatchObject({ conversationId: 'requested', tenantId: 'tenant-1', userId: 'user-1', channel: 'web' });
        expect(load.mock.calls[0][2]).toBe(save.mock.calls[0][0].metadata.accessScope);
    });
    it('persists deterministic troubleshooting replies', async () => {
        const result = await generateVirtualCsReply({ question: 'Nilai input berubah', channel: 'web' }, context);
        expect(result.historySaved).toBe(true);
        expect(result.disposition).toBe('NEEDS_CLARIFICATION');
        expect(completion).not.toHaveBeenCalled();
    });
    it('waits for exchange persistence before returning the normal answer', async () => {
        let finishSave!: () => void;
        save.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));
        let finished = false;
        const pending = generateVirtualCsReply({ question: 'Jelaskan invoice', channel: 'web' }, context).then((r) => { finished = true; return r; });
        await vi.waitFor(() => expect(finishSave).toBeDefined());
        expect(finished).toBe(false);
        finishSave();
        expect(await pending).toMatchObject({ answer: 'Jawaban berbukti', historySaved: true });
    });
    it('reports unsaved reply on database write failure without suppressing answer', async () => {
        save.mockRejectedValue(new Error('write failed'));
        expect(await generateVirtualCsReply({ question: 'halo', channel: 'web' }, context)).toMatchObject({ historySaved: false });
    });
    it('persists network fallback so it also survives remount', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        completion.mockRejectedValue(new Error('synthetic network error'));
        const result = await generateVirtualCsReply({ question: 'Jelaskan invoice', channel: 'web' }, context);
        expect(result).toMatchObject({ historySaved: true, conversationId: 'authorized' });
        expect(save).toHaveBeenCalledTimes(1);
        vi.restoreAllMocks();
    });
    it('does not load or write a client-supplied conversation without identity', async () => {
        await generateVirtualCsReply({ question: 'halo', channel: 'web' }, { conversationId: 'foreign' });
        expect(getConversation).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    });
});
