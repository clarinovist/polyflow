import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildProposalsMessage, runProposalsDigest } from '@/lib/telegram/proposals-digest';

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: vi.fn(),
}));

vi.mock('@/lib/telegram/send-message', () => ({
    sendTelegramMessage: vi.fn(),
}));

import { getMainPrisma } from '@/lib/core/prisma';
import { sendTelegramMessage } from '@/lib/telegram/send-message';

describe('buildProposalsMessage', () => {
    it('formats numbered items with requesters and modules', () => {
        const msg = buildProposalsMessage(
            [{ id: "1", title: "Export excel", requesterCount: 4, impactedModules: ["sales"], createdAt: new Date() }],
            2,
        );
        expect(msg).toContain('Usulan fitur baru (1)');
        expect(msg).toContain('1. Export excel [sales]');
        expect(msg).toContain('4 peminta');
        expect(msg).toContain('2 usulan lebih lama masih menunggu review.');
        expect(msg).toContain('Review: /admin/proposals');
    });

    it('omits the older line when zero', () => {
        const msg = buildProposalsMessage([], 0);
        expect(msg).toContain('Usulan fitur baru (0)');
        expect(msg).not.toContain('menunggu review');
    });
});

describe('runProposalsDigest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.TELEGRAM_OWNER_CHAT_ID;
    });

    it('skips without owner chat configured', async () => {
        const res = await runProposalsDigest();
        expect(res).toEqual({ sent: false, reason: 'TELEGRAM_OWNER_CHAT_ID not set' });
        expect(getMainPrisma).not.toHaveBeenCalled();
    });

    it('skips when no new proposals', async () => {
        process.env.TELEGRAM_OWNER_CHAT_ID = '123';
        vi.mocked(getMainPrisma).mockReturnValue({
            featureProposal: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn() },
        } as never);
        const res = await runProposalsDigest();
        expect(res).toEqual({ sent: false, reason: 'no new proposals' });
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it('sends digest for new proposals', async () => {
        process.env.TELEGRAM_OWNER_CHAT_ID = '123';
        vi.mocked(getMainPrisma).mockReturnValue({
            featureProposal: {
                findMany: vi.fn().mockResolvedValue([{ id: 'p1', title: 'T', requesterCount: 3, impactedModules: [], createdAt: new Date() }]),
                count: vi.fn().mockResolvedValue(0),
            },
        } as never);
        vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true, messageId: 9 });
        const res = await runProposalsDigest();
        expect(res.sent).toBe(true);
        expect(res.count).toBe(1);
        expect(sendTelegramMessage).toHaveBeenCalledWith('123', expect.stringContaining('Usulan fitur baru (1)'));
    });
});
