import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { reserveDurableAdmission } from '../admission';

const connection = process.env.ASSISTANT_TEST_MAIN_DATABASE_URL;

function isolatedClient(url: string | undefined): PrismaClient | null {
    if (!url) return null;
    const parsed = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        parsed.hostname !== '127.0.0.1' ||
        parsed.port !== '55440' ||
        parsed.pathname !== '/polyflow_assistant_main_test' ||
        parsed.search
    ) {
        throw new Error('Only the isolated assistant PostgreSQL fixture is allowed');
    }
    return new PrismaClient({ datasources: { db: { url } } });
}

const database = isolatedClient(connection);
afterAll(async () => database?.$disconnect());

function fixture() {
    const suffix = randomUUID();
    const tenantId = 'durable-tenant-' + suffix;
    const userId = 'durable-user-' + suffix;
    const publicConversationId = 'durable-conversation-' + suffix;
    const requestId = randomUUID();
    const question = 'synthetic durable admission';
    return {
        tenantId,
        publicConversationId,
        envelope: {
            protocolVersion: 1 as const,
            requestId,
            tenantId,
            userId,
            channel: 'web' as const,
            question,
            workContext: { pathname: '/' },
        },
        authority: {
            schemaVersion: 1 as const,
            publicConversationId,
            tenantId,
            userId,
            channel: 'web' as const,
            accessScopeHash: createHash('sha256').update(suffix).digest('hex'),
            workContextKey: 'general:/',
            pathname: '/',
            profile: 'general' as const,
        },
        questionHash: createHash('sha256').update(question).digest('hex'),
    };
}

async function withTenant<T>(operation: (input: ReturnType<typeof fixture>) => Promise<T>) {
    if (!database) throw new Error('fixture unavailable');
    const input = fixture();
    await database.tenant.create({
        data: {
            id: input.tenantId,
            name: 'Synthetic Durable Contract',
            subdomain: 'durable-' + input.tenantId.slice(-12),
            dbUrl: connection!,
            status: 'ACTIVE',
        },
    });
    try {
        return await operation(input);
    } finally {
        await database.assistantDurableSubmission.deleteMany({
            where: { tenantId: input.tenantId },
        });
        await database.assistantDurableBinding.deleteMany({
            where: { tenantId: input.tenantId },
        });
        await database.tenant.delete({ where: { id: input.tenantId } });
    }
}

describe.skipIf(!connection)('durable admission on isolated PostgreSQL', () => {
    it('commits the binding parent and reservation child atomically', async () => {
        await withTenant(async (input) => {
            const admission = await reserveDurableAdmission({
                database: database!,
                envelope: input.envelope,
                authority: input.authority,
                questionHash: input.questionHash,
                durableConversationId: '7',
            });
            expect(admission.binding.durableConversationId).toBe('7');
            expect(admission.reservation).toMatchObject({
                publicConversationId: input.publicConversationId,
                status: 'pending',
                attempts: 1,
            });
            expect(
                await database!.assistantDurableBinding.count({
                    where: { tenantId: input.tenantId },
                }),
            ).toBe(1);
            expect(
                await database!.assistantDurableSubmission.count({
                    where: { tenantId: input.tenantId },
                }),
            ).toBe(1);
        });
    });

    it('deduplicates concurrent retries without replacing the binding', async () => {
        await withTenant(async (input) => {
            const call = () =>
                reserveDurableAdmission({
                    database: database!,
                    envelope: input.envelope,
                    authority: input.authority,
                    questionHash: input.questionHash,
                    durableConversationId: '9',
                });
            const [first, second] = await Promise.all([call(), call()]);
            expect(first.reservation.id).toBe(second.reservation.id);
            expect(
                await database!.assistantDurableBinding.count({
                    where: { tenantId: input.tenantId },
                }),
            ).toBe(1);
            const stored =
                await database!.assistantDurableSubmission.findUniqueOrThrow({
                    where: {
                        tenantId_userId_channel_requestId: {
                            tenantId: input.tenantId,
                            userId: input.envelope.userId,
                            channel: input.envelope.channel,
                            requestId: input.envelope.requestId,
                        },
                    },
                });
            expect(stored.attempts).toBe(2);
        });
    });

    it('rejects a retry that tries to replace the durable conversation', async () => {
        await withTenant(async (input) => {
            await reserveDurableAdmission({
                database: database!,
                envelope: input.envelope,
                authority: input.authority,
                questionHash: input.questionHash,
                durableConversationId: '11',
            });
            await expect(
                reserveDurableAdmission({
                    database: database!,
                    envelope: input.envelope,
                    authority: input.authority,
                    questionHash: input.questionHash,
                    durableConversationId: '12',
                }),
            ).rejects.toMatchObject({
                code: 'CONTEXT_MISMATCH',
                status: 409,
            });
            const stored =
                await database!.assistantDurableBinding.findUniqueOrThrow({
                    where: {
                        publicConversationId: input.publicConversationId,
                    },
                });
            expect(stored.durableConversationId).toBe('11');
        });
    });
});
