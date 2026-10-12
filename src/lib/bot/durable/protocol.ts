import { z } from 'zod';
import type {
    AssistantResponse,
    AssistantStreamEvent,
} from '../assistant-types';

export const ASSISTANT_PROTOCOL_VERSION = 1 as const;
export const assistantRequestIdSchema = z.string().uuid();
export const assistantChannelSchema = z.enum([
    'web',
    'telegram',
    'telegram_mini_app',
]);
const telegramAuthoritySchema = z.object({
    botKey: z.string().min(1).max(80),
    telegramUserId: z.string().regex(/^\d{1,20}$/),
    telegramChatId: z.string().regex(/^\d{1,20}$/),
    linkId: z.string().min(1).max(100),
    globalAccountId: z.string().min(1).max(100),
    membershipId: z.string().min(1).max(100),
    tenantId: z.string().min(1).max(100),
    tenantUserId: z.string().min(1).max(100),
    selectionVersion: z.number().int().nonnegative(),
    globalRevocationVersion: z.number().int().nonnegative(),
    membershipVersion: z.number().int().nonnegative(),
    centralAuthVersion: z.number().int().nonnegative(),
});

export const assistantAuthoritySchema = z
    .object({
        schemaVersion: z.literal(ASSISTANT_PROTOCOL_VERSION),
        publicConversationId: z.string().min(1).max(100),
        tenantId: z.string().min(1).max(100),
        userId: z.string().min(1).max(100),
        channel: assistantChannelSchema,
        telegramAuthority: telegramAuthoritySchema.optional(),
        accessScopeHash: z.string().regex(/^[a-f0-9]{64}$/),
        workContextKey: z.string().min(1).max(500),
        pathname: z
            .string()
            .startsWith('/')
            .max(300)
            .refine(
                (value) => !value.startsWith('//') && !value.includes('\\'),
            ),
        profile: z.enum(['general', 'finance', 'production']),
    })
    .superRefine((value, context) => {
        validateTelegramAuthority(value, context);
    });
export type AssistantAuthority = z.infer<typeof assistantAuthoritySchema>;

export const restrictedTelegramEnvelopeSchema = z
    .object({
        protocolVersion: z.literal(ASSISTANT_PROTOCOL_VERSION),
        requestId: assistantRequestIdSchema,
        integrationScope: z.string().regex(/^[a-f0-9]{64}$/),
        question: z.string().trim().min(1).max(2000),
    })
    .strict();
export type RestrictedTelegramEnvelope = z.infer<
    typeof restrictedTelegramEnvelopeSchema
>;

export type RestrictedTelegramSnapshot = {
    requestId: string;
    status: 'done' | 'unanswered';
    accepted: true;
    response?: AssistantResponse;
    error?: AssistantWorkerError;
};

export const assistantSubmissionEnvelopeSchema = z
    .object({
        protocolVersion: z.literal(ASSISTANT_PROTOCOL_VERSION),
        requestId: assistantRequestIdSchema,
        publicConversationId: z.string().min(1).max(100).optional(),
        tenantId: z.string().min(1).max(100),
        userId: z.string().min(1).max(100),
        channel: assistantChannelSchema,
        telegramAuthority: telegramAuthoritySchema.optional(),
        question: z.string().trim().min(1).max(2000),
        workContext: z.object({ pathname: z.string().trim().min(1).max(300) }),
    })
    .superRefine((value, context) => {
        validateTelegramAuthority(value, context);
    });
export type AssistantSubmissionEnvelope = z.infer<
    typeof assistantSubmissionEnvelopeSchema
>;

function validateTelegramAuthority(
    value: {
        channel: z.infer<typeof assistantChannelSchema>;
        tenantId: string;
        userId: string;
        telegramAuthority?: z.infer<typeof telegramAuthoritySchema>;
    },
    context: z.RefinementCtx,
): void {
    if (value.channel === 'telegram' && !value.telegramAuthority) {
        context.addIssue({
            code: 'custom',
            path: ['telegramAuthority'],
            message: 'Telegram authority is required.',
        });
    }
    if (
        value.channel === 'telegram' &&
        value.telegramAuthority &&
        (value.telegramAuthority.tenantId !== value.tenantId ||
            value.telegramAuthority.tenantUserId !== value.userId)
    ) {
        context.addIssue({
            code: 'custom',
            path: ['telegramAuthority'],
            message: 'Telegram authority must match the envelope tenant actor.',
        });
    }
    if (value.channel !== 'telegram' && value.telegramAuthority) {
        context.addIssue({
            code: 'custom',
            path: ['telegramAuthority'],
            message: 'Telegram authority is not valid for this channel.',
        });
    }
}

export type DurableSubmissionStatus =
    | 'queued'
    | 'running'
    | 'done'
    | 'unanswered'
    | 'aborted';

export type DurableSubmissionSnapshot = {
    requestId: string;
    publicConversationId: string;
    status: DurableSubmissionStatus;
    accepted: true;
    response?: AssistantResponse & { interactionId?: string | null };
    error?: AssistantWorkerError;
};

export type AssistantWorkerEvent =
    | AssistantStreamEvent
    | { type: 'snapshot'; data: DurableSubmissionSnapshot }
    | { type: 'accepted'; data: DurableSubmissionSnapshot };

export const assistantWorkerErrorCodeSchema = z.enum([
    'UNAUTHORIZED',
    'NOT_FOUND',
    'BUSY',
    'UNANSWERED',
    'UNAVAILABLE',
    'INVALID_REQUEST',
    'CONTEXT_MISMATCH',
    'PERMISSION_DENIED',
    'INTERNAL',
]);
export type AssistantWorkerErrorCode = z.infer<
    typeof assistantWorkerErrorCodeSchema
>;
export type AssistantWorkerError = {
    code: AssistantWorkerErrorCode;
    message: string;
    retryable: boolean;
};

export class AssistantWorkerProtocolError extends Error {
    readonly code: AssistantWorkerErrorCode;
    readonly status: number;
    readonly retryable: boolean;

    constructor(
        code: AssistantWorkerErrorCode,
        message: string,
        status: number,
        retryable = false,
    ) {
        super(message);
        this.name = 'AssistantWorkerProtocolError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }

    toJSON(): { success: false; error: AssistantWorkerError } {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                retryable: this.retryable,
            },
        };
    }
}

export function workerErrorStatus(code: AssistantWorkerErrorCode): number {
    switch (code) {
        case 'UNAUTHORIZED':
            return 401;
        case 'PERMISSION_DENIED':
        case 'CONTEXT_MISMATCH':
            return 403;
        case 'NOT_FOUND':
            return 404;
        case 'BUSY':
            return 409;
        case 'INVALID_REQUEST':
            return 400;
        case 'UNAVAILABLE':
            return 503;
        case 'UNANSWERED':
            return 422;
        default:
            return 500;
    }
}
