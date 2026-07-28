import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getProductionSupervisorOverview } from '../mobile-supervisor';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

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

describe('getProductionSupervisorOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'PRODUCTION',
            isActive: true,
        } as any);
    });

    it('returns empty overview when user is authenticated and DB is empty', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);

        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);
        vi.mocked(prisma.productionExecution.aggregate).mockResolvedValue({
            _sum: { quantityProduced: 0, scrapQuantity: 0 },
            _avg: {},
            _count: {},
            _min: {},
            _max: {},
        } as any);
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.activeOrdersCount).toBe(0);
            expect(result.data.recentOrders).toEqual([]);
            expect(result.data.downtimeAlerts).toEqual([]);
        }
    });

    it('returns overview with production orders and downtimes', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);

        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            {
                id: 'po-1',
                orderNumber: 'SPK-001',
                status: 'IN_PROGRESS',
                plannedQuantity: 100,
                actualQuantity: 50,
                updatedAt: new Date(),
                bom: { name: 'Karung 50kg' },
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
            expect(result.data.recentOrders[0].spkNumber).toBe('SPK-001');
            expect(result.data.downtimeAlerts[0].machineName).toBe('Extruder 1');
        }
    });

    it('handles DB errors gracefully and returns default values', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'PRODUCTION',
            isActive: true,
        } as any);

        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);

        vi.mocked(prisma.productionOrder.findMany).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.productionExecution.aggregate).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.machineDowntime.findMany).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.qualityInspection.count).mockRejectedValue(new Error('DB Error'));

        const result = await getProductionSupervisorOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.activeOrdersCount).toBe(0);
            expect(result.data.highlights.outputToday).toBe(0);
        }
    });
});
