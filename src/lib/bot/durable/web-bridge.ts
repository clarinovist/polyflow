import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { buildAssistantContext } from '../assistant-context';
import { verifyAssistantSessionUser } from '../assistant-session';
import { resolveAssistantWorkContext } from '../assistant-work-context';
import { parseChatRequestBody } from '../chat-request';
import { checkChatRateLimit } from '../chat-rate-limit';
import type { AssistantStreamEvent } from '../assistant-types';
import {
    ASSISTANT_PROTOCOL_VERSION,
    AssistantWorkerProtocolError,
    type AssistantSubmissionEnvelope,
    type DurableSubmissionSnapshot,
} from './protocol';
import { getAssistantWorkerClient } from './worker-client';

export type PreparedAssistantRequest = {
    envelope: AssistantSubmissionEnvelope;
    requesterName?: string;
};

export async function prepareAssistantWebRequest(
    request: NextRequest,
): Promise<PreparedAssistantRequest> {
    const session = await auth();
    if (!session?.user) {
        throw new AssistantWorkerProtocolError(
            'UNAUTHORIZED',
            'Unauthorized',
            401,
        );
    }
    const parsed = parseChatRequestBody(await request.json().catch(() => null));
    if (!parsed.success) {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            parsed.error,
            400,
        );
    }
    if (!parsed.data.requestId) {
        throw new AssistantWorkerProtocolError(
            'INVALID_REQUEST',
            'A valid requestId is required.',
            400,
        );
    }
    const verified = await verifyAssistantSessionUser(session.user);
    const tenantId = getTenantIdFromContext();
    if (!verified || !tenantId) {
        throw new AssistantWorkerProtocolError(
            'PERMISSION_DENIED',
            'Session tidak valid untuk tenant ini.',
            403,
        );
    }
    const assistantContext = buildAssistantContext(verified, tenantId);
    const workContext = resolveAssistantWorkContext(
        parsed.data.workContext,
        assistantContext,
    );
    return {
        envelope: {
            protocolVersion: ASSISTANT_PROTOCOL_VERSION,
            requestId: parsed.data.requestId,
            publicConversationId: parsed.data.conversationId,
            tenantId,
            userId: verified.id,
            channel: 'web',
            question: parsed.data.question,
            workContext: { pathname: workContext.pathname },
        },
        requesterName: verified.name ?? undefined,
    };
}

export async function submitDurableAssistant(
    prepared: PreparedAssistantRequest,
    options?: {
        stream?: (event: AssistantStreamEvent) => void;
        signal?: AbortSignal;
    },
): Promise<DurableSubmissionSnapshot> {
    const client = getAssistantWorkerClient();
    // Admission and observation are deliberately separate. If admission's
    // response is lost, status with the same requestId resolves ambiguity
    // before any retry; no second engine or fresh ID is used.
    let accepted: DurableSubmissionSnapshot;
    try {
        accepted = await client.submit(prepared.envelope);
    } catch (error) {
        if (
            error instanceof AssistantWorkerProtocolError &&
            error.status < 500
        ) {
            throw error;
        }
        accepted = await client.status(prepared.envelope);
    }
    const bound = {
        ...prepared.envelope,
        publicConversationId: accepted.publicConversationId,
    };
    if (options?.stream) {
        return client.watch(bound, options.stream, options.signal);
    }
    for (;;) {
        const status = await client.status(bound);
        if (
            status.status === 'done' ||
            status.status === 'unanswered' ||
            status.status === 'aborted'
        ) {
            return status;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

export function applyChatRateLimitOnce(
    userId: string,
    requestId: string,
): boolean {
    return checkChatRateLimit(userId, requestId);
}
