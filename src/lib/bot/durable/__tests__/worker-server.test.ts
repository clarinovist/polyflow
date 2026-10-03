import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createAssistantWorkerServer,
    listenAssistantWorker,
} from '../worker-server';

const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
});

function fixtures() {
    const runtime = {
        submit: vi.fn(async (body) => ({
            requestId: body.requestId,
            publicConversationId: 'public-one',
            status: 'queued',
            accepted: true,
        })),
        status: vi.fn(),
        wait: vi.fn(),
        abort: vi.fn(),
    };
    const manager = {
        inspect: vi.fn(async () => ({
            ready: true,
            openHarnesses: 0,
            blockedTasks: 0,
        })),
    };
    return { runtime, manager };
}

const request = {
    protocolVersion: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web',
    question: 'synthetic question',
    workContext: { pathname: '/' },
};

describe('assistant worker HTTP boundary', () => {
    it('allows health checks but rejects unauthenticated submissions', async () => {
        const f = fixtures();
        const server = createAssistantWorkerServer({
            runtime: f.runtime as never,
            manager: f.manager as never,
            token: 'x'.repeat(32),
        });
        servers.push(server);
        const { port } = await listenAssistantWorker(server, '127.0.0.1', 0);
        expect(
            await fetch(`http://127.0.0.1:${port}/health/ready`).then((r) =>
                r.json(),
            ),
        ).toMatchObject({ ready: true });
        const response = await fetch(`http://127.0.0.1:${port}/v1/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        expect(response.status).toBe(401);
        expect(f.runtime.submit).not.toHaveBeenCalled();
    });

    it('validates body size and authenticated submission protocol', async () => {
        const f = fixtures();
        const server = createAssistantWorkerServer({
            runtime: f.runtime as never,
            manager: f.manager as never,
            token: 'x'.repeat(32),
        });
        servers.push(server);
        const { port } = await listenAssistantWorker(server, '127.0.0.1', 0);
        const response = await fetch(`http://127.0.0.1:${port}/v1/submissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${'x'.repeat(32)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        expect(response.status).toBe(202);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(f.runtime.submit).toHaveBeenCalledWith(request);

        const tooLarge = await fetch(
            `http://127.0.0.1:${port}/v1/submissions`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${'x'.repeat(32)}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...request, question: 'x'.repeat(20_000) }),
            },
        );
        expect(tooLarge.status).toBe(413);
    });
});
