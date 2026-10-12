import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantUserContext } from '../assistant-types';

const transaction = vi.fn();
const executeRaw = vi.fn();
const diagnose = vi.fn();
const briefing = vi.fn();
const dailyOutput = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    tenantContext: {
        getStore: () => ({ $transaction: transaction }),
    },
    tenantIdContext: { getStore: () => 'tenant-1' },
}));

vi.mock('@/services/production/assistant-production-query-service', () => ({
    diagnoseProductionOrder: (...args: unknown[]) => diagnose(...args),
    getProductionBriefing: (...args: unknown[]) => briefing(...args),
    getProductionOutputForBusinessDate: (...args: unknown[]) =>
        dailyOutput(...args),
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
        dailyOutput.mockResolvedValue({
            date: '2026-10-12',
            entries: 0,
            orders: 0,
            groups: [],
            totals: [],
        });
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

    it('uses yesterday WIB by default and requires output-report permission', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-13T00:30:00.000Z'));
        try {
            const tool = productionTools.find(
                (candidate) =>
                    candidate.name === 'get_daily_production_output',
            )!;
            await expect(
                tool.execute(
                    {},
                    {
                        ...ctx,
                        allowedResources: ['/production/output-report'],
                    },
                ),
            ).resolves.toMatchObject({
                summary: expect.stringContaining('12 Oktober 2026'),
            });
            expect(dailyOutput).toHaveBeenCalledWith(
                expect.objectContaining({ $executeRaw: executeRaw }),
                '2026-10-12',
            );
            await expect(
                tool.execute(
                    { date: '2026-10-11' },
                    { ...ctx, allowedResources: ['/production/orders'] },
                ),
            ).rejects.toThrow(/akses produksi/i);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps mixed process and unit totals separate in daily evidence', async () => {
        dailyOutput.mockResolvedValueOnce({
            date: '2026-10-12',
            entries: 3,
            orders: 2,
            groups: [
                {
                    process: 'EXTRUSION',
                    productVariantId: 'variant-kg',
                    productName: 'Sedotan',
                    variantName: 'Bening',
                    sku: 'SED-1',
                    unit: 'KG',
                    produced: '4',
                    entries: 2,
                    orders: 1,
                },
                {
                    process: 'PACKING',
                    productVariantId: 'variant-bal',
                    productName: 'Rafia',
                    variantName: 'Gulungan',
                    sku: 'RAF-1',
                    unit: 'BAL',
                    produced: '3',
                    entries: 1,
                    orders: 1,
                },
            ],
            totals: [
                { process: 'EXTRUSION', unit: 'KG', produced: '4' },
                { process: 'PACKING', unit: 'BAL', produced: '3' },
            ],
        });
        const tool = productionTools.find(
            (candidate) => candidate.name === 'get_daily_production_output',
        )!;
        const evidence = await tool.execute(
            { date: '2026-10-12' },
            { ...ctx, allowedResources: ['/production/output-report'] },
        );

        expect(evidence.facts).toEqual(
            expect.arrayContaining([
                { label: 'Extrusion — KG', value: '4' },
                { label: 'Packing — BAL', value: '3' },
            ]),
        );
        expect(evidence.summary).not.toContain('7');
        expect(JSON.stringify(evidence)).toContain('tidak dijumlahkan');
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
