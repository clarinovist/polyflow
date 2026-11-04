import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createAssistantBrokerServer,
    listenAssistantBroker,
} from '../broker-server';

const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
});

const request = {
    protocolVersion: 1,
    authority: {
        schemaVersion: 1,
        publicConversationId: 'conversation-one',
        tenantId: 'tenant-one',
        userId: 'user-one',
        channel: 'web',
        accessScopeHash: 'a'.repeat(64),
        workContextKey: 'production:hash',
        pathname: '/production/output-report',
        profile: 'production',
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
    source: 'tenant-data',
    checkedAt: '2026-11-04T00:00:00.000Z',
    completeness: 'complete',
};

function fixture() {
    const executor = { execute: vi.fn(async () => evidence) };
    const server = createAssistantBrokerServer({
        executor: executor as never,
        token: 'b'.repeat(32),
    });
    servers.push(server);
    return { executor, server };
}

describe('assistant broker HTTP boundary', () => {
    it('allows health but requires constant service authorization', async () => {
        const { executor, server } = fixture();
        const { port } = await listenAssistantBroker(
            server,
            '127.0.0.1',
            0,
        );
        expect(
            await fetch(`http://127.0.0.1:${port}/health/ready`).then((r) =>
                r.json(),
            ),
        ).toEqual({ ready: true });
        const response = await fetch(
            `http://127.0.0.1:${port}/v1/tools/execute`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            },
        );
        expect(response.status).toBe(401);
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it('strictly validates the request and returns bound evidence', async () => {
        const { executor, server } = fixture();
        const { port } = await listenAssistantBroker(
            server,
            '127.0.0.1',
            0,
        );
        const send = (body: unknown) =>
            fetch(`http://127.0.0.1:${port}/v1/tools/execute`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${'b'.repeat(32)}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
        const response = await send(request);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            protocolVersion: 1,
            executionKey: request.executionKey,
            toolName: request.toolName,
            evidence,
        });
        expect(executor.execute).toHaveBeenCalledWith(request);

        const malformed = await send({ ...request, tenantUrl: 'forbidden' });
        expect(malformed.status).toBe(400);
        expect(executor.execute).toHaveBeenCalledTimes(1);
    });
});
