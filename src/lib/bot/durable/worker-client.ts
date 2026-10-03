import type { AssistantStreamEvent } from '../assistant-types';
import {
    AssistantWorkerProtocolError,
    type AssistantSubmissionEnvelope,
    type DurableSubmissionSnapshot,
} from './protocol';

const DEFAULT_TIMEOUT_MS = 125_000;

export class AssistantWorkerClient {
    constructor(
        private readonly options: {
            url: string;
            token: string;
            timeoutMs?: number;
            fetch?: typeof fetch;
        },
    ) {
        if (
            !options.url.startsWith('http://') &&
            !options.url.startsWith('https://')
        ) {
            throw new Error('ASSISTANT_WORKER_URL must be an absolute URL');
        }
        if (options.token.length < 32)
            throw new Error('ASSISTANT_WORKER_TOKEN is too short');
    }

    submit(envelope: AssistantSubmissionEnvelope) {
        return this.request('/v1/submissions', envelope, 202);
    }

    status(envelope: AssistantSubmissionEnvelope) {
        return this.request(
            `/v1/submissions/${encodeURIComponent(envelope.requestId)}`,
            envelope,
            200,
        );
    }

    abort(envelope: AssistantSubmissionEnvelope) {
        return this.request(
            `/v1/submissions/${encodeURIComponent(envelope.requestId)}/abort`,
            envelope,
            200,
        );
    }

    async watch(
        envelope: AssistantSubmissionEnvelope,
        onEvent: (event: AssistantStreamEvent) => void,
        signal?: AbortSignal,
    ): Promise<DurableSubmissionSnapshot> {
        const response = await this.fetch(
            `/v1/submissions/${encodeURIComponent(envelope.requestId)}/events`,
            envelope,
            signal,
            // The server may legitimately keep this stream open for the whole run.
            false,
        );
        if (!response.ok || !response.body) throw await workerError(response);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let final: DurableSubmissionSnapshot | undefined;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
                const raw = frame
                    .split('\n')
                    .find((line) => line.startsWith('data:'))
                    ?.slice(5)
                    .trim();
                if (!raw || raw === '[DONE]') continue;
                const event = JSON.parse(raw) as
                    | AssistantStreamEvent
                    | { type: 'accepted'; data: { requestId: string } };
                if (event.type === 'accepted') continue;
                if (event.type === 'done') {
                    final = {
                        requestId: envelope.requestId,
                        publicConversationId:
                            event.data.conversationId ??
                            envelope.publicConversationId ??
                            '',
                        status: 'done',
                        accepted: true,
                        response: event.data,
                    };
                } else {
                    onEvent(event);
                }
            }
        }
        if (final) return final;
        return this.status(envelope);
    }

    private async request(
        path: string,
        envelope: AssistantSubmissionEnvelope,
        expectedStatus: number,
    ): Promise<DurableSubmissionSnapshot> {
        const response = await this.fetch(path, envelope);
        if (response.status !== expectedStatus && !response.ok) {
            throw await workerError(response);
        }
        return (await response.json()) as DurableSubmissionSnapshot;
    }

    private fetch(
        path: string,
        body: AssistantSubmissionEnvelope,
        signal?: AbortSignal,
        applyTimeout = true,
    ) {
        const timeout = applyTimeout
            ? AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
            : undefined;
        return (this.options.fetch ?? fetch)(new URL(path, this.options.url), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.options.token}`,
                'Content-Type': 'application/json',
                Accept: path.endsWith('/events')
                    ? 'text/event-stream'
                    : 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
            signal:
                signal && timeout
                    ? AbortSignal.any([signal, timeout])
                    : (signal ?? timeout),
        });
    }
}

async function workerError(
    response: Response,
): Promise<AssistantWorkerProtocolError> {
    const parsed = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string; retryable?: boolean };
    } | null;
    return new AssistantWorkerProtocolError(
        (parsed?.error?.code as ConstructorParameters<
            typeof AssistantWorkerProtocolError
        >[0]) ?? 'UNAVAILABLE',
        parsed?.error?.message ?? 'Assistant worker is unavailable.',
        response.status || 503,
        parsed?.error?.retryable ?? response.status >= 500,
    );
}

let singleton: AssistantWorkerClient | undefined;
export function getAssistantWorkerClient(): AssistantWorkerClient {
    singleton ??= new AssistantWorkerClient({
        url: process.env.ASSISTANT_WORKER_URL ?? 'http://assistant-worker:3010',
        token: process.env.ASSISTANT_WORKER_TOKEN ?? '',
    });
    return singleton;
}
