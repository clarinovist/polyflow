import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        productionExecution: { findMany: vi.fn() },
        productionOrder: { findMany: vi.fn() },
        machineDowntime: { findMany: vi.fn() },
        productionIssue: { findMany: vi.fn() },
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

describe('getProductionLiveOverview R0 characterization', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T08:00:00.000Z'));
        vi.clearAllMocks();
        mockPrisma.productionExecution.findMany.mockResolvedValue([]);
        mockPrisma.productionOrder.findMany.mockResolvedValue([]);
        mockPrisma.productionIssue.findMany.mockResolvedValue([]);
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

    it('characterizes legacy C4: downtime severity is hard-coded with no threshold input', async () => {
        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(getProductionLiveOverview).toHaveLength(0);
        expect(result.data.attentions).toEqual([
            expect.objectContaining({
                type: 'downtime',
                severity: 'red',
                ageMinutes: 60,
                machineId: 'machine-1',
            }),
        ]);
        // R0 baseline only: a tenant threshold such as 90 minutes cannot be
        // supplied to this action. R1C must read the tenant setting on every
        // action invocation, including SWR refreshes, before classification.
    });

    it('characterizes legacy C4: scrap anomaly severity is hard-coded at five percent', async () => {
        mockPrisma.machineDowntime.findMany.mockResolvedValue([]);
        mockPrisma.productionOrder.findMany
            .mockResolvedValueOnce([
                {
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
                },
            ])
            .mockResolvedValueOnce([]);

        const result = await getProductionLiveOverview();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.attentions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'high_scrap',
                    severity: 'red',
                    orderId: 'spk-1',
                }),
            ]),
        );
    });
});
