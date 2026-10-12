import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    if (process.env.ASSISTANT_TEST_MAIN_DATABASE_URL) {
        process.env.DATABASE_URL = process.env.ASSISTANT_TEST_MAIN_DATABASE_URL;
    } else {
        process.env.DATABASE_URL =
            'postgresql://postgres@127.0.0.1:1/polyflow_dummy_test?connect_timeout=1';
    }
});

const mainUrl = process.env.ASSISTANT_TEST_MAIN_DATABASE_URL;
const tenantUrl = process.env.ASSISTANT_TEST_TENANT_A_DATABASE_URL;
const enabled = Boolean(mainUrl && tenantUrl);

function guardedClient(url: string, expectedPath: string): PrismaClient {
    const parsed = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55440' ||
        parsed.pathname !== expectedPath ||
        parsed.search
    ) {
        throw new Error('Only the isolated assistant PostgreSQL fixture is allowed');
    }
    return new PrismaClient({ datasources: { db: { url } } });
}

const mainDb = enabled ? guardedClient(mainUrl as string, '/polyflow_assistant_main_test') : null;
const tenantDb = enabled ? guardedClient(tenantUrl as string, '/polyflow_assistant_tenant_a_test') : null;
afterAll(async () => {
    await mainDb?.$disconnect();
    await tenantDb?.$disconnect();
});

describe.skipIf(!enabled)('durable projection idempotency on isolated PostgreSQL', () => {
    it('re-projecting the same final answer never duplicates history rows', async () => {
        const { Harness, MemoryStorage, createRegistry } = await import('@earendil-works/pi-durable');
        const { BACKGROUND_CONTEXT } = await import('@earendil-works/chord/context');
        const { createModels, fauxAssistantMessage, fauxProvider, fauxText } = await import('@earendil-works/pi-ai');
        const { conversationAccessScope } = await import('../../conversation-scope');
        const { resolveAssistantWorkContext, workContextKey } = await import('../../assistant-work-context');
        const { projectDurableSubmission } = await import('../projection');

        const suffix = randomUUID();
        const tenantId = 'durable-proj-' + suffix;
        const userId = 'durable-proj-user-' + suffix;
        const publicConversationId = 'durable-proj-conv-' + suffix;
        const requestId = randomUUID();
        const question = 'synthetic projection idempotency';
        const context = {
            userId,
            requesterName: 'Synthetic',
            activeRole: 'ADMIN',
            roles: ['ADMIN'],
            allowedResources: 'ALL' as const,
            tenantId,
            channel: 'web' as const,
            locale: 'id-ID',
        };
        const accessScopeHash = conversationAccessScope(context);
        const contextKey = workContextKey(resolveAssistantWorkContext({ pathname: '/' }, context));

        await mainDb!.tenant.create({
            data: {
                id: tenantId,
                name: 'Synthetic Projection Contract',
                subdomain: 'durable-proj-' + suffix.slice(-12),
                dbUrl: tenantUrl as string,
                status: 'ACTIVE',
            },
        });
        try {
            await tenantDb!.user.create({
                data: {
                    id: userId,
                    email: 'proj-' + suffix + '@example.invalid',
                    name: 'Synthetic',
                    password: 'test-only',
                    role: 'ADMIN',
                },
            });
            await tenantDb!.helpConversation.create({
                data: {
                    id: publicConversationId,
                    tenantId,
                    userId,
                    channel: 'web',
                    status: 'ACTIVE',
                    assistantRuntime: 'pi-durable',
                    accessScopeHash,
                    workContextKey: contextKey,
                },
            });
            const faux = fauxProvider({ provider: 'faux-projection' });
            faux.setResponses([fauxAssistantMessage(fauxText('durable-final'))]);
            const models = createModels();
            models.setProvider(faux.provider);
            const harness = await Harness.open(
                new MemoryStorage(),
                { models, registry: createRegistry() },
                BACKGROUND_CONTEXT,
            );
            try {
                const root = await harness.root(BACKGROUND_CONTEXT, {
                    agent: {
                        model: { provider: 'faux-projection', modelId: faux.getModel().id },
                    },
                });
                const submission = await root.submit(
                    { type: 'input', content: question, requestId },
                    BACKGROUND_CONTEXT,
                );
                const settled = await submission.wait(BACKGROUND_CONTEXT);
                expect(settled.status).toBe('done');
                if (settled.status !== 'done' || settled.type !== 'input') {
                    throw new Error('Synthetic submission did not settle');
                }
                const authority = {
                    schemaVersion: 1 as const,
                    publicConversationId,
                    tenantId,
                    userId,
                    channel: 'web' as const,
                    accessScopeHash,
                    workContextKey: contextKey,
                    pathname: '/',
                    profile: 'general' as const,
                };
                const input = {
                    harness,
                    durableConversationId: Number(root.id),
                    authority,
                    requestId,
                    question,
                    userEntryId: Number(settled.entry),
                    answerEntryId: Number(settled.answer),
                    startedAt: Date.now(),
                };
                const first = await projectDurableSubmission(input);
                const second = await projectDurableSubmission(input);
                expect(first.historySaved).toBe(true);
                expect(second.historySaved).toBe(true);
                expect(first.interactionId).toBeTruthy();
                expect(second.interactionId).toBe(first.interactionId);
                expect(
                    await tenantDb!.helpMessage.count({ where: { conversationId: publicConversationId } }),
                ).toBe(2);
                expect(
                    await mainDb!.helpInteraction.count({
                        where: { tenantId_userId_channel_requestId: { tenantId, userId, channel: 'web', requestId } },
                    }),
                ).toBe(1);
                expect(
                    await tenantDb!.helpToolExecution.count({ where: { conversationId: publicConversationId } }),
                ).toBe(0);
                expect(
                    await tenantDb!.auditLog.count({ where: { dedupeKey: 'assistant:' + requestId } }),
                ).toBe(1);
            } finally {
                await harness.close(BACKGROUND_CONTEXT);
            }
        } finally {
            await tenantDb!.auditLog.deleteMany({ where: { dedupeKey: 'assistant:' + requestId } });
            await tenantDb!.helpMessage.deleteMany({ where: { conversationId: publicConversationId } });
            await tenantDb!.helpConversation.deleteMany({ where: { id: publicConversationId } });
            await tenantDb!.user.deleteMany({ where: { id: userId } });
            await mainDb!.helpInteraction.deleteMany({
                where: { tenantId_userId_channel_requestId: { tenantId, userId, channel: 'web', requestId } },
            });
            await mainDb!.tenant.delete({ where: { id: tenantId } });
        }
    }, 60_000);
});
