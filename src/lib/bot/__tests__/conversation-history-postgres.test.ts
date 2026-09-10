import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { AssistantUserContext } from '../assistant-types';
const connection = process.env.TEST_HISTORY_DATABASE_URL;
let db: PrismaClient;
if (connection) {
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/polyflow_history_test') throw new Error('Only disposable localhost history test database is allowed');
    db = new PrismaClient({ datasources: { db: { url: connection } } });
}
vi.mock('@/lib/core/prisma', () => ({ prisma: new Proxy({}, { get: (_target, name) => {
    const value = db[name as keyof PrismaClient];
    return typeof value === 'function' ? value.bind(db) : value;
} }) }));
import { queryConversationHistory } from '../conversation-history';
import { getOrCreateConversation, loadConversationContext, saveConversationExchange } from '../conversation-service';
import { conversationAccessScope } from '../conversation-scope';
const owner: AssistantUserContext = { tenantId: 'test-tenant-a', userId: 'test-user-a', roles: ['FINANCE'], allowedResources: ['/finance'], channel: 'web', locale: 'id-ID' };
const key = 'finance:/finance';
async function seed(context = owner, channel = 'web', legacy = false) {
    const c = await getOrCreateConversation({ tenantId: context.tenantId, userId: context.userId, channel });
    await saveConversationExchange({ conversationId: c.id, question: 'Synthetic invoice question', answer: 'Synthetic private answer', metadata: { contextKey: key, pathname: '/finance', profile: 'finance', ...(legacy ? {} : { accessScope: conversationAccessScope(context) }) } });
    return c;
}

describe.skipIf(!connection)('conversation history real PostgreSQL isolation', () => {
    beforeAll(async () => {
        await db.$executeRawUnsafe('CREATE TYPE "HelpConversationStatus" AS ENUM (\'ACTIVE\', \'CLOSED\', \'EXPIRED\')');
        await db.$executeRawUnsafe('CREATE TYPE "HelpMessageRole" AS ENUM (\'USER\', \'ASSISTANT\')');
        await db.$executeRawUnsafe(`CREATE TABLE "HelpConversation" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "userId" TEXT NOT NULL, "channel" TEXT NOT NULL DEFAULT 'web', "title" TEXT, "status" "HelpConversationStatus" NOT NULL DEFAULT 'ACTIVE', "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "summary" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now())`);
        await db.$executeRawUnsafe(`CREATE TABLE "HelpMessage" ("id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "HelpConversation"("id") ON DELETE CASCADE, "role" "HelpMessageRole" NOT NULL, "content" TEXT NOT NULL, "evidenceJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now())`);
    });
    beforeEach(async () => { vi.stubEnv('ASSISTANT_CONTEXTUAL_PROFILES', 'true'); await db.helpMessage.deleteMany(); await db.helpConversation.deleteMany(); });
    afterAll(async () => {
        await db.$executeRawUnsafe('DROP TABLE IF EXISTS "HelpMessage", "HelpConversation"');
        await db.$executeRawUnsafe('DROP TYPE IF EXISTS "HelpMessageRole", "HelpConversationStatus"');
        await db.$disconnect();
    });

    it('never lists or opens other users/tenants/channels, legacy, or revoked-grant messages', async () => {
        const own = await seed();
        const foreignUser = await seed({ ...owner, userId: 'test-user-b' });
        const foreignTenant = await seed({ ...owner, tenantId: 'test-tenant-b' });
        const telegram = await seed(owner, 'telegram');
        const legacy = await seed(owner, 'web', true);
        const result = await queryConversationHistory(owner, { mode: 'list', pathname: '/finance', offset: 0 });
        expect(result.conversations?.map((c) => c.id)).toEqual([own.id]);
        expect((await getOrCreateConversation({ tenantId: owner.tenantId, userId: owner.userId,
            conversationId: legacy.id, channel: 'web', accessScope: conversationAccessScope(owner), contextKey: key })).id).not.toBe(legacy.id);
        for (const c of [foreignUser, foreignTenant, telegram, legacy]) {
            expect(await queryConversationHistory(owner, { mode: 'detail', conversationId: c.id, pathname: '/finance', offset: 0 })).toEqual({ conversation: null });
        }
        const revoked = { ...owner, allowedResources: [] };
        expect((await queryConversationHistory(revoked, { mode: 'list', pathname: '/finance', offset: 0 })).conversations).toEqual([]);
        expect((await loadConversationContext(own.id, key, conversationAccessScope(revoked))).history).toEqual([]);
    });

    it('restores ordered complete exchange and reuses only matching authorized context', async () => {
        const own = await seed();
        const restored = await queryConversationHistory(owner, { mode: 'latest', pathname: '/finance', offset: 0 });
        expect(restored.conversation?.id).toBe(own.id);
        expect(restored.conversation?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
        const request = { tenantId: owner.tenantId, userId: owner.userId, conversationId: own.id, channel: 'web', accessScope: conversationAccessScope(owner), contextKey: key };
        expect((await getOrCreateConversation(request)).id).toBe(own.id);
        expect((await getOrCreateConversation({ ...request, contextKey: 'general:/dashboard' })).id).not.toBe(own.id);
        expect((await getOrCreateConversation({ ...request, accessScope: 'revoked' })).id).not.toBe(own.id);
    });

    it('serializes simultaneous exchanges so questions and answers remain paired', async () => {
        const own = await getOrCreateConversation({ tenantId: owner.tenantId, userId: owner.userId });
        await Promise.all([1, 2, 3].map((i) => saveConversationExchange({ conversationId: own.id, question: `Q${i}`, answer: `A${i}`, metadata: {} })));
        const rows = await db.helpMessage.findMany({ where: { conversationId: own.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        expect(rows.map((m) => m.role)).toEqual(['USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT']);
        for (let i = 0; i < rows.length; i += 2) expect(rows[i].content.slice(1)).toBe(rows[i + 1].content.slice(1));
    });

    it('rolls back a failed exchange without leaving an orphan user message', async () => {
        const own = await getOrCreateConversation({ tenantId: owner.tenantId, userId: owner.userId });
        await db.$executeRawUnsafe(`ALTER TABLE "HelpMessage" ADD CONSTRAINT "synthetic_answer_failure" CHECK ("role" != 'ASSISTANT')`);
        try {
            await expect(saveConversationExchange({ conversationId: own.id, question: 'q', answer: 'a', metadata: {} })).rejects.toThrow();
            expect(await db.helpMessage.count({ where: { conversationId: own.id } })).toBe(0);
        } finally {
            await db.$executeRawUnsafe('ALTER TABLE "HelpMessage" DROP CONSTRAINT "synthetic_answer_failure"');
        }
    });
});
