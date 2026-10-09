import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        productionExecution: { findMany: vi.fn() },
        productionOrder: { findMany: vi.fn() },
        machineDowntime: { findMany: vi.fn() },
        productionIssue: { findMany: vi.fn() },
        appSetting: { findUnique: vi.fn() },
    },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({ user: { id: 'production-user' } }),
}));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));

import { getProductionLiveOverview } from '../production-live-overview';

function activeOrder() {
    return {
        id: 'spk-1',
        orderNumber: 'SPK-001',
        status: 'IN_PROGRESS',
        plannedQuantity: 100,
        plannedEndDate: null,
        actualStartDate: new Date('2026-10-09T07:00:00.000Z'),
        createdAt: new Date('2026-10-09T07:00:00.000Z'),
        bom: {
            category: 'MIXING',
            productVariant: { name: 'Synthetic product' },
        },
        machine: { code: 'M-01' },
        shifts: [
            {
                operatorId: 'operator-1',
                operator: { name: 'Synthetic operator' },
                startTime: new Date('2026-10-09T06:00:00.000Z'),
                endTime: new Date('2026-10-09T09:00:00.000Z'),
            },
        ],
        executions: [
            {
                quantityProduced: 94,
                scrapQuantity: 6,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                startTime: new Date('2026-10-09T07:00:00.000Z'),
            },
        ],
    };
}

describe('getProductionLiveOverview thresholds', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T08:00:00.000Z'));
        vi.clearAllMocks();
        mockPrisma.productionExecution.findMany.mockResolvedValue([]);
        mockPrisma.productionOrder.findMany.mockResolvedValue([]);
        mockPrisma.productionIssue.findMany.mockResolvedValue([]);
        mockPrisma.appSetting.findUnique.mockResolvedValue(null);
        mockPrisma.machineDowntime.findMany.mockResolvedValue([
            {
                machineId: 'machine-1',
                startTime: new Date('2026-10-09T07:00:00.000Z'),
                reason: 'Synthetic maintenance',
                machine: { code: 'M-01', type: 'MIXER' },
            },
        ]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses the tenant downtime threshold on every action invocation', async () => {
        mockPrisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ downtimeCriticalMinutes: 90 }),
        });

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.attentions).toEqual([
            expect.objectContaining({
                type: 'downtime',
                severity: 'amber',
                ageMinutes: 60,
                machineId: 'machine-1',
            }),
        ]);
        expect(mockPrisma.appSetting.findUnique).toHaveBeenCalledWith({
            where: { key: 'production.alertThresholds' },
            select: { value: true },
        });

        mockPrisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ downtimeCriticalMinutes: 30 }),
        });
        const refreshed = await getProductionLiveOverview();
        expect(
            refreshed.success && refreshed.data?.attentions[0]?.severity,
        ).toBe('red');
        expect(mockPrisma.appSetting.findUnique).toHaveBeenCalledTimes(2);
    });

    it('uses the custom tenant scrap threshold', async () => {
        mockPrisma.appSetting.findUnique.mockResolvedValue({
            value: JSON.stringify({ scrapAnomalyPercent: 10 }),
        });
        mockPrisma.machineDowntime.findMany.mockResolvedValue([]);
        mockPrisma.productionOrder.findMany
            .mockResolvedValueOnce([activeOrder()])
            .mockResolvedValueOnce([]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(
            result.data.attentions.some(
                (attention) => attention.type === 'high_scrap',
            ),
        ).toBe(false);
    });

    it('falls back to documented defaults for malformed settings', async () => {
        mockPrisma.appSetting.findUnique.mockResolvedValue({ value: '{malformed' });

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.attentions[0]).toMatchObject({
            type: 'downtime',
            severity: 'red',
        });
    });
});
