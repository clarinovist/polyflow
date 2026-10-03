import { describe, expect, it, vi } from 'vitest';
import { AssistantWorkerClient } from '../worker-client';

const envelope = {
    protocolVersion: 1 as const,
    requestId: '11111111-1111-4111-8111-111111111111',
    publicConversationId: 'conversation-one',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web' as const,
    question: 'synthetic question',
    workContext: { pathname: '/' },
};

describe('AssistantWorkerClient', () => {
    it('uses the same requestId for submit, watch, status, and abort', async () => {
        const calls: Array<{ url: string; body: string }> = [];
        const streamBody = new ReadableStream({
            start(controller) {
                controller.enqueue(
                    new TextEncoder().encode(
                        `data: ${JSON.stringify({ type: 'done', data: { requestId: envelope.requestId, conversationId: envelope.publicConversationId, answer: 'ok', citations: [], safety: { allowed: true } } })}\n\ndata: [DONE]\n\n`,
                    ),
                );
                controller.close();
            },
        });
        const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
            calls.push({ url: String(url), body: String(init?.body) });
            if (String(url).endsWith('/events')) {
                return new Response(streamBody, { status: 200 });
            }
            return Response.json(
                {
                    requestId: envelope.requestId,
                    publicConversationId: envelope.publicConversationId,
                    status: 'queued',
                    accepted: true,
                },
                { status: String(url).endsWith('/v1/submissions') ? 202 : 200 },
            );
        });
        const client = new AssistantWorkerClient({
            url: 'http://worker.internal:3010',
            token: 'x'.repeat(32),
            fetch: fetchMock as typeof fetch,
        });
        await client.submit(envelope);
        await client.watch(envelope, () => undefined);
        await client.status(envelope);
        await client.abort(envelope);
        expect(calls.map((call) => JSON.parse(call.body).requestId)).toEqual([
            envelope.requestId,
            envelope.requestId,
            envelope.requestId,
            envelope.requestId,
        ]);
        expect(calls[1].url).toContain(`${envelope.requestId}/events`);
        expect(calls[3].url).toContain(`${envelope.requestId}/abort`);
    });

    it('never turns a worker error into a legacy request', async () => {
        const client = new AssistantWorkerClient({
            url: 'http://worker.internal:3010',
            token: 'x'.repeat(32),
            fetch: vi.fn(async () =>
                Response.json(
                    {
                        error: {
                            code: 'UNAVAILABLE',
                            message: 'worker unavailable',
                            retryable: true,
                        },
                    },
                    { status: 503 },
                ),
            ) as typeof fetch,
        });
        await expect(client.submit(envelope)).rejects.toMatchObject({
            code: 'UNAVAILABLE',
            status: 503,
        });
    });
});
