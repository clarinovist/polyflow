import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression guard untuk bug yang ditemukan 2026-08-20:
 * `logVirtualCsEvent` menerima `citedSlugs` / `conversationId` / `confidence`
 * tetapi membuangnya diam-diam saat menulis `HelpInteraction` — padahal ketiga
 * kolom itu ADA di schema. Akibatnya analitik "artikel mana yang menolong"
 * mustahil dihitung dan interaksi tidak bisa dihubungkan ke percakapan.
 *
 * Test ini memeriksa payload `helpInteraction.create` secara langsung, bukan
 * sekadar bahwa fungsi tidak melempar error.
 */

const createMock = vi.fn().mockResolvedValue({ id: 'interaction-1' });

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        helpInteraction: { create: createMock },
    }),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/bot/metrics', () => ({
    recordVirtualCsMetric: vi.fn(),
}));

import { logVirtualCsEvent } from '../chat-audit';

describe('logVirtualCsEvent — persistensi field', () => {
    beforeEach(() => {
        createMock.mockClear();
        createMock.mockResolvedValue({ id: 'interaction-1' });
    });

    const base = {
        channel: 'web' as const,
        product: 'polyflow' as const,
        question: 'kenapa SO belum bisa dikirim',
        answer: 'Berdasarkan pengecekan, stok masih tertahan reservasi SO lain.',
        allowed: true,
        success: true,
        latencyMs: 1234,
    };

    it('menyimpan citedSlugs, conversationId, dan confidence', async () => {
        await logVirtualCsEvent({
            ...base,
            citedSlugs: ['cara-buat-so', 'stok-reservasi'],
            conversationId: 'conv-42',
            confidence: 0.82,
        });

        expect(createMock).toHaveBeenCalledTimes(1);
        const data = createMock.mock.calls[0][0].data;

        expect(data.citedSlugs).toEqual(['cara-buat-so', 'stok-reservasi']);
        expect(data.conversationId).toBe('conv-42');
        expect(data.confidence).toBe(0.82);
    });

    it('memakai default aman saat field opsional tidak dikirim', async () => {
        await logVirtualCsEvent(base);

        const data = createMock.mock.calls[0][0].data;
        // citedSlugs adalah kolom array non-null di Prisma — harus [] bukan undefined.
        expect(data.citedSlugs).toEqual([]);
        expect(data.conversationId).toBeNull();
        expect(data.confidence).toBeNull();
    });

    it('mengembalikan id interaksi untuk dipakai tombol feedback', async () => {
        const id = await logVirtualCsEvent(base);
        expect(id).toBe('interaction-1');
    });

    it('tidak melempar error saat penulisan DB gagal', async () => {
        createMock.mockRejectedValueOnce(new Error('db down'));
        await expect(logVirtualCsEvent(base)).resolves.toBeNull();
    });
});
