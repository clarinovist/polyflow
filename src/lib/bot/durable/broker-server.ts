import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { ZodError } from 'zod';
import type { AssistantBrokerExecutor } from './broker-executor';
import {
    ASSISTANT_BROKER_PROTOCOL_VERSION,
    assistantBrokerToolRequestSchema,
} from './broker-protocol';
import { AssistantWorkerProtocolError, workerErrorStatus } from './protocol';
import { verifyAssistantServiceAuthorization } from './service-auth';

const MAX_BODY_BYTES = 16 * 1024;
const PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
};

export function createAssistantBrokerServer(input: {
    executor: AssistantBrokerExecutor;
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
            const protocolError =
                error instanceof AssistantWorkerProtocolError
                    ? error
                    : error instanceof ZodError
                      ? new AssistantWorkerProtocolError(
                            'INVALID_REQUEST',
                            'Assistant broker request is invalid.',
                            400,
                        )
                      : new AssistantWorkerProtocolError(
                            'INTERNAL',
                            'Assistant broker could not process the request.',
                            500,
                        );
            json(
                response,
                protocolError.status || workerErrorStatus(protocolError.code),
                protocolError.toJSON(),
            );
        }
    });
    server.requestTimeout = 25_000;
    server.headersTimeout = 5_000;
    server.keepAliveTimeout = 5_000;
    return server;
}

async function route(
    request: IncomingMessage,
    response: ServerResponse,
    input: { executor: AssistantBrokerExecutor; token: string },
) {
    const url = new URL(request.url ?? '/', 'http://assistant-broker.internal');
    if (request.method === 'GET' && url.pathname === '/health/live') {
        return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'GET' && url.pathname === '/health/ready') {
        return json(response, 200, { ready: true });
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
    if (request.method !== 'POST' || url.pathname !== '/v1/tools/execute') {
        throw new AssistantWorkerProtocolError(
            'NOT_FOUND',
            'Endpoint not found.',
            404,
        );
    }
    const body = assistantBrokerToolRequestSchema.parse(
        await readJsonBody(request, MAX_BODY_BYTES),
    );
    const evidence = await input.executor.execute(body);
    return json(response, 200, {
        protocolVersion: ASSISTANT_BROKER_PROTOCOL_VERSION,
        executionKey: body.executionKey,
        toolName: body.toolName,
        evidence,
    });
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

function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
        ...PRIVATE_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(value));
}

export async function listenAssistantBroker(
    server: ReturnType<typeof createAssistantBrokerServer>,
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
