import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const interactionFindUnique = vi.fn();
const tenantFindFirst = vi.fn();
const conversationFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageCount = vi.fn();
const toolFindMany = vi.fn();
const getTenantDbMock = vi.fn();

vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        helpInteraction: { findUnique: interactionFindUnique },
        tenant: { findFirst: tenantFindFirst },
    }),
    getTenantDb: (...args: unknown[]) => getTenantDbMock(...args),
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

import { getHelpConversationDetail } from '../help-admin';
import { redactHelpMessageContent } from '@/lib/bot/help-redaction';

const interaction = {
    id: 'interaction-1',
    tenantId: 'tenant-a',
    userId: 'user-a',
    conversationId: 'conversation-a',
    question: 'Mengapa nilai berubah?',
    answerPreview: 'Mohon kirim detail.',
    outcome: 'PARTIAL',
    channel: 'web',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    citedSlugs: ['panduan-aman'],
};

describe('getHelpConversationDetail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.mockResolvedValue({
            user: { id: 'super-1', isSuperAdmin: true },
        });
        interactionFindUnique.mockResolvedValue(interaction);
        tenantFindFirst.mockResolvedValue({
            id: 'tenant-a',
            dbUrl: 'postgresql://private',
        });
        conversationFindFirst.mockResolvedValue({
            id: 'conversation-a',
            tenantId: 'tenant-a',
            channel: 'web',
            status: 'ACTIVE',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            lastMessageAt: new Date('2026-01-01T00:02:00Z'),
        });
        messageFindMany.mockResolvedValue([
            {
                id: 'message-1',
                role: 'USER',
                content: 'token=very-secret-value',
                createdAt: new Date('2026-01-01T00:00:00Z'),
            },
            {
                id: 'message-2',
                role: 'ASSISTANT',
                content: 'Mohon kirim reproduksi.',
                createdAt: new Date('2026-01-01T00:01:00Z'),
            },
        ]);
        messageCount.mockResolvedValue(2);
        toolFindMany.mockResolvedValue([
            {
                toolName: 'search_help_articles',
                allowed: true,
                outcome: 'SUCCESS',
                createdAt: new Date('2026-01-01T00:00:30Z'),
            },
        ]);
        getTenantDbMock.mockReturnValue({
            helpConversation: { findFirst: conversationFindFirst },
            helpMessage: { findMany: messageFindMany, count: messageCount },
            helpToolExecution: { findMany: toolFindMany },
        });
    });

    it('rejects non-super-admin before querying metadata', async () => {
        authMock.mockResolvedValue({ user: { isSuperAdmin: false } });
        await expect(getHelpConversationDetail('interaction-1')).rejects.toThrow(
            'Only super-admin',
        );
        expect(interactionFindUnique).not.toHaveBeenCalled();
    });

    it('binds the tenant conversation and user to trusted interaction metadata', async () => {
        const result = await getHelpConversationDetail('interaction-1', {
            page: 1,
            limit: 20,
        });

        expect(tenantFindFirst).toHaveBeenCalledWith({
            where: { id: 'tenant-a', status: 'ACTIVE' },
            select: { id: true, dbUrl: true },
        });
        expect(conversationFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'conversation-a',
                    tenantId: 'tenant-a',
                    userId: 'user-a',
                },
            }),
        );
        expect(messageFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [
                    { createdAt: 'asc' },
                    { role: 'asc' },
                    { id: 'asc' },
                ],
            }),
        );
        expect(result.status).toBe('OK');
        if (result.status === 'OK') {
            expect(result.data.messages.map((message) => message.role)).toEqual([
                'USER',
                'ASSISTANT',
            ]);
            expect(result.data.messages[0].content).toBe('token=[REDACTED]');
            expect(JSON.stringify(result)).not.toContain('postgresql://');
            expect(JSON.stringify(result)).not.toContain('evidenceJson');
            expect(JSON.stringify(result)).not.toContain('permissionResource');
        }
    });

    it('fails closed for mismatch, missing/offline tenant, and tenant DB errors', async () => {
        conversationFindFirst.mockResolvedValueOnce(null);
        await expect(getHelpConversationDetail('interaction-1')).resolves.toEqual({
            status: 'NOT_FOUND',
        });

        tenantFindFirst.mockResolvedValueOnce(null);
        await expect(getHelpConversationDetail('interaction-1')).resolves.toEqual({
            status: 'UNAVAILABLE',
        });

        getTenantDbMock.mockImplementationOnce(() => {
            throw new Error('connection contained private topology');
        });
        await expect(getHelpConversationDetail('interaction-1')).resolves.toEqual({
            status: 'UNAVAILABLE',
        });
    });

    it('marks storage-cap messages and caps pagination', async () => {
        messageFindMany.mockResolvedValueOnce([
            {
                id: 'message-long',
                role: 'USER',
                content: 'x'.repeat(4000),
                createdAt: new Date(),
            },
        ]);
        const result = await getHelpConversationDetail('interaction-1', {
            page: -2,
            limit: 1000,
        });
        expect(messageFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0, take: 100 }),
        );
        if (result.status === 'OK') {
            expect(result.data.messages[0].storageMayBeTruncated).toBe(true);
        }
    });
});

describe('redactHelpMessageContent', () => {
    it('redacts database URLs, API-like keys, and named secrets', () => {
        const redacted = redactHelpMessageContent(
            'postgresql://user:pass@db/internal sk-live_abcdefghijkl token=abc123',
        );
        expect(redacted).not.toContain('user:pass');
        expect(redacted).not.toContain('abcdefghijkl');
        expect(redacted).not.toContain('abc123');
    });
});
