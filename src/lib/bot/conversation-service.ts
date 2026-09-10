import { prisma } from '@/lib/core/prisma';
import type { HelpConversation, HelpMessage, Prisma } from '@prisma/client';

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
    accessScope?: string;
    contextKey?: string;
}): Promise<HelpConversation> {
    if (input.conversationId) {
        const existing = await prisma.helpConversation.findFirst({
            where: {
                id: input.conversationId,
                tenantId: input.tenantId,
                userId: input.userId,
                status: 'ACTIVE',
                ...(input.channel ? { channel: input.channel } : {}),
                ...(input.accessScope
                    ? {
                          messages: {
                              // PostgreSQL JSON missing paths compare as NULL: `every`
                              // alone can accept legacy rows. Require a positive match.
                              some: {
                                  AND: [
                                      {
                                          evidenceJson: {
                                              path: ['accessScope'],
                                              equals: input.accessScope,
                                          },
                                      },
                                      {
                                          evidenceJson: {
                                              path: ['contextKey'],
                                              equals: input.contextKey ?? '',
                                          },
                                      },
                                  ],
                              },
                              every: {
                                  AND: [
                                      {
                                          evidenceJson: {
                                              path: ['accessScope'],
                                              equals: input.accessScope,
                                          },
                                      },
                                      {
                                          evidenceJson: {
                                              path: ['contextKey'],
                                              equals: input.contextKey ?? '',
                                          },
                                      },
                                  ],
                              },
                          },
                      }
                    : {}),
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
    accessScope?: string,
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
                              ...(accessScope
                                  ? {
                                        AND: [
                                            {
                                                evidenceJson: {
                                                    path: ['accessScope'],
                                                    equals: accessScope,
                                                },
                                            },
                                        ],
                                    }
                                  : {}),
                          },
                      }
                    : {}),
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
/** Save the whole exchange before acknowledging it to the browser. */
export async function saveConversationExchange(input: {
    conversationId: string;
    question: string;
    answer: string;
    metadata: Prisma.InputJsonObject;
    assistantMetadata?: Prisma.InputJsonObject;
}): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // Serialize exchanges from multiple tabs and keep their timestamps ordered.
        await tx.$queryRaw`SELECT id FROM "HelpConversation" WHERE id = ${input.conversationId} FOR UPDATE`;
        const previous = await tx.helpMessage.findFirst({
            where: { conversationId: input.conversationId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { createdAt: true },
        });
        const startedAt = new Date(
            Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1),
        );
        const user = await tx.helpMessage.create({
            data: {
                conversationId: input.conversationId,
                role: 'USER',
                content: input.question,
                createdAt: startedAt,
                evidenceJson: input.metadata,
            },
        });
        // Explicit ordering even when the database timestamps have millisecond ties.
        const assistant = await tx.helpMessage.create({
            data: {
                conversationId: input.conversationId,
                role: 'ASSISTANT',
                content: input.answer,
                createdAt: new Date(
                    Math.max(Date.now(), user.createdAt.getTime() + 1),
                ),
                evidenceJson: { ...input.metadata, ...input.assistantMetadata },
            },
        });
        await tx.helpConversation.update({
            where: { id: input.conversationId },
            data: { lastMessageAt: assistant.createdAt },
        });
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
