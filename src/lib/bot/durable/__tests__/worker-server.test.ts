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
    const restrictedTelegram = {
        inspect: vi.fn(async () => ({ ready: true, blockedTasks: 0 })),
        submit: vi.fn(async (body) => ({
            requestId: body.requestId,
            status: 'done',
            accepted: true,
            response: {
                requestId: body.requestId,
                answer: 'public kb only',
                citations: ['kb:public-only'],
                safety: { allowed: true },
            },
        })),
    };
    const manager = {
        inspect: vi.fn(async () => ({
            ready: true,
            openHarnesses: 0,
            blockedTasks: 0,
        })),
    };
    return { runtime, manager, restrictedTelegram };
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

function serverFixture() {
    const fixture = fixtures();
    const server = createAssistantWorkerServer({
        runtime: fixture.runtime as never,
        manager: fixture.manager as never,
        token: 'x'.repeat(32),
        restrictedTelegram: fixture.restrictedTelegram as never,
    });
    servers.push(server);
    return { fixture, server };
}

describe('assistant worker HTTP boundary', () => {
    it('allows health checks but rejects unauthenticated submissions', async () => {
        const { fixture, server } = serverFixture();
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
        expect(fixture.runtime.submit).not.toHaveBeenCalled();
    });

    it('validates body size and authenticated submission protocol', async () => {
        const { fixture, server } = serverFixture();
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
        expect(fixture.runtime.submit).toHaveBeenCalledWith(request);

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

    it('fails readiness when restricted Telegram has blocked tasks', async () => {
        const { fixture, server } = serverFixture();
        fixture.restrictedTelegram.inspect = vi.fn(async () => ({
            ready: false,
            blockedTasks: 1,
        }));
        const { port } = await listenAssistantWorker(server, '127.0.0.1', 0);
        const response = await fetch(
            `http://127.0.0.1:${port}/health/ready`,
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
            ready: false,
            restrictedBlockedTasks: 1,
        });
    });

    it('isolates restricted Telegram and rejects Telegram on generic authority', async () => {
        const { fixture, server } = serverFixture();
        const { port } = await listenAssistantWorker(server, '127.0.0.1', 0);
        const headers = {
            Authorization: `Bearer ${'x'.repeat(32)}`,
            'Content-Type': 'application/json',
        };
        const restricted = await fetch(
            `http://127.0.0.1:${port}/v1/restricted-telegram/submissions`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    protocolVersion: 1,
                    requestId: request.requestId,
                    integrationScope: 'a'.repeat(64),
                    question: 'cara stok opname',
                }),
            },
        );
        expect(restricted.status).toBe(200);
        expect(fixture.restrictedTelegram.submit).toHaveBeenCalledTimes(1);

        const genericTelegram = await fetch(
            `http://127.0.0.1:${port}/v1/submissions`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...request, channel: 'telegram' }),
            },
        );
        expect(genericTelegram.status).toBe(403);
        expect(fixture.runtime.submit).not.toHaveBeenCalled();

        const malformed = await fetch(
            `http://127.0.0.1:${port}/v1/restricted-telegram/submissions`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    protocolVersion: 1,
                    requestId: 'not-a-uuid',
                    integrationScope: 'not-a-hash',
                    question: 'x',
                    tenantId: 'must-be-rejected',
                }),
            },
        );
        expect(malformed.status).toBe(400);
        expect(await malformed.json()).toMatchObject({
            error: { code: 'INVALID_REQUEST' },
        });
    });
});
