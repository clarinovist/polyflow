import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getProductionSupervisorOverview } from '../mobile-supervisor';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        productionOrder: {
            findMany: vi.fn(),
        },
        productionExecution: {
            aggregate: vi.fn(),
        },
        machineDowntime: {
            findMany: vi.fn(),
        },
        qualityInspection: {
            count: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

const { startOfDay, endOfDay } = getWibDayBounds(
    toBusinessDateString(new Date()),
);

function emptyExecAggregate() {
    return {
        _sum: { quantityProduced: 0, scrapQuantity: 0 },
        _avg: {},
        _count: {},
        _min: {},
        _max: {},
    };
}

describe('getProductionSupervisorOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'PRODUCTION',
            isActive: true,
        } as any);
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);
    });

    it('returns empty overview when user is authenticated and DB is empty', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.activeOrdersCount).toBe(0);
            expect(result.data.highlights.targetToday).toBe(0);
            expect(result.data.highlights.targetUnitMode).toBe('NONE');
            expect(result.data.recentOrders).toEqual([]);
            expect(result.data.downtimeAlerts).toEqual([]);
        }
    });

    it('returns overview with production orders and downtimes', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([
                {
                    id: 'po-1',
                    orderNumber: 'SPK-001',
                    status: 'IN_PROGRESS',
                    plannedQuantity: 100,
                    actualQuantity: 50,
                    updatedAt: new Date(),
                    bom: { name: 'Karung 50kg' },
                } as any,
            ])
            .mockResolvedValueOnce([
                {
                    plannedQuantity: 100,
                    bom: {
                        productVariant: { primaryUnit: 'PCS' },
                    },
                } as any,
            ]);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue({
            _sum: { quantityProduced: 250, scrapQuantity: 5 },
            _avg: {},
            _count: {},
            _min: {},
            _max: {},
        } as any);
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([
            {
                id: 'dt-1',
                reason: 'Mati Listrik',
                durationMinutes: 15,
                startTime: new Date(),
                createdAt: new Date(),
                machine: { name: 'Extruder 1' },
            } as any,
        ]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(2);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.activeOrdersCount).toBe(1);
            expect(result.data.highlights.outputToday).toBe(250);
            expect(result.data.highlights.scrapToday).toBe(5);
            expect(result.data.highlights.downtimeMinutesToday).toBe(15);
            expect(result.data.highlights.qcPendingCount).toBe(2);
            expect(result.data.highlights.targetToday).toBe(100);
            expect(result.data.highlights.targetUnitMode).toBe('SINGLE');
            expect(result.data.highlights.targetUnit).toBe('PCS');
            expect(result.data.recentOrders[0].spkNumber).toBe('SPK-001');
            expect(result.data.downtimeAlerts[0].machineName).toBe('Extruder 1');
        }
    });

    it('derives daily target from all planned SPKs, not only the recent 10', async () => {
        const recentTen = Array.from({ length: 10 }, (_, i) => ({
            id: `po-${i}`,
            orderNumber: `SPK-${i}`,
            status: 'IN_PROGRESS',
            plannedQuantity: 100,
            actualQuantity: 0,
            updatedAt: new Date(),
            bom: { name: 'BOM' },
        }));
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce(recentTen as any)
            .mockResolvedValueOnce([
                { plannedQuantity: 300, bom: { productVariant: { primaryUnit: 'PCS' } } },
                { plannedQuantity: 200, bom: { productVariant: { primaryUnit: 'PCS' } } },
            ] as any);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            // 10 * 100 = 1000 would be the fake; real target = 300 + 200
            expect(result.data.highlights.targetToday).toBe(500);
        }
    });

    it('queries target bounds for the current WIB day and excludes cancelled SPKs', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        await getProductionSupervisorOverview();
        const targetCall = vi.mocked(prisma.productionOrder.findMany).mock
            .calls[1];
        const targetArgs = targetCall?.[0] as unknown as {
            where: {
                status: { not: string };
                plannedStartDate: { gte: Date; lte: Date };
            };
            take?: number;
        };
        expect(targetArgs.where.plannedStartDate).toEqual({
            gte: startOfDay,
            lte: endOfDay,
        });
        expect(targetArgs.where.status.not).toBe('CANCELLED');
        expect(targetArgs.take).toBeUndefined();
    });

    it('returns target 0 with no planned orders, never a fake 1000', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.targetToday).toBe(0);
            expect(result.data.highlights.targetUnitMode).toBe('NONE');
        }
    });

    it('marks target unavailable on target query DB error', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('DB Error'));
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.targetToday).toBeNull();
            expect(result.data.highlights.targetUnitMode).toBe('NONE');
        }
    });

    it('sets MIXED unit mode when planned SPKs use different output units', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { plannedQuantity: 100, bom: { productVariant: { primaryUnit: 'KG' } } },
                { plannedQuantity: 50, bom: { productVariant: { primaryUnit: 'PCS' } } },
            ] as any);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue(
            emptyExecAggregate() as any,
        );
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.targetToday).toBe(150);
            expect(result.data.highlights.targetUnitMode).toBe('MIXED');
            expect(result.data.highlights.targetUnit).toBeNull();
        }
    });

    it('handles DB errors gracefully and returns default values', async () => {
        vi.mocked(prisma.productionOrder.findMany)
            .mockRejectedValue(new Error('DB Error'))
            .mockRejectedValueOnce(new Error('DB Error'));
        vi.mocked(prisma.productionExecution.aggregate).mockRejectedValue(
            new Error('DB Error'),
        );
        vi.mocked(prisma.machineDowntime.findMany).mockRejectedValue(
            new Error('DB Error'),
        );
        vi.mocked(prisma.qualityInspection.count).mockRejectedValue(
            new Error('DB Error'),
        );

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.activeOrdersCount).toBe(0);
            expect(result.data.highlights.outputToday).toBe(0);
            expect(result.data.highlights.targetToday).toBeNull();
        }
    });
});
