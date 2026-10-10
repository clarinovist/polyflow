vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: vi.fn().mockResolvedValue({ permissions: 'ALL' }),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getProductionSupervisorOverview,
    getFactoryManagerExecutiveOverview,
    getMobileSupervisorSpkList,
    getMobileQuickSpkFormData,
    getMobileTeamAttendance,
} from '../mobile-supervisor';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => {
    const prisma = {
        user: {
            findUnique: vi.fn(),
        },
        productionOrder: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        productionExecution: {
            findMany: vi.fn(),
        },
        machineDowntime: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        qualityInspection: {
            count: vi.fn(),
        },
        employee: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        attendanceRecord: {
            findMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
            aggregate: vi.fn(),
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
        productVariant: {
            findMany: vi.fn(),
        },
        appSetting: {
            findUnique: vi.fn(),
        },
        payrollPeriod: {
            count: vi.fn(),
            findFirst: vi.fn(),
        },
        payslip: {
            groupBy: vi.fn(),
        },
        leaveRequest: {
            count: vi.fn(),
        },
        notification: {
            count: vi.fn(),
        },
        purchaseOrder: {
            count: vi.fn(),
        },
    };
    return {
        prisma,
        getTenantDbFromContext: () => prisma,
    };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

describe('production mobile canonical overview and tasks', () => {
    const access = vi.mocked(requireMobilePortalAccess);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T08:00:00.000Z'));
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);
        access.mockResolvedValue({ permissions: 'ALL' } as never);
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);
        vi.mocked(prisma.productionOrder.count).mockResolvedValue(0);
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.machineDowntime.count).mockResolvedValue(0);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
    });

    afterEach(() => vi.useRealTimers());

    it('keeps output process+unit groups, WIB/non-VOIDED cohort, and independent zero sections', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            {
                quantityProduced: 7,
                productionOrder: {
                    id: 'spk-kg',
                    bom: {
                        category: 'MIXING',
                        productVariant: {
                            id: 'v-kg', name: 'KG product', skuCode: 'KG', primaryUnit: 'KG',
                        },
                    },
                },
            },
            {
                quantityProduced: 4,
                productionOrder: {
                    id: 'spk-pcs',
                    bom: {
                        category: 'PACKING',
                        productVariant: {
                            id: 'v-pcs', name: 'PCS product', skuCode: 'PCS', primaryUnit: 'PCS',
                        },
                    },
                },
            },
        ] as any);

        const result = await getProductionSupervisorOverview();

        expect(result).toMatchObject({
            success: true,
            data: {
                audience: 'OPERATIONAL',
                health: {
                    outputToday: {
                        status: 'AVAILABLE',
                        data: {
                            processTotals: [
                                { processKey: 'MIXING', unit: 'KG', quantity: 7 },
                                { processKey: 'PACKING', unit: 'PCS', quantity: 4 },
                            ],
                        },
                    },
                    activeSpk: { status: 'AVAILABLE', data: { count: 0 } },
                    qcPending: { status: 'AVAILABLE', data: { count: 0 } },
                    targetAttainment: { status: 'NOT_CONFIGURED', data: null },
                    scrapSeverity: { status: 'NOT_CONFIGURED', data: null },
                },
            },
        });
        expect(prisma.productionExecution.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: { not: 'VOIDED' },
                    startTime: {
                        gte: new Date('2026-10-08T17:00:00.000Z'),
                        lte: new Date('2026-10-09T16:59:59.999Z'),
                    },
                },
            }),
        );
    });

    it('keeps no-output and one comparable unit as AVAILABLE without inventing a scalar unit', async () => {
        const empty = await getProductionSupervisorOverview();
        expect(empty).toMatchObject({
            success: true,
            data: {
                health: {
                    outputToday: {
                        status: 'AVAILABLE',
                        data: { processTotals: [], totalGroups: 0 },
                    },
                },
            },
        });

        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
            {
                quantityProduced: 12,
                productionOrder: {
                    id: 'spk-kg',
                    bom: {
                        category: 'MIXING',
                        productVariant: {
                            id: 'v-kg',
                            name: 'KG product',
                            skuCode: 'KG',
                            primaryUnit: 'KG',
                        },
                    },
                },
            },
        ] as any);
        const single = await getProductionSupervisorOverview();
        expect(single).toMatchObject({
            success: true,
            data: {
                health: {
                    outputToday: {
                        status: 'AVAILABLE',
                        data: {
                            processTotals: [
                                {
                                    processKey: 'MIXING',
                                    unit: 'KG',
                                    quantity: 12,
                                },
                            ],
                        },
                    },
                },
            },
        });
    });

    it('uses parser default only after successful absent/malformed reads, custom threshold, and longest open incident', async () => {
        vi.mocked(prisma.machineDowntime.count).mockResolvedValue(2);
        vi.mocked(prisma.machineDowntime.findMany)
            .mockResolvedValueOnce([
                {
                    id: 'short', machineId: 'm1', startTime: new Date('2026-10-09T07:45:00Z'), reason: 'Short', machine: { code: 'M1', type: 'MIXER' },
                },
                {
                    id: 'long', machineId: 'm2', startTime: new Date('2026-10-09T06:00:00Z'), reason: 'Long', machine: { code: 'M2', type: 'EXTRUDER' },
                },
            ] as any)
            .mockResolvedValueOnce([]);
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
            value: JSON.stringify({ downtimeCriticalMinutes: 180 }),
        } as any);

        const custom = await getProductionSupervisorOverview();
        expect(custom).toMatchObject({
            success: true,
            data: {
                health: {
                    downtime: {
                        status: 'AVAILABLE',
                        data: {
                            thresholdMinutes: 180,
                            longest: { incidentId: 'long', minutes: 120, severity: 'amber' },
                        },
                    },
                },
            },
        });

        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({ value: '{bad' } as any);
        const malformed = await getProductionSupervisorOverview();
        expect(malformed).toMatchObject({
            success: true,
            data: { health: { downtime: { status: 'AVAILABLE', data: { thresholdMinutes: 30 } } } },
        });
    });

    it('marks only failed readers unavailable and never applies a default after threshold read failure', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockRejectedValue(new Error('output'));
        vi.mocked(prisma.appSetting.findUnique).mockRejectedValue(new Error('setting'));

        const result = await getProductionSupervisorOverview();

        expect(result).toMatchObject({
            success: true,
            data: {
                health: {
                    outputToday: { status: 'UNAVAILABLE', data: null },
                    activeSpk: { status: 'AVAILABLE', data: { count: 0 } },
                    qcPending: { status: 'AVAILABLE', data: { count: 0 } },
                    downtime: { status: 'UNAVAILABLE', data: null },
                },
            },
        });
    });

    it('projects links only from resolved portal resources, including no unsafe Kiosk href', async () => {
        access.mockResolvedValue({
            permissions: ['/production/mobile/maintenance'],
        } as never);
        const overview = await getProductionSupervisorOverview();
        expect(overview).toMatchObject({
            success: true,
            data: {
                links: {
                    maintenance: '/production/mobile/maintenance',
                    attendance: null,
                    quickSpk: null,
                },
            },
        });

        vi.mocked(prisma.productionOrder.count)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0);
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([
                taskOrder('informational', 'URGENT', '2026-10-10T00:00:00Z'),
            ] as any)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        const list = await getMobileSupervisorSpkList();
        expect(list).toMatchObject({
            success: true,
            data: {
                total: 1,
                returned: 1,
                limit: 50,
                createHref: null,
                items: [{ id: 'informational', href: null }],
            },
        });
    });

    it('returns full task total, deterministic priority buckets and stable ties', async () => {
        vi.mocked(prisma.productionOrder.count)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(0);
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce([
                taskOrder('urgent-a', 'URGENT', '2026-10-10T00:00:00Z'),
                taskOrder('urgent-b', 'URGENT', '2026-10-10T00:00:00Z'),
            ] as any)
            .mockResolvedValueOnce([
                taskOrder('normal', 'NORMAL', '2026-10-09T00:00:00Z'),
            ] as any)
            .mockResolvedValueOnce([]);

        const result = await getMobileSupervisorSpkList();

        expect(result).toMatchObject({
            success: true,
            data: {
                generatedAt: '2026-10-09T08:00:00.000Z',
                total: 3,
                returned: 3,
                limit: 50,
                createHref: '/production/mobile/tasks/new',
                items: [
                    { id: 'urgent-a', priority: 'URGENT', href: '/kiosk/jobs/urgent-a' },
                    { id: 'urgent-b', priority: 'URGENT', href: '/kiosk/jobs/urgent-b' },
                    { id: 'normal', priority: 'NORMAL', href: '/kiosk/jobs/normal' },
                ],
            },
        });
        for (const call of vi.mocked(prisma.productionOrder.findMany).mock.calls) {
            expect(call[0]).toMatchObject({
                take: 50,
                orderBy: [{ plannedStartDate: 'asc' }, { id: 'asc' }],
            });
        }
    });

    it('chooses the bounded global sample only after each priority bucket is complete for the limit', async () => {
        vi.mocked(prisma.productionOrder.count)
            .mockResolvedValueOnce(51)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1);
        vi.mocked(prisma.productionOrder.findMany)
            .mockResolvedValueOnce(
                Array.from({ length: 50 }, (_, index) =>
                    taskOrder(
                        `urgent-${String(index).padStart(2, '0')}`,
                        'URGENT',
                        '2026-10-10T00:00:00Z',
                    ),
                ) as any,
            )
            .mockResolvedValueOnce([
                taskOrder('normal', 'NORMAL', '2026-10-01T00:00:00Z'),
            ] as any)
            .mockResolvedValueOnce([
                taskOrder('low', 'LOW', '2026-09-01T00:00:00Z'),
            ] as any);

        const result = await getMobileSupervisorSpkList();

        expect(result).toMatchObject({
            success: true,
            data: { total: 53, returned: 50, limit: 50 },
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data.items.every((item) => item.priority === 'URGENT')).toBe(
            true,
        );
        expect(result.data.items.some((item) => item.id === 'normal')).toBe(
            false,
        );
    });
});

function taskOrder(id: string, priority: string, plannedStartDate: string) {
    return {
        id,
        orderNumber: id,
        status: 'IN_PROGRESS',
        priority,
        plannedQuantity: 10,
        actualQuantity: 5,
        machineId: null,
        plannedStartDate: new Date(plannedStartDate),
        createdAt: new Date(plannedStartDate),
        bom: { name: 'BOM', productVariant: { name: 'Product', skuCode: 'SKU' } },
        machine: null,
        location: null,
    };
}

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


describe('supervisor monitoring read access', () => {
    const access = vi.mocked(requireMobilePortalAccess);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);
        vi.mocked(prisma.productionOrder.count).mockResolvedValue(0);
        vi.mocked(prisma.machineDowntime.findMany).mockResolvedValue([]);
        vi.mocked(prisma.machineDowntime.count).mockResolvedValue(0);
        vi.mocked(prisma.qualityInspection.count).mockResolvedValue(0);
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
        access.mockResolvedValue({ permissions: 'ALL' } as never);
    });

    it.each(['FACTORY_MANAGER', 'PRODUCTION', 'PLANNING', 'ADMIN'])(
        'allows %s after the portal guard succeeds',
        async (role) => {
            vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role } } as any);
            expect(await getProductionSupervisorOverview()).toMatchObject({ success: true });
        },
    );

    it('denies an unrelated role before portal/data reads', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'SALES' } } as any);
        expect(await getProductionSupervisorOverview()).toMatchObject({ success: false });
        expect(access).not.toHaveBeenCalled();
        expect(prisma.productionExecution.findMany).not.toHaveBeenCalled();
    });

    it('runs the Production Supervisor portal guard before every overview business read', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PRODUCTION' },
        } as any);
        access.mockRejectedValue(new Error('revoked portal'));

        expect(await getProductionSupervisorOverview()).toMatchObject({
            success: false,
        });
        expect(prisma.productionExecution.findMany).not.toHaveBeenCalled();
        expect(prisma.productionOrder.count).not.toHaveBeenCalled();
        expect(prisma.machineDowntime.findMany).not.toHaveBeenCalled();
        expect(prisma.qualityInspection.count).not.toHaveBeenCalled();
    });
});

describe('factory manager canonical owner overview', () => {
    const access = vi.mocked(requireMobilePortalAccess);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'FACTORY_MANAGER' } } as any);
        access.mockResolvedValue({
            permissions: [
                '/production/daily',
                '/warehouse/inventory',
                '/purchasing/requests',
                '/purchasing/orders',
            ],
        } as never);
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([]);
        vi.mocked(prisma.purchaseOrder.count).mockResolvedValue(0);
        vi.mocked(prisma.employee.count).mockResolvedValue(0);
        vi.mocked(prisma.attendanceRecord.groupBy).mockResolvedValue([]);
        vi.mocked(prisma.attendanceRecord.aggregate).mockResolvedValue({ _sum: { overtimeHours: 0 } } as any);
        vi.mocked(prisma.payrollPeriod.count).mockResolvedValue(0);
        vi.mocked(prisma.payrollPeriod.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0);
        vi.mocked(prisma.notification.count).mockResolvedValue(0);
    });

    it('returns aggregate stock/purchasing/workforce states without NO_RECORD or identity payload', async () => {
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([
            {
                id: 'v1', name: 'Variant', skuCode: 'V1', primaryUnit: 'KG',
                minStockAlert: 10, reorderPoint: 8,
                inventories: [{ quantity: 2, location: { locationType: 'INTERNAL', locationPurpose: 'RAW_MATERIAL' } }],
            },
        ] as any);
        vi.mocked(prisma.purchaseOrder.count).mockResolvedValue(3);
        vi.mocked(prisma.employee.count).mockResolvedValue(12);
        vi.mocked(prisma.attendanceRecord.groupBy)
            .mockResolvedValueOnce([
                { status: 'PRESENT', employeeId: 'e1' },
                { status: 'ABSENT', employeeId: 'e2' },
                { status: 'ON_LEAVE', employeeId: 'e3' },
            ] as any)
            .mockResolvedValueOnce([]);

        const result = await getFactoryManagerExecutiveOverview();

        expect(result).toMatchObject({
            success: true,
            data: {
                stock: { status: 'AVAILABLE', data: { lowStockCount: 1, suggestedReorderCount: 1 } },
                purchasing: { status: 'AVAILABLE', data: { waitingReceiptCount: 3 } },
                workforce: {
                    status: 'AVAILABLE',
                    data: { activeCount: 12, presentCount: 1, absentCount: 1, onLeaveCount: 1 },
                },
            },
        });
        expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.purchaseOrder.count).toHaveBeenCalledWith({
            where: { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } },
        });
        const json = JSON.stringify(result).toLowerCase();
        expect(json).not.toMatch(/norecord|employeeid|employeename|salary|payroll|loan|amount|cost|price/);
    });

    it('keeps owner failures independent and denies missing executive resources before owner reads', async () => {
        vi.mocked(prisma.productVariant.findMany).mockRejectedValue(new Error('inventory'));
        vi.mocked(prisma.purchaseOrder.count).mockRejectedValue(new Error('purchasing'));
        const partial = await getFactoryManagerExecutiveOverview();
        expect(partial).toMatchObject({
            success: true,
            data: {
                stock: { status: 'UNAVAILABLE', data: null },
                purchasing: { status: 'UNAVAILABLE', data: null },
                workforce: { status: 'AVAILABLE' },
            },
        });

        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'FACTORY_MANAGER' } } as any);
        access.mockResolvedValue({ permissions: ['/production/daily'] } as never);
        expect(await getFactoryManagerExecutiveOverview()).toMatchObject({ success: false });
        expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
        expect(prisma.purchaseOrder.count).not.toHaveBeenCalled();
    });
});

describe('quick SPK form mutation guard', () => {
    function session(role: string, roles?: string[]) {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role, roles },
        } as any);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            isActive: true,
        } as any);
        vi.mocked(prisma.bom.findMany).mockResolvedValue([]);
        vi.mocked(prisma.machine.findMany).mockResolvedValue([]);
    });

    it('rejects FACTORY_MANAGER even with read access', async () => {
        session('FACTORY_MANAGER');
        expect(await getMobileQuickSpkFormData()).toMatchObject({
            success: false,
        });
        expect(prisma.bom.findMany).not.toHaveBeenCalled();
    });

    it('rejects FACTORY_MANAGER with a secondary PRODUCTION role', async () => {
        session('FACTORY_MANAGER', ['FACTORY_MANAGER', 'PRODUCTION']);
        expect(await getMobileQuickSpkFormData()).toMatchObject({
            success: false,
        });
        expect(prisma.bom.findMany).not.toHaveBeenCalled();
    });

    it.each(['PRODUCTION', 'PLANNING', 'ADMIN'])(
        'allows %s to load the quick SPK form',
        async (role) => {
            session(role);
            expect(await getMobileQuickSpkFormData()).toMatchObject({
                success: true,
            });
        },
    );
});
