import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    getProductionSupervisorOverview,
    getMobileSupervisorSpkList,
    getMobileQuickSpkFormData,
    getMobileTeamAttendance,
} from '../mobile-supervisor';
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
            findFirst: vi.fn(),
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
        employee: {
            findMany: vi.fn(),
        },
        attendanceRecord: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        workShift: {
            findMany: vi.fn(),
        },
        bom: {
            findMany: vi.fn(),
        },
        machine: {
            findMany: vi.fn(),
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

describe('getMobileSupervisorSpkList', () => {
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

    it('returns actionable SPK list with progress', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            {
                id: 'po-1',
                orderNumber: 'SPK-001',
                status: 'IN_PROGRESS',
                priority: 'URGENT',
                plannedQuantity: 100,
                actualQuantity: 50,
                machineId: 'm-1',
                createdAt: new Date(),
                plannedStartDate: new Date(),
                bom: { name: 'BOM A', productVariant: { name: 'Karung', skuCode: 'K001' } },
                machine: { id: 'm-1', name: 'Extruder 1', code: 'EXT-1' },
                location: { name: 'FG' },
            } as any,
        ]);

        const res = await getMobileSupervisorSpkList({ status: 'IN_PROGRESS' });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.items.length).toBe(1);
            expect(res.data.items[0].progressPercent).toBe(50);
            expect(res.data.items[0].spkNumber).toBe('SPK-001');
            expect(res.data.items[0].machineCode).toBe('EXT-1');
        }
    });

    it('handles empty list', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);
        const res = await getMobileSupervisorSpkList();
        expect(res.success).toBe(true);
        if (res.success) expect(res.data.items).toEqual([]);
    });
});

describe('getMobileQuickSpkFormData', () => {
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

    it('returns filtered boms and machines', async () => {
        vi.mocked(prisma.bom.findMany).mockResolvedValue([
            {
                id: 'bom-1',
                name: 'BOM Karung',
                category: 'EXTRUSION',
                isDefault: true,
                productVariantId: 'pv-1',
                productVariant: {
                    name: 'Karung 50kg',
                    skuCode: 'KRG-50',
                    product: { name: 'Karung' },
                },
            } as any,
        ]);
        vi.mocked(prisma.machine.findMany).mockResolvedValue([
            { id: 'm-1', name: 'Extruder 1', code: 'EXT-1', type: 'EXTRUDER', status: 'ACTIVE' } as any,
        ]);

        const res = await getMobileQuickSpkFormData();
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.boms.length).toBe(1);
            expect(res.data.machines.length).toBe(1);
            expect(res.data.boms[0].skuCode).toBe('KRG-50');
        }
    });
});

describe('getMobileTeamAttendance', () => {
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

    it('returns team attendance with late indicator', async () => {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            { id: 'e-1', name: 'Budi', code: 'EMP-1', role: 'OPERATOR' } as any,
            { id: 'e-2', name: 'Siti', code: 'EMP-2', role: 'HELPER' } as any,
        ]);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
            {
                id: 'att-1',
                employeeId: 'e-1',
                workDate: new Date(),
                status: 'PRESENT',
                clockInAt: new Date(),
                clockOutAt: null,
                actualHours: null,
                source: 'KIOSK',
                employee: { id: 'e-1', name: 'Budi', code: 'EMP-1', role: 'OPERATOR' },
                workShift: { id: 's-1', name: 'Pagi', startTime: '07:00' },
            } as any,
        ]);
        vi.mocked(prisma.workShift.findMany).mockResolvedValue([
            { id: 's-1', name: 'Pagi' } as any,
        ]);

        const res = await getMobileTeamAttendance({ date: '2026-08-06', status: 'ALL' } as any);
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.totalEmployees).toBeGreaterThanOrEqual(1);
            expect(res.data.records.some((r) => r.employeeCode === 'EMP-1')).toBe(true);
            const present = res.data.records.find((r) => r.employeeId === 'e-1');
            expect(present?.status).toBe('PRESENT');
        }
    });

    it('filters by search query and handles empty', async () => {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);
        vi.mocked(prisma.workShift.findMany).mockResolvedValue([]);

        const res = await getMobileTeamAttendance({ date: '2026-08-06', q: 'zzz', status: 'ALL' } as any);
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.records.length).toBe(0);
            expect(res.data.totalEmployees).toBe(0);
        }
    });

    it('marks NO_RECORD for employees without attendance', async () => {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            { id: 'e-1', name: 'Budi', code: 'EMP-1', role: 'OPERATOR' } as any,
        ]);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);
        vi.mocked(prisma.workShift.findMany).mockResolvedValue([]);

        const res = await getMobileTeamAttendance({ date: '2026-08-06' } as any);
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.records[0].status).toBe('NO_RECORD');
            expect(res.data.noRecordCount).toBe(1);
        }
    });
});
