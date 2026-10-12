import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
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

const children: ChildProcessWithoutNullStreams[] = [];
afterEach(() => {
    for (const child of children.splice(0)) {
        if (!child.killed) child.kill('SIGKILL');
    }
});

function fixture() {
    const suffix = randomUUID();
    const tenantId = 'durable-pgcrash-' + suffix;
    const userId = 'durable-pgcrash-user-' + suffix;
    const publicConversationId = 'durable-pgcrash-conv-' + suffix;
    const requestId = randomUUID();
    const question = 'synthetic pg crash admission';
    const accessScopeHash = createHash('sha256').update(suffix).digest('hex');
    const storageKey = createHash('sha256').update(tenantId).digest('hex');
    return {
        tenantId,
        userId,
        publicConversationId,
        requestId,
        question,
        questionHash: createHash('sha256').update(question).digest('hex'),
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
            accessScopeHash,
            workContextKey: 'general:/',
            pathname: '/',
            profile: 'general' as const,
        },
        storageKey,
        bindingId: 'binding-' + suffix,
        submissionId: 'submission-' + suffix,
    };
}

function killAfterMarker(
    payload: unknown,
): Promise<{ killed: boolean }> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                new URL('./pg-crash-child.mjs', import.meta.url).pathname,
                connection!,
                JSON.stringify(payload),
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        children.push(child);
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('pg_reserved marker timeout: ' + stderr));
        }, 15_000);
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
            if (!stdout.includes('PHASE:pg_reserved')) return;
            clearTimeout(timeout);
            child.once('exit', () => resolve({ killed: true }));
            child.kill('SIGKILL');
        });
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            if (!stdout.includes('PHASE:pg_reserved')) {
                clearTimeout(timeout);
                reject(
                    new Error(
                        'child exited before pg_reserved code=' +
                            code +
                            ' signal=' +
                            signal +
                            ' stderr=' +
                            stderr,
                    ),
                );
            }
        });
    });
}

describe.skipIf(!connection)('durable admission PG crash barrier', () => {
    it('SIGKILL after pg_reserved still reconciles to one binding and one reservation', async () => {
        const input = fixture();
        await database!.tenant.create({
            data: {
                id: input.tenantId,
                name: 'Synthetic PG Crash Contract',
                subdomain: 'durable-pgcrash-' + input.tenantId.slice(-12),
                dbUrl: connection!,
                status: 'ACTIVE',
            },
        });
        try {
            await killAfterMarker({
                binding: [
                    input.bindingId,
                    input.publicConversationId,
                    input.tenantId,
                    input.userId,
                    'web',
                    input.authority.accessScopeHash,
                    'general:/',
                    input.storageKey,
                    '7',
                    1,
                    '/',
                    'general',
                ],
                submission: [
                    input.submissionId,
                    input.requestId,
                    input.questionHash,
                    input.publicConversationId,
                    input.tenantId,
                    input.userId,
                    'web',
                ],
            });
            const admission = await reserveDurableAdmission({
                database: database!,
                envelope: input.envelope,
                authority: input.authority,
                questionHash: input.questionHash,
                durableConversationId: '7',
            });
            expect(admission.reservation.id).toBe(input.submissionId);
            expect(admission.reservation.attempts).toBe(2);
            expect(admission.binding.id).toBe(input.bindingId);
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
        } finally {
            await database!.assistantDurableSubmission.deleteMany({
                where: { tenantId: input.tenantId },
            });
            await database!.assistantDurableBinding.deleteMany({
                where: { tenantId: input.tenantId },
            });
            await database!.tenant.delete({ where: { id: input.tenantId } });
        }
    }, 45_000);
});
