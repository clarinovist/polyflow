import type { ToolEvidence } from '../assistant-types';
import {
    assistantBrokerToolResponseSchema,
    type AssistantBrokerToolRequest,
} from './broker-protocol';
import {
    AssistantWorkerProtocolError,
    type AssistantWorkerErrorCode,
} from './protocol';

const DEFAULT_TIMEOUT_MS = 20_000;

export class AssistantBrokerClient {
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
            throw new Error('ASSISTANT_BROKER_URL must be an absolute URL');
        }
        if (options.token.length < 32)
            throw new Error('ASSISTANT_BROKER_TOKEN is too short');
    }

    async execute(
        request: AssistantBrokerToolRequest,
        signal?: AbortSignal,
    ): Promise<ToolEvidence> {
        let response: Response;
        const timeout = AbortSignal.timeout(
            this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
        const combinedSignal = signal
            ? AbortSignal.any([signal, timeout])
            : timeout;
        try {
            response = await (this.options.fetch ?? fetch)(
                new URL('/v1/tools/execute', this.options.url),
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.options.token}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify(request),
                    cache: 'no-store',
                    signal: combinedSignal,
                },
            );
        } catch {
            throw new AssistantWorkerProtocolError(
                'UNAVAILABLE',
                'Assistant broker is unavailable.',
                503,
                true,
            );
        }
        if (!response.ok) throw await brokerError(response);
        const parsed = assistantBrokerToolResponseSchema.safeParse(
            await response.json().catch(() => null),
        );
        if (
            !parsed.success ||
            parsed.data.executionKey !== request.executionKey ||
            parsed.data.toolName !== request.toolName
        ) {
            throw new AssistantWorkerProtocolError(
                'INTERNAL',
                'Assistant broker returned an invalid response.',
                502,
            );
        }
        return parsed.data.evidence as ToolEvidence;
    }
}

async function brokerError(
    response: Response,
): Promise<AssistantWorkerProtocolError> {
    const parsed = (await response.json().catch(() => null)) as {
        error?: {
            code?: AssistantWorkerErrorCode;
            message?: string;
            retryable?: boolean;
        };
    } | null;
    return new AssistantWorkerProtocolError(
        parsed?.error?.code ?? 'UNAVAILABLE',
        parsed?.error?.message ?? 'Assistant broker is unavailable.',
        response.status || 503,
        parsed?.error?.retryable ?? response.status >= 500,
    );
}
