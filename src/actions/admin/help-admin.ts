'use server';

import { auth } from '@/auth';
import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { logActivity } from '@/lib/tools/audit';
import { ValidationError } from '@/lib/errors/errors';
import { redactHelpMessageContent } from '@/lib/bot/help-redaction';

async function requireSuperAdmin() {
    const session = await auth();
    if (
        !session?.user ||
        !(session.user as { isSuperAdmin?: boolean }).isSuperAdmin
    ) {
        throw new ValidationError('Only super-admin can access help admin.');
    }
    return session;
}

// ─── Conversations ──────────────────────────────────────

export interface ListConversationsParams {
    page?: number;
    limit?: number;
    outcome?: string;
    channel?: string;
    tenantId?: string;
    q?: string;
}

export async function listHelpConversations(
    params: ListConversationsParams = {},
) {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();

    const { page = 1, limit = 20, outcome, channel, tenantId, q } = params;
    const where: Prisma.HelpInteractionWhereInput = {};

    if (outcome) where.outcome = outcome as never;
    if (channel) where.channel = channel;
    if (tenantId) where.tenantId = tenantId;
    if (q) where.question = { contains: q, mode: 'insensitive' };

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        mainDb.helpInteraction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            select: {
                id: true,
                tenantId: true,
                userId: true,
                channel: true,
                question: true,
                answerPreview: true,
                outcome: true,
                feedback: true,
                latencyMs: true,
                blockedReason: true,
                createdAt: true,
                conversationId: true,
            },
        }),
        mainDb.helpInteraction.count({ where }),
    ]);

    // Resolve tenant names
    const tenantIds = [
        ...new Set(items.map((i) => i.tenantId).filter(Boolean)),
    ] as string[];
    const tenants =
        tenantIds.length > 0
            ? await mainDb.tenant.findMany({
                  where: { id: { in: tenantIds } },
                  select: { id: true, name: true, subdomain: true },
              })
            : [];
    const tenantMap = Object.fromEntries(
        tenants.map((t) => [t.id, t.name || t.subdomain]),
    );

    const enriched = items.map((i) => ({
        ...i,
        tenantName: i.tenantId ? tenantMap[i.tenantId] || i.tenantId : null,
    }));

    return { items: enriched, total, page, limit };
}

export type HelpConversationDetail = {
    interaction: {
        id: string;
        question: string;
        answerPreview: string;
        outcome: string;
        channel: string;
        createdAt: Date;
        citedSlugs: string[];
    };
    conversation: {
        id: string;
        channel: string;
        status: string;
        createdAt: Date;
        lastMessageAt: Date;
    };
    messages: Array<{
        id: string;
        role: 'USER' | 'ASSISTANT';
        content: string;
        createdAt: Date;
        storageMayBeTruncated: boolean;
    }>;
    tools: Array<{
        name: string;
        allowed: boolean;
        outcome: string;
        createdAt: Date;
    }>;
    page: number;
    limit: number;
    total: number;
};

export type HelpConversationDetailResult =
    | { status: 'OK'; data: HelpConversationDetail }
    | { status: 'UNAVAILABLE' | 'NOT_FOUND' };

const MESSAGE_STORAGE_CAP = 4000;

/**
 * Loads one tenant conversation from a main-DB interaction selected by ID.
 * Tenant authority and datasource always come from the trusted server record.
 */
export async function getHelpConversationDetail(
    interactionId: string,
    params: { page?: number; limit?: number } = {},
): Promise<HelpConversationDetailResult> {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();
    const page = Math.max(1, Math.floor(params.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(params.limit || 50)));

    const interaction = await mainDb.helpInteraction.findUnique({
        where: { id: interactionId },
        select: {
            id: true,
            tenantId: true,
            userId: true,
            conversationId: true,
            question: true,
            answerPreview: true,
            outcome: true,
            channel: true,
            createdAt: true,
            citedSlugs: true,
        },
    });
    if (!interaction?.tenantId || !interaction.conversationId) {
        return { status: 'NOT_FOUND' };
    }

    const tenant = await mainDb.tenant.findFirst({
        where: { id: interaction.tenantId, status: 'ACTIVE' },
        select: { id: true, dbUrl: true },
    });
    if (!tenant) return { status: 'UNAVAILABLE' };

    try {
        const tenantDb = getTenantDb(tenant.dbUrl);
        const conversation = await tenantDb.helpConversation.findFirst({
            where: {
                id: interaction.conversationId,
                tenantId: tenant.id,
                ...(interaction.userId ? { userId: interaction.userId } : {}),
            },
            select: {
                id: true,
                tenantId: true,
                channel: true,
                status: true,
                createdAt: true,
                lastMessageAt: true,
            },
        });
        if (!conversation) return { status: 'NOT_FOUND' };

        const where = { conversationId: conversation.id };
        const [messages, total, tools] = await Promise.all([
            tenantDb.helpMessage.findMany({
                where,
                // USER precedes ASSISTANT when legacy concurrent writes share
                // the same timestamp; id provides a stable final tie-breaker.
                orderBy: [
                    { createdAt: 'asc' },
                    { role: 'asc' },
                    { id: 'asc' },
                ],
                skip: (page - 1) * limit,
                take: limit,
                select: { id: true, role: true, content: true, createdAt: true },
            }),
            tenantDb.helpMessage.count({ where }),
            tenantDb.helpToolExecution.findMany({
                where,
                orderBy: { createdAt: 'asc' },
                take: 100,
                select: {
                    toolName: true,
                    allowed: true,
                    outcome: true,
                    createdAt: true,
                },
            }),
        ]);

        return {
            status: 'OK',
            data: {
                interaction: {
                    id: interaction.id,
                    question: redactHelpMessageContent(interaction.question),
                    answerPreview: redactHelpMessageContent(
                        interaction.answerPreview,
                    ),
                    outcome: interaction.outcome,
                    channel: interaction.channel,
                    createdAt: interaction.createdAt,
                    citedSlugs: interaction.citedSlugs,
                },
                conversation: {
                    id: conversation.id,
                    channel: conversation.channel,
                    status: conversation.status,
                    createdAt: conversation.createdAt,
                    lastMessageAt: conversation.lastMessageAt,
                },
                messages: messages.map((message) => ({
                    id: message.id,
                    role: message.role,
                    content: redactHelpMessageContent(message.content),
                    createdAt: message.createdAt,
                    storageMayBeTruncated:
                        message.content.length >= MESSAGE_STORAGE_CAP,
                })),
                tools: tools.map((tool) => ({
                    name: tool.toolName,
                    allowed: tool.allowed,
                    outcome: tool.outcome,
                    createdAt: tool.createdAt,
                })),
                page,
                limit,
                total,
            },
        };
    } catch {
        // Do not expose datasource, topology, Prisma errors, or raw evidence.
        return { status: 'UNAVAILABLE' };
    }
}

// ─── Help Settings ──────────────────────────────────────

export interface HelpSettingItem {
    key: string;
    valueJson: string;
    updatedAt: Date;
    updatedBy: string | null;
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
    virtualCsEnabled: true,
    kbRetrievalEnabled: true,
    autoLearnDraftEnabled: false,
    autoPublishEnabled: false,
    minClusterSizeForDraft: 3,
    feedbackThumbsEnabled: true,
    guardrailMode: 'intent_v2',
    maxAgentToolLoops: 4,
    channels: ['web', 'telegram'],
    maxQuestionLength: 2000,
};

export async function getHelpSettings(): Promise<HelpSettingItem[]> {
    await requireSuperAdmin();
    const mainDb = getMainPrisma();

    const rows = await mainDb.helpSettings.findMany({
        orderBy: { key: 'asc' },
    });

    // Merge defaults for missing keys (not persisted yet)
    const existingKeys = new Set(rows.map((r) => r.key));
    const allRows: HelpSettingItem[] = [...rows];

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        if (!existingKeys.has(key)) {
            allRows.push({
                key,
                valueJson: JSON.stringify(defaultValue),
                updatedAt: new Date(0),
                updatedBy: null,
            });
        }
    }

    return allRows.sort((a, b) => a.key.localeCompare(b.key));
}

export async function setHelpSetting(key: string, valueJson: string) {
    const session = await requireSuperAdmin();
    const mainDb = getMainPrisma();
    const userId = (session.user as { id?: string }).id;

    if (!key || !key.trim()) throw new ValidationError('Key is required.');
    let parsed: unknown;
    try {
        parsed = JSON.parse(valueJson);
    } catch {
        throw new ValidationError('valueJson must be valid JSON.');
    }

    // Guard: autoPublish must stay false
    if (key === 'autoPublishEnabled' && parsed === true) {
        throw new ValidationError(
            'autoPublishEnabled must stay OFF (supervised-only).',
        );
    }

    const row = await mainDb.helpSettings.upsert({
        where: { key },
        create: {
            key,
            valueJson,
            updatedBy: userId,
        },
        update: {
            valueJson,
            updatedBy: userId,
        },
    });

    try {
        await logActivity({
            userId: userId || 'system',
            action: 'HELP_SETTINGS_UPDATED',
            entityType: 'HelpSettings',
            entityId: key,
            details: `${key} = ${valueJson.slice(0, 200)}`,
        });
    } catch {
        /* best effort */
    }

    return row;
}