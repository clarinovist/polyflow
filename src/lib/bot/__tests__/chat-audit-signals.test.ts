import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsertSignalMock, createMock } = vi.hoisted(() => ({
    upsertSignalMock: vi.fn().mockResolvedValue(null),
    createMock: vi.fn().mockResolvedValue({ id: 'interaction-1' }),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({ helpInteraction: { create: createMock } }),
}));
vi.mock('@/lib/config/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/bot/metrics', () => ({ recordVirtualCsMetric: vi.fn() }));
vi.mock('../help-clustering', async (orig) => ({
    ...(await orig<typeof import('../help-clustering')>()),
    upsertCluster: vi.fn().mockResolvedValue(null),
}));
vi.mock('../feature-signals', async (orig) => ({
    ...(await orig<typeof import('../feature-signals')>()),
    upsertFeatureSignal: upsertSignalMock,
}));

import { logVirtualCsEvent } from '../chat-audit';

const base = {
    channel: 'web' as const,
    product: 'polyflow' as const,
    allowed: true,
    success: true,
    latencyMs: 10,
};

describe('logVirtualCsEvent — feature signals', () => {
    beforeEach(() => {
        upsertSignalMock.mockClear();
        delete process.env.OPENCLAW_SYSTEM_USER_ID;
    });

    it('records an explicit request even when there is no audit user id', async () => {
        await logVirtualCsEvent({
            ...base,
            question: 'Tolong tambahkan fitur laporan umur piutang',
            answer: 'Fitur itu belum tersedia saat ini, silakan hubungi admin.',
        });
        await vi.waitFor(() => expect(upsertSignalMock).toHaveBeenCalledTimes(1));
        expect(upsertSignalMock.mock.calls[0][0].signalKind).toBe('explicit_request');
    });

    it('records a partially answered question as unanswered_repeat', async () => {
        await logVirtualCsEvent({
            ...base,
            userId: 'user-1',
            tenantId: 'tenant-a',
            question: 'Bagaimana rekap borongan per minggu?',
            answer: 'Saya belum bisa memastikan, perlu klarifikasi lebih lanjut.',
            disposition: 'NEEDS_CLARIFICATION',
        });
        await vi.waitFor(() => expect(upsertSignalMock).toHaveBeenCalledTimes(1));
        expect(upsertSignalMock.mock.calls[0][0].signalKind).toBe('unanswered_repeat');
    });

    it('records nothing for a fully answered how-to question', async () => {
        await logVirtualCsEvent({
            ...base,
            userId: 'user-1',
            question: 'Bagaimana cara input sales order?',
            answer: 'Buka menu Sales lalu pilih Sales Order dan klik Buat Baru.',
        });
        expect(upsertSignalMock).not.toHaveBeenCalled();
    });
});
