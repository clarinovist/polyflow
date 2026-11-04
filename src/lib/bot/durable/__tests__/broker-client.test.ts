import { describe, expect, it, vi } from 'vitest';
import { AssistantBrokerClient } from '../broker-client';
import type { AssistantBrokerToolRequest } from '../broker-protocol';

const request: AssistantBrokerToolRequest = {
    protocolVersion: 1,
    authority: {
        schemaVersion: 1,
        publicConversationId: 'conversation-one',
        tenantId: 'tenant-one',
        userId: 'user-one',
        channel: 'web',
        accessScopeHash: 'a'.repeat(64),
        workContextKey: 'general:hash',
        pathname: '/',
        profile: 'general',
    },
    executionKey: '1:2:call-one',
    taskId: '2',
    callId: 'call-one',
    toolName: 'get_daily_production_output',
    arguments: { date: '2026-11-03' },
};

const evidence = {
    summary: 'Synthetic output',
    facts: [],
    source: 'tenant-data' as const,
    checkedAt: '2026-11-04T00:00:00.000Z',
    completeness: 'complete' as const,
};

describe('AssistantBrokerClient', () => {
    it('binds the response to execution key and tool name', async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                protocolVersion: 1,
                executionKey: request.executionKey,
                toolName: request.toolName,
                evidence,
            }),
        );
        const client = new AssistantBrokerClient({
            url: 'http://assistant-broker:3020',
            token: 'b'.repeat(32),
            fetch: fetchMock as typeof fetch,
        });
        await expect(client.execute(request)).resolves.toEqual(evidence);
        expect(
            String((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]),
        ).toContain(
            '/v1/tools/execute',
        );
        const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
        expect(init.headers).toMatchObject({
            Authorization: `Bearer ${'b'.repeat(32)}`,
        });
    });

    it('fails closed on broker unavailability or response mismatch', async () => {
        const unavailable = new AssistantBrokerClient({
            url: 'http://assistant-broker:3020',
            token: 'b'.repeat(32),
            fetch: vi.fn(async () => {
                throw new Error('synthetic outage');
            }) as typeof fetch,
        });
        await expect(unavailable.execute(request)).rejects.toMatchObject({
            code: 'UNAVAILABLE',
        });

        const mismatched = new AssistantBrokerClient({
            url: 'http://assistant-broker:3020',
            token: 'b'.repeat(32),
            fetch: vi.fn(async () =>
                Response.json({
                    protocolVersion: 1,
                    executionKey: 'different:key',
                    toolName: request.toolName,
                    evidence,
                }),
            ) as typeof fetch,
        });
        await expect(mismatched.execute(request)).rejects.toMatchObject({
            code: 'INTERNAL',
        });
    });
});
