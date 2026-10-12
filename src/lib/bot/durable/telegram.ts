import { createHash } from 'node:crypto';
import type { AssistantResponse } from '../assistant-types';
import {
    ASSISTANT_PROTOCOL_VERSION,
    AssistantWorkerProtocolError,
} from './protocol';
import { getAssistantWorkerClient } from './worker-client';

/**
 * Restricted Telegram stays public-KB-only. The web process owns no Pi
 * Durable harness or SQLite path; it only derives an opaque partition and
 * calls the private worker, which is the sole storage owner.
 */
export async function runRestrictedTelegramSubmission(input: {
    requestId: string;
    question: string;
    tenantId: string;
}): Promise<AssistantResponse> {
    const integrationScope = createHash('sha256')
        .update(`polyflow:restricted-telegram:${input.tenantId}`)
        .digest('hex');
    const result = await getAssistantWorkerClient().submitRestrictedTelegram({
        protocolVersion: ASSISTANT_PROTOCOL_VERSION,
        requestId: input.requestId,
        integrationScope,
        question: input.question,
    });
    if (result.status !== 'done' || !result.response) {
        throw new AssistantWorkerProtocolError(
            result.error?.code ?? 'UNANSWERED',
            result.error?.message ??
                'Assistant could not complete this submission.',
            422,
            result.error?.retryable ?? false,
        );
    }
    return result.response;
}
