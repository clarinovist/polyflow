import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import type { AssistantUserContext } from './assistant-types';
import { conversationAccessScope } from './conversation-scope';
import {
    resolveAssistantWorkContext,
    workContextKey,
} from './assistant-work-context';

export const historyQuerySchema = z
    .object({
        mode: z.enum(['list', 'latest', 'detail']).default('list'),
        pathname: z.string().min(1).max(300).default('/'),
        conversationId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{1,100}$/)
            .optional(),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .refine((value) => value.mode !== 'detail' || !!value.conversationId);

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
const PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 50;

/** Only use metadata from messages that passed the live authorization filter. */
function metadata(value: Prisma.JsonValue) {
    const parsed = z
        .object({
            pathname: z
                .string()
                .startsWith('/')
                .max(300)
                .refine((s) => !s.startsWith('//') && !s.includes('\\'))
                .catch('/'),
            contextKey: z.string(),
            profile: z
                .enum(['general', 'finance', 'production'])
                .catch('general'),
        })
        .safeParse(value);
    return parsed.success
        ? parsed.data
        : { pathname: '/', contextKey: '', profile: 'general' as const };
}

const articleSchema = z.object({
    slug: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    modules: z.array(z.string()).optional(),
});
const presentationSchema = z.object({
    citedArticles: z.array(articleSchema).optional(),
    relatedArticles: z.array(articleSchema).optional(),
    evidence: z
        .array(
            z.object({
                source: z.enum([
                    'tenant-data',
                    'global-kb',
                    'tenant-kb',
                    'audit-log',
                ]),
                label: z.string(),
                checkedAt: z.string(),
            }),
        )
        .optional(),
    confidence: z.number().optional(),
});

function presentation(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = presentationSchema.safeParse(value.response);
    if (!result.success) return {};
    const { evidence, ...rest } = result.data;
    return { ...rest, evidenceChips: evidence };
}

export async function queryConversationHistory(
    context: AssistantUserContext,
    query: HistoryQuery,
) {
    if (!context.tenantId || !context.userId)
        throw new Error('Missing history authority');
    const scope = conversationAccessScope(context);
    const active = resolveAssistantWorkContext(
        { pathname: query.pathname },
        context,
    );
    const currentKey = workContextKey(active);
    const messageWhere: Prisma.HelpMessageWhereInput = {
        evidenceJson: { path: ['accessScope'], equals: scope },
        ...(query.mode === 'latest'
            ? {
                  AND: [
                      {
                          evidenceJson: {
                              path: ['contextKey'],
                              equals: currentKey,
                          },
                      },
                  ],
              }
            : {}),
    };
    const where: Prisma.HelpConversationWhereInput = {
        tenantId: context.tenantId,
        userId: context.userId,
        channel: 'web',
        status: 'ACTIVE',
        messages: { some: messageWhere },
    };
    const firstMessage = {
        where: { ...messageWhere, role: 'USER' as const },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
        take: 1,
        select: { content: true, evidenceJson: true },
    };

    if (query.mode === 'list') {
        const rows = await prisma.helpConversation.findMany({
            where,
            orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
            skip: query.offset,
            take: PAGE_SIZE + 1,
            select: { id: true, lastMessageAt: true, messages: firstMessage },
        });
        return {
            conversations: rows.slice(0, PAGE_SIZE).map((row) => ({
                id: row.id,
                title: row.messages[0]?.content.slice(0, 100) || 'Percakapan',
                lastMessageAt: row.lastMessageAt.toISOString(),
                ...metadata(row.messages[0]?.evidenceJson ?? null),
            })),
            nextOffset:
                rows.length > PAGE_SIZE ? query.offset + PAGE_SIZE : null,
        };
    }

    const row = await prisma.helpConversation.findFirst({
        where: {
            ...where,
            ...(query.mode === 'detail' ? { id: query.conversationId } : {}),
        },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            messages: {
                where: messageWhere,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: query.offset,
                take: MESSAGE_PAGE_SIZE + 1,
                select: {
                    id: true,
                    role: true,
                    content: true,
                    evidenceJson: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!row) return { conversation: null };
    const info = metadata(row.messages[0]?.evidenceJson ?? null);
    return {
        conversation: {
            id: row.id,
            ...info,
            canContinue: info.contextKey === currentKey,
            messages: row.messages
                .slice(0, MESSAGE_PAGE_SIZE)
                .reverse()
                .map((message) => ({
                    id: message.id,
                    role: message.role.toLowerCase() as 'user' | 'assistant',
                    text: message.content,
                    createdAt: message.createdAt.toISOString(),
                    ...(message.role === 'ASSISTANT'
                        ? presentation(message.evidenceJson)
                        : {}),
                })),
            nextOffset:
                row.messages.length > MESSAGE_PAGE_SIZE
                    ? query.offset + MESSAGE_PAGE_SIZE
                    : null,
        },
    };
}
