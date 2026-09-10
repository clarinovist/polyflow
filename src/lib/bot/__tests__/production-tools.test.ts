import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantUserContext } from '../assistant-types';

const transaction = vi.fn();
const executeRaw = vi.fn();
const diagnose = vi.fn();
const briefing = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    tenantContext: {
        getStore: () => ({ $transaction: transaction }),
    },
    tenantIdContext: { getStore: () => 'tenant-1' },
}));

vi.mock('@/services/production/assistant-production-query-service', () => ({
    diagnoseProductionOrder: (...args: unknown[]) => diagnose(...args),
    getProductionBriefing: (...args: unknown[]) => briefing(...args),
}));

import { productionTools } from '../production-tools';

const ctx: AssistantUserContext = {
    userId: 'production-user',
    roles: ['PRODUCTION'],
    allowedResources: ['/production/orders', '/warehouse/inventory'],
    tenantId: 'tenant-1',
    channel: 'web',
    locale: 'id-ID',
};

describe('production tools read-only boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        transaction.mockImplementation(
            async (callback: (tx: { $executeRaw: typeof executeRaw }) => unknown) =>
                callback({ $executeRaw: executeRaw }),
        );
        diagnose.mockResolvedValue({ kind: 'missing', candidates: [] });
        briefing.mockResolvedValue({ items: [], total: 0, truncated: false });
    });

    it('executes diagnosis in a repeatable-read, read-only transaction', async () => {
        const tool = productionTools.find(
            (candidate) => candidate.name === 'diagnose_production_blocker',
        )!;
        const evidence = await tool.execute({ searchTerm: 'SPK-001' }, ctx);

        expect(executeRaw).toHaveBeenCalledTimes(1);
        expect(diagnose).toHaveBeenCalledWith(
            expect.objectContaining({ $executeRaw: executeRaw }),
            'SPK-001',
        );
        expect(transaction.mock.calls[0][1]).toMatchObject({
            isolationLevel: 'RepeatableRead',
            timeout: 12_000,
        });
        expect(evidence.summary).toBe('SPK tidak ditemukan.');
    });

    it('rejects missing permission before opening a transaction', async () => {
        const tool = productionTools[0];
        await expect(
            tool.execute(
                { searchTerm: 'SPK-001' },
                { ...ctx, allowedResources: ['/production/orders'] },
            ),
        ).rejects.toThrow(/akses produksi/i);
        expect(transaction).not.toHaveBeenCalled();
    });

    it('sanitizes transaction failures before returning them to the model', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        transaction.mockRejectedValueOnce(
            new Error('postgres://private-host/internal-query'),
        );
        try {
            await expect(
                productionTools[0].execute({ searchTerm: 'SPK-001' }, ctx),
            ).rejects.toThrow('Pemeriksaan produksi gagal');
            expect(log).toHaveBeenCalledWith(
                '[production-tool] read-only query failed',
                { tool: 'diagnose_production_blocker', errorType: 'UNEXPECTED' },
            );
        } finally {
            log.mockRestore();
        }
    });

    it('exposes priority briefing without warehouse access', async () => {
        const tool = productionTools.find(
            (candidate) =>
                candidate.name === 'get_production_priority_briefing',
        )!;
        const evidence = await tool.execute(
            {},
            { ...ctx, allowedResources: ['/production/orders'] },
        );

        expect(briefing).toHaveBeenCalledTimes(1);
        expect(evidence.summary).toContain('Briefing produksi');
    });
});
