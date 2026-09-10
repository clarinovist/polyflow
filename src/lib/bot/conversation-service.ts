import { prisma } from '@/lib/core/prisma';
import type { HelpConversation, HelpMessage } from '@prisma/client';

const MAX_MESSAGE_CONTENT_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 10;
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
export type AllowedChannel = 'web' | 'telegram' | 'telegram_mini_app';

async function createConversation(input: {
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
// Load recent messages for context window
// ---------------------------------------------------------------------------

export async function loadConversationContext(
    conversationId: string,
    contextKey?: string,
): Promise<ConversationContext> {
    const conversation = await prisma.helpConversation.findUnique({
        where: { id: conversationId },
        select: {
            id: true,
            summary: true,
            messages: {
                ...(contextKey
                    ? {
                          where: {
                              evidenceJson: {
                                  path: ['contextKey'],
                                  equals: contextKey,
                              },
                          },
                      }
                    : {}),
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

    // Messages created before work-context metadata existed are deliberately
    // not reused in contextual threads. This prevents stale finance/production
    // content from entering a prompt after navigation or permission changes.
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
        // A legacy aggregate summary has no per-message context metadata.
        // Do not reuse it inside a scoped finance/production thread.
        summary: contextKey ? undefined : (conversation.summary ?? undefined),
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
