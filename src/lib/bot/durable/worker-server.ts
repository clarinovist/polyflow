import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import {
    assistantSubmissionEnvelopeSchema,
    AssistantWorkerProtocolError,
} from './protocol';
import { verifyAssistantServiceAuthorization } from './service-auth';
import { DurableAssistantRuntime } from './runtime';
import type { TenantHarnessManager } from './harness-manager';

const MAX_BODY_BYTES = 16 * 1024;
const PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
};

export function createAssistantWorkerServer(input: {
    runtime: DurableAssistantRuntime;
    manager: TenantHarnessManager;
    token: string;
}) {
    const server = createServer(async (request, response) => {
        response.setHeader('Cache-Control', PRIVATE_HEADERS['Cache-Control']);
        response.setHeader(
            'X-Content-Type-Options',
            PRIVATE_HEADERS['X-Content-Type-Options'],
        );
        try {
            await route(request, response, input);
        } catch (error) {
            if (response.headersSent) {
                if (!response.writableEnded) {
                    writeSse(response, {
                        type: 'error',
                        message: 'Assistant worker stream failed.',
                    });
                    response.end('data: [DONE]\n\n');
                }
                return;
            }
            const protocolError =
                error instanceof AssistantWorkerProtocolError
                    ? error
                    : new AssistantWorkerProtocolError(
                          'INTERNAL',
                          'Assistant worker could not process the request.',
                          500,
                      );
            json(response, protocolError.status, protocolError.toJSON());
        }
    });
    server.requestTimeout = 130_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    return server;
}

async function route(
    request: IncomingMessage,
    response: ServerResponse,
    input: {
        runtime: DurableAssistantRuntime;
        manager: TenantHarnessManager;
        token: string;
    },
) {
    const url = new URL(request.url ?? '/', 'http://assistant-worker.internal');
    if (request.method === 'GET' && url.pathname === '/health/live') {
        return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && url.pathname === '/health/ready') {
        const inspection = await input.manager.inspect();
        return json(response, inspection.ready ? 200 : 503, inspection);
    }
    if (
        !verifyAssistantServiceAuthorization(
            request.headers.authorization,
            input.token,
        )
    ) {
        throw new AssistantWorkerProtocolError(
            'UNAUTHORIZED',
            'Invalid service authorization.',
            401,
        );
    }

    const match = url.pathname.match(
        /^\/v1\/submissions(?:\/([0-9a-f-]{36})(?:\/(events|abort))?)?$/,
    );
    if (!match) {
        throw new AssistantWorkerProtocolError(
            'NOT_FOUND',
            'Endpoint not found.',
            404,
        );
    }
    const routeRequestId = match[1];
    const operation = match[2];
    const body = assistantSubmissionEnvelopeSchema.parse(
        await readJsonBody(request, MAX_BODY_BYTES),
    );
    if (routeRequestId && body.requestId !== routeRequestId) {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            'Route and body requestId do not match.',
            400,
        );
    }

    if (request.method === 'POST' && !routeRequestId) {
        return json(response, 202, await input.runtime.submit(body));
    }
    if (request.method === 'POST' && operation === 'abort') {
        return json(response, 200, await input.runtime.abort(body));
    }
    if (request.method === 'POST' && operation === 'events') {
        response.writeHead(200, {
            ...PRIVATE_HEADERS,
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        writeSse(response, {
            type: 'accepted',
            data: { requestId: body.requestId },
        });
        const final = await input.runtime.wait(body, (event) =>
            writeSse(response, event),
        );
        if (final.status === 'done' && final.response) {
            writeSse(response, { type: 'done', data: final.response });
        } else {
            writeSse(response, {
                type: 'error',
                message:
                    final.error?.message ??
                    'Assistant could not complete this submission.',
            });
        }
        response.end('data: [DONE]\n\n');
        return;
    }
    if (request.method === 'POST' && !operation && routeRequestId) {
        return json(response, 200, await input.runtime.status(body));
    }
    throw new AssistantWorkerProtocolError(
        'NOT_FOUND',
        'Endpoint not found.',
        404,
    );
}

async function readJsonBody(request: IncomingMessage, maxBytes: number) {
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > maxBytes) {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            'Request body is too large.',
            413,
        );
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) {
            throw new AssistantWorkerProtocolError(
                'INVALID_REQUEST',
                'Request body is too large.',
                413,
            );
        }
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            'Request body must be valid JSON.',
            400,
        );
    }
}

function writeSse(response: ServerResponse, event: unknown) {
    if (!response.writableEnded) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
}

function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
        ...PRIVATE_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(value));
}

export async function listenAssistantWorker(
    server: ReturnType<typeof createAssistantWorkerServer>,
    host: string,
    port: number,
): Promise<AddressInfo> {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
    return server.address() as AddressInfo;
}
