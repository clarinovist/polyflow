import type { Prisma } from '@prisma/client';
import {
    AssistantEntry,
    ToolResultEntry,
    type Harness,
} from '@earendil-works/pi-durable';
import { getMainPrisma, prisma } from '@/lib/core/prisma';
import { assistantBugReportNotice } from '../bug-report';

import { resolveOutcome } from '../chat-audit';
import { readDurablePresentation } from './response';
import type { AssistantAuthority } from './protocol';
import type { AssistantResponse, ToolEvidence } from '../assistant-types';
import { withBoundAuthority } from './authority';

function json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function upsertDurableToolAudit(input: {
    authority: AssistantAuthority;
    executionKey: string;
    taskId: string;
    callId: string;
    toolName: string;
    permissionResource: string;
    evidence?: ToolEvidence;
    allowed: boolean;
    outcome: 'SUCCESS' | 'ERROR' | 'DENIED' | 'INTERRUPTED' | 'STARTED';
    durationMs: number;
}): Promise<void> {
    await withBoundAuthority(input.authority, async () => {
        await prisma.helpToolExecution.upsert({
            where: {
                conversationId_executionKey: {
                    conversationId: input.authority.publicConversationId,
                    executionKey: input.executionKey,
                },
            },
            create: {
                conversationId: input.authority.publicConversationId,
                executionKey: input.executionKey,
                durableTaskId: input.taskId,
                durableCallId: input.callId,
                toolName: input.toolName,
                permissionResource: input.permissionResource,
                allowed: input.allowed,
                outcome: input.outcome,
                durationMs: input.durationMs,
                evidenceMetaJson: json(input.evidence?.searchMeta ?? {}),
            },
            update: {
                allowed: input.allowed,
                outcome: input.outcome,
                durationMs: input.durationMs,
                evidenceMetaJson: json(input.evidence?.searchMeta ?? {}),
            },
        });
    });
}

export async function projectDurableSubmission(input: {
    harness: Harness;
    durableConversationId: number;
    authority: AssistantAuthority;
    requestId: string;
    question: string;
    userEntryId: number;
    answerEntryId: number;
    startedAt: number;
}): Promise<AssistantResponse & { interactionId: string | null }> {
    const conversation = await input.harness.conversation(
        input.durableConversationId as never,
        // The durable read is host-owned and non-cancellable here.
        (await import('@earendil-works/chord/context')).BACKGROUND_CONTEXT,
    );
    if (!conversation) throw new Error('DURABLE_CONVERSATION_NOT_FOUND');
    const entries = await conversation.entries(
        {
            minEntryId: input.userEntryId as never,
            maxEntryId: input.answerEntryId as never,
        },
        500,
        undefined,
        (await import('@earendil-works/chord/context')).BACKGROUND_CONTEXT,
    );
    const answerEntry = entries.items.find(
        (entry) =>
            Number(entry.id) === input.answerEntryId &&
            AssistantEntry.is(entry),
    );
    const answerMessage = answerEntry?.model?.[0];
    const answer =
        answerMessage?.role === 'assistant'
            ? answerMessage.content
                  .filter((item) => item.type === 'text')
                  .map((item) => item.text)
                  .join('')
                  .trim()
            : '';

    const toolResults = entries.items.filter(ToolResultEntry.is);
    const evidences = toolResults.flatMap((entry) => {
        const details =
            entry.model?.[0]?.role === 'toolResult'
                ? entry.model[0].details
                : undefined;
        if (!details || typeof details !== 'object' || Array.isArray(details))
            return [];
        const evidence = (details as { evidence?: ToolEvidence }).evidence;
        return evidence ? [evidence] : [];
    });
    const citedArticles = evidences.flatMap((evidence) =>
        (evidence.entities ?? [])
            .filter((entity) => entity.type === 'HelpArticle' && !!entity.href)
            .map((entity) => ({ slug: entity.id, title: entity.label })),
    );
    const durablePresentation = await readDurablePresentation(
        input.harness,
        input.durableConversationId as never,
        input.userEntryId as never,
        input.answerEntryId as never,
        input.requestId,
    );
    const response: AssistantResponse = durablePresentation
        ? {
              ...durablePresentation,
              requestId: input.requestId,
              conversationId: input.authority.publicConversationId,
              historySaved: true,
          }
        : {
              requestId: input.requestId,
              answer:
                  answer || 'Maaf, belum ada jawaban yang bisa saya berikan.',
              citations: evidences.map((evidence) => `tool:${evidence.source}`),
              citedArticles: citedArticles.slice(0, 3),
              evidence: evidences.map((evidence) => ({
                  source: evidence.source,
                  label: evidence.summary.slice(0, 160),
                  checkedAt: evidence.checkedAt,
              })),
              conversationId: input.authority.publicConversationId,
              confidence: evidences.length > 0 ? 0.85 : 0.5,
              safety: { allowed: true },
              historySaved: true,
          };

    return withBoundAuthority(input.authority, async ({ assistantContext }) => {
        try {
            // Project tenant history first. A main interaction must never point
            // at a conversation whose visible exchange is still missing.
            await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "HelpConversation" WHERE id = ${input.authority.publicConversationId} FOR UPDATE`;
                const baseMetadata = {
                    accessScope: input.authority.accessScopeHash,
                    contextKey: input.authority.workContextKey,
                    pathname: input.authority.pathname,
                    profile: input.authority.profile,
                } satisfies Prisma.InputJsonObject;
                await tx.helpMessage.upsert({
                    where: {
                        conversationId_requestId_role: {
                            conversationId:
                                input.authority.publicConversationId,
                            requestId: input.requestId,
                            role: 'USER',
                        },
                    },
                    create: {
                        conversationId: input.authority.publicConversationId,
                        requestId: input.requestId,
                        role: 'USER',
                        content: input.question.slice(0, 4000),
                        evidenceJson: baseMetadata,
                    },
                    update: {},
                });
                const assistant = await tx.helpMessage.upsert({
                    where: {
                        conversationId_requestId_role: {
                            conversationId:
                                input.authority.publicConversationId,
                            requestId: input.requestId,
                            role: 'ASSISTANT',
                        },
                    },
                    create: {
                        conversationId: input.authority.publicConversationId,
                        requestId: input.requestId,
                        durableEntryId: String(input.answerEntryId),
                        role: 'ASSISTANT',
                        content: response.answer.slice(0, 4000),
                        evidenceJson: json({ ...baseMetadata, response }),
                    },
                    update: {
                        durableEntryId: String(input.answerEntryId),
                        content: response.answer.slice(0, 4000),
                        evidenceJson: json({ ...baseMetadata, response }),
                    },
                });
                await tx.helpConversation.update({
                    where: { id: input.authority.publicConversationId },
                    data: { lastMessageAt: assistant.createdAt },
                });
            });

            const interaction = await getMainPrisma().$transaction(
                async (mainTx) => {
                    const saved = await mainTx.helpInteraction.upsert({
                        where: {
                            tenantId_userId_channel_requestId: {
                                tenantId: input.authority.tenantId,
                                userId: input.authority.userId,
                                channel: input.authority.channel,
                                requestId: input.requestId,
                            },
                        },
                        create: {
                            tenantId: input.authority.tenantId,
                            userId: input.authority.userId,
                            channel: input.authority.channel,
                            requestId: input.requestId,
                            question: input.question,
                            answerPreview: response.answer.slice(0, 500),
                            outcome: resolveOutcome({
                                channel: input.authority.channel,
                                product: 'polyflow',
                                question: input.question,
                                answer: response.answer,
                                allowed: true,
                                success: true,
                                userId: input.authority.userId,
                                tenantId: input.authority.tenantId,
                                latencyMs: Date.now() - input.startedAt,
                            }),
                            confidence: response.confidence,
                            latencyMs: Date.now() - input.startedAt,
                            conversationId:
                                input.authority.publicConversationId,
                            citedSlugs: citedArticles.map((item) => item.slug),
                        },
                        update: {
                            answerPreview: response.answer.slice(0, 500),
                            confidence: response.confidence,
                            latencyMs: Date.now() - input.startedAt,
                            conversationId:
                                input.authority.publicConversationId,
                            citedSlugs: citedArticles.map((item) => item.slug),
                        },
                    });
                    return saved;
                },
            );

            await prisma.auditLog.upsert({
                where: { dedupeKey: `assistant:${input.requestId}` },
                create: {
                    dedupeKey: `assistant:${input.requestId}`,
                    userId: assistantContext.userId,
                    action: 'VIRTUAL_CS_QUERY_ALLOWED',
                    entityType: 'VirtualCS',
                    entityId: input.requestId,
                    details: 'WEB | durable assistant submission',
                    changes: JSON.stringify({
                        requestId: input.requestId,
                        runtime: 'pi-durable',
                    }),
                },
                update: {},
            });
            const bugReportNotice = await assistantBugReportNotice(
                response,
                interaction.id,
                {
                    tenantId: input.authority.tenantId,
                    userId: input.authority.userId,
                },
            );
            return {
                ...response,
                interactionId: interaction.id,
                bugReportNotice,
            };
        } catch (error) {
            console.error('[ASSISTANT_PROJECTION_FAILED]', {
                requestId: input.requestId,
                code:
                    error && typeof error === 'object' && 'code' in error
                        ? String(error.code)
                        : 'UNKNOWN',
            });
            return { ...response, historySaved: false, interactionId: null };
        }
    });
}
