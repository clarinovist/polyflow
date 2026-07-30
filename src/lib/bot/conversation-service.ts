import { prisma } from '@/lib/core/prisma';
import type {
    HelpConversation,
    HelpMessage,
    HelpConversationStatus,
} from '@prisma/client';

const MAX_MESSAGE_CONTENT_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_SUMMARY_LENGTH = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type ConversationContext = {
    conversationId: string;
    history: ConversationMessage[];
    summary?: string;
    resolvedEntities: Map<string, { type: string; id: string; label: string }>;
};

// ---------------------------------------------------------------------------
// Create a new conversation
// ---------------------------------------------------------------------------

export const TELEGRAM_MINI_APP_CHANNEL = 'telegram_mini_app' as const;

export type AllowedChannel = 'web' | 'telegram' | 'telegram_mini_app';

export async function createConversation(input: {
    tenantId: string;
    userId: string;
    channel?: AllowedChannel | string;
    title?: string;
}): Promise<HelpConversation> {
    return prisma.helpConversation.create({
        data: {
            tenantId: input.tenantId,
            userId: input.userId,
            channel: input.channel ?? 'web',
            title: input.title,
            status: 'ACTIVE',
        },
    });
}

// ---------------------------------------------------------------------------
// Get or create conversation
// ---------------------------------------------------------------------------

export async function getOrCreateConversation(input: {
    tenantId: string;
    userId: string;
    conversationId?: string;
    channel?: AllowedChannel | string;
}): Promise<HelpConversation> {
    if (input.conversationId) {
        const existing = await prisma.helpConversation.findFirst({
            where: {
                id: input.conversationId,
                tenantId: input.tenantId,
                userId: input.userId,
                status: 'ACTIVE',
            },
        });
        if (existing) return existing;
    }

    return createConversation({
        tenantId: input.tenantId,
        userId: input.userId,
        channel: input.channel,
    });
}

// ---------------------------------------------------------------------------
// Validate ownership & tenant
// ---------------------------------------------------------------------------

export async function validateConversationOwnership(input: {
    conversationId: string;
    tenantId: string;
    userId: string;
}): Promise<boolean> {
    const conversation = await prisma.helpConversation.findUnique({
        where: { id: input.conversationId },
        select: { tenantId: true, userId: true },
    });

    if (!conversation) return false;
    return (
        conversation.tenantId === input.tenantId &&
        conversation.userId === input.userId
    );
}

// ---------------------------------------------------------------------------
// Load recent messages for context window
// ---------------------------------------------------------------------------

export async function loadConversationContext(
    conversationId: string,
): Promise<ConversationContext> {
    const conversation = await prisma.helpConversation.findUnique({
        where: { id: conversationId },
        select: {
            id: true,
            summary: true,
            messages: {
                orderBy: { createdAt: 'desc' },
                take: MAX_HISTORY_MESSAGES,
                select: {
                    role: true,
                    content: true,
                    evidenceJson: true,
                },
            },
        },
    });

    if (!conversation) {
        return {
            conversationId,
            history: [],
            resolvedEntities: new Map(),
        };
    }

    // Reverse to chronological order
    const messages = conversation.messages.reverse();

    // Extract resolved entities from evidence
    const resolvedEntities = new Map<
        string,
        { type: string; id: string; label: string }
    >();
    for (const msg of messages) {
        if (msg.evidenceJson && typeof msg.evidenceJson === 'object') {
            const evidence = msg.evidenceJson as {
                entities?: Array<{ type: string; id: string; label: string }>;
            };
            if (evidence.entities) {
                for (const entity of evidence.entities) {
                    resolvedEntities.set(`${entity.type}:${entity.id}`, entity);
                }
            }
        }
    }

    return {
        conversationId: conversation.id,
        history: messages.map((m) => ({
            role: m.role.toLowerCase() as 'user' | 'assistant',
            content: m.content,
        })),
        summary: conversation.summary ?? undefined,
        resolvedEntities,
    };
}

// ---------------------------------------------------------------------------
// Save a message
// ---------------------------------------------------------------------------

export async function saveMessage(input: {
    conversationId: string;
    role: 'USER' | 'ASSISTANT';
    content: string;
    evidenceJson?: unknown;
}): Promise<HelpMessage> {
    const truncatedContent = input.content.slice(0, MAX_MESSAGE_CONTENT_LENGTH);

    const [message] = await prisma.$transaction([
        prisma.helpMessage.create({
            data: {
                conversationId: input.conversationId,
                role: input.role,
                content: truncatedContent,
                evidenceJson: input.evidenceJson ?? undefined,
            },
        }),
        prisma.helpConversation.update({
            where: { id: input.conversationId },
            data: { lastMessageAt: new Date() },
        }),
    ]);

    return message;
}

// ---------------------------------------------------------------------------
// Update conversation summary (after threshold)
// ---------------------------------------------------------------------------

export async function updateConversationSummary(
    conversationId: string,
    summary: string,
): Promise<void> {
    const truncatedSummary = summary.slice(0, MAX_SUMMARY_LENGTH);
    await prisma.helpConversation.update({
        where: { id: conversationId },
        data: { summary: truncatedSummary },
    });
}

// ---------------------------------------------------------------------------
// Close conversation
// ---------------------------------------------------------------------------

export async function closeConversation(
    conversationId: string,
    status: HelpConversationStatus = 'CLOSED',
): Promise<void> {
    await prisma.helpConversation.update({
        where: { id: conversationId },
        data: { status },
    });
}

// ---------------------------------------------------------------------------
// Build context for LLM (summary + recent messages)
// ---------------------------------------------------------------------------

export function buildLlmHistory(
    context: ConversationContext,
): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Add summary as system context if available
    if (context.summary) {
        messages.push({
            role: 'assistant',
            content: `[Ringkasan percakapan sebelumnya: ${context.summary}]`,
        });
    }

    // Add recent messages
    messages.push(...context.history);

    return messages;
}

/**
 * Check if conversation needs summarization (>20 messages).
 */
export function needsSummarization(messageCount: number): boolean {
    return messageCount > 20;
}

/**
 * Extract entity references from conversation context for disambiguation.
 */
export function extractEntityReferences(
    context: ConversationContext,
): string[] {
    const refs: string[] = [];
    for (const [, entity] of context.resolvedEntities) {
        refs.push(`${entity.type}:${entity.id} (${entity.label})`);
    }
    return refs;
}
