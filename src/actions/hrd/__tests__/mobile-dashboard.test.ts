const rootPolicy = vi.hoisted(() => ({
    permissions: vi.fn(),
    workspace: vi.fn(),
    resource: vi.fn(),
}));

vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: rootPolicy.permissions,
}));
vi.mock('@/lib/auth/access-policy', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/auth/access-policy')>()),
    canAccessWorkspace: rootPolicy.workspace,
    hasWorkspaceResourceAccess: rootPolicy.resource,
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getHrdMobileHealth,
    getHrdMobileOverview,
    getHrdMobileTeamAttendance,
} from '../mobile-dashboard';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import {
    readHrdDashboardHealth,
    readHrdDashboardMobileAggregate,
} from '@/services/hrd/hrd-dashboard-service';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        attendanceRecord: { findMany: vi.fn() },
        employee: { findMany: vi.fn() },
        workShift: { findMany: vi.fn() },
        appSetting: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
    getTenantContext: () => ({ tenantId: 'test' }),
}));
vi.mock('@/services/hrd/hrd-dashboard-service', () => ({
    readHrdDashboardMobileAggregate: vi.fn(),
    readHrdDashboardHealth: vi.fn(),
}));

const aggregateFixture = {
    generatedAt: '2026-09-22T18:00:00.000Z',
    workDate: '2026-09-23',
    yesterdayWorkDate: '2026-09-22',
    health: {
        activeHeadcount: { status: 'AVAILABLE', data: { count: 10 } },
        attendanceToday: {
            status: 'AVAILABLE',
            data: { present: 2, absent: 1, onLeave: 0, overtimeHours: 1.5 },
        },
        payrollReadiness: { status: 'NOT_CONFIGURED', data: null },
        employmentFollowUp: {
            status: 'AVAILABLE',
            data: { probation: 1, contract: 2, total: 3, horizonDays: 30 },
        },
    },
    attention: {
        pendingLeave: { status: 'AVAILABLE', data: { count: 4 } },
        payroll: {
            status: 'AVAILABLE',
            data: { openPeriods: 0, periodsNeedGenerate: 0 },
        },
        bpjs: { status: 'AVAILABLE', data: { activeParticipants: 0 } },
        hrAlerts: {
            status: 'AVAILABLE',
            data: { unreadRecipientNotifications: 0 },
        },
        recordedAbsenceYesterday: {
            status: 'AVAILABLE',
            data: { count: 0 },
        },
    },
    drivers: { status: 'NOT_CONFIGURED', data: null },
};

const healthFixture = {
    generatedAt: aggregateFixture.generatedAt,
    workDate: aggregateFixture.workDate,
    yesterdayWorkDate: aggregateFixture.yesterdayWorkDate,
    health: aggregateFixture.health,
    drivers: aggregateFixture.drivers,
};

function session(role: string, roles?: string[]) {
    vi.mocked(auth).mockResolvedValue({
        user: { id: 'u1', role, roles },
    } as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T18:00:00Z'));
    session('HRD');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appSetting.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workShift.findMany).mockResolvedValue([]);
    vi.mocked(readHrdDashboardMobileAggregate).mockResolvedValue(
        aggregateFixture as never,
    );
    vi.mocked(readHrdDashboardHealth).mockResolvedValue(
        healthFixture as never,
    );
    rootPolicy.permissions.mockResolvedValue({
        success: true,
        data: ['/hrd'],
    });
    rootPolicy.workspace.mockReturnValue(true);
    rootPolicy.resource.mockReturnValue(true);
});
afterEach(() => vi.useRealTimers());

describe('HRD overview authorization and canonical conformance', () => {
    it('allows HRD and returns the privacy-minimal mobile projection', async () => {
        const result = await getHrdMobileOverview();

        expect(result).toEqual({ success: true, data: aggregateFixture });
        expect(readHrdDashboardMobileAggregate).toHaveBeenCalledWith(prisma, {
            userId: 'u1',
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data.attention).not.toHaveProperty('loanPortfolio');
    });

    it('keeps signed formulas conformant while desktop-only fields stay outside mobile', async () => {
        const result = await getHrdMobileOverview();

        expect(result).toMatchObject({
            success: true,
            data: {
                health: aggregateFixture.health,
                attention: {
                    pendingLeave: aggregateFixture.attention.pendingLeave,
                    payroll: aggregateFixture.attention.payroll,
                },
            },
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data.attention).not.toHaveProperty('loanPortfolio');
    });

    it.each(['ADMIN', 'HRD'])(
        'allows %s to read the existing mobile projection',
        async (role) => {
            session(role);
            expect(await getHrdMobileOverview()).toEqual({ success: true, data: aggregateFixture });
            expect(requireMobilePortalAccess).toHaveBeenCalledWith('hrd-supervisor');
        },
    );

    it.each(['FINANCE'])(
        'denies %s access before the aggregate read',
        async (role) => {
            session(role);
            expect(await getHrdMobileOverview()).toMatchObject({
                success: false,
            });
            expect(readHrdDashboardMobileAggregate).not.toHaveBeenCalled();
        },
    );

    it('allows an existing HRD secondary role while preserving the strict effective-role guard', async () => {
        session('SALES', ['SALES', 'HRD']);
        expect(await getHrdMobileOverview()).toEqual({
            success: true,
            data: aggregateFixture,
        });
    });

    it.each(['SALES', 'WAREHOUSE', 'PRODUCTION'])(
        'denies %s before any HRD read',
        async (role) => {
            session(role);
            expect(await getHrdMobileOverview()).toMatchObject({
                success: false,
            });
            expect(readHrdDashboardMobileAggregate).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'HRD'])('stops both %s readers when portal access fails', async (role) => {
        session(role);
        vi.mocked(requireMobilePortalAccess).mockRejectedValue(new Error('Portal denied'));
        expect(await getHrdMobileOverview()).toMatchObject({ success: false });
        expect(await getHrdMobileTeamAttendance()).toMatchObject({ success: false });
        expect(readHrdDashboardMobileAggregate).not.toHaveBeenCalled();
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
        expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
    });

    it('rejects no session before HRD reads', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        expect(await getHrdMobileOverview()).toMatchObject({ success: false });
        expect(readHrdDashboardMobileAggregate).not.toHaveBeenCalled();
    });

    it('does not expose personal aggregate collections or turn a whole-reader failure into zero', async () => {
        const success = await getHrdMobileOverview();
        if (!success.success) throw new Error(success.error);
        expect(success.data).not.toHaveProperty('pendingLeaves');
        expect(success.data).not.toHaveProperty('alerts');
        expect(success.data).not.toHaveProperty('highlights');

        vi.mocked(readHrdDashboardMobileAggregate).mockRejectedValue(
            new Error('Synthetic failure'),
        );
        expect(await getHrdMobileOverview()).toMatchObject({ success: false });
    });
});

describe('HRD team attendance', () => {
    function employees() {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            {
                id: 'one',
                name: 'Synthetic One',
                code: 'E1',
                role: 'OPERATOR',
            },
            {
                id: 'two',
                name: 'Synthetic Two',
                code: 'E2',
                role: 'OPERATOR',
            },
        ] as never);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
            {
                id: 'a1',
                employeeId: 'one',
                status: 'PRESENT',
                workShift: {
                    name: 'Shift',
                    startTime: '06:00',
                    endTime: '14:00',
                },
                clockInAt: new Date('2026-09-23T00:00:00Z'),
                actualHours: null,
            },
        ] as never);
    }

    it('filters NO_RECORD only after merging real attendance, never sends it to Prisma', async () => {
        employees();
        const result = await getHrdMobileTeamAttendance({
            date: '2026-09-23',
            status: 'NO_RECORD',
            workShiftId: 'shift',
        });
        expect(result).toMatchObject({
            success: true,
            data: {
                // Tiles come from the whole day, not the filtered list.
                noRecordCount: 1,
                presentCount: 1,
                totalEmployees: 1,
                records: [{ employeeId: 'two', status: 'NO_RECORD' }],
            },
        });
        const args = vi.mocked(prisma.attendanceRecord.findMany).mock.calls[0][0];
        expect(args?.where).not.toHaveProperty('status');
        expect(args?.where?.workShiftId).toBe('shift');
        expect(
            vi.mocked(prisma.employee.findMany).mock.calls[0][0]?.where,
        ).toMatchObject({
            shiftAssignments: { some: { workShiftId: 'shift' } },
        });
    });

    it('filters PRESENT and preserves distinct missing vs absent', async () => {
        employees();
        expect(
            await getHrdMobileTeamAttendance({ status: 'PRESENT' }),
        ).toMatchObject({
            success: true,
            data: { presentCount: 1, noRecordCount: 1, totalEmployees: 1 },
        });
        expect(await getHrdMobileTeamAttendance()).toMatchObject({
            success: true,
            data: { presentCount: 1, absentCount: 0, noRecordCount: 1 },
        });
    });

    it('rejects invalid filters and fails reads instead of inventing missing records', async () => {
        expect(
            await getHrdMobileTeamAttendance({ status: 'BAD' as never }),
        ).toMatchObject({ success: false });
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
        employees();
        vi.mocked(prisma.attendanceRecord.findMany).mockRejectedValue(
            new Error('Synthetic failure'),
        );
        expect(await getHrdMobileTeamAttendance()).toMatchObject({
            success: false,
        });
    });

    it('allows ADMIN team attendance without payroll or document fields', async () => {
        session('ADMIN');
        employees();
        const result = await getHrdMobileTeamAttendance();
        expect(result).toMatchObject({ success: true, data: { totalEmployees: 2 } });
        expect(requireMobilePortalAccess).toHaveBeenCalledWith('hrd-supervisor');
        if (!result.success) throw new Error(result.error);
        expect(Object.keys(result.data.records[0]).sort()).toEqual([
            'id', 'employeeId', 'employeeName', 'employeeCode', 'employeeRole',
            'shiftName', 'clockInAt', 'clockOutAt', 'status', 'actualHours', 'isLate',
        ].sort());
    });

    it('keeps team attendance unavailable to FINANCE', async () => {
        session('FINANCE');
        expect(await getHrdMobileTeamAttendance()).toMatchObject({
            success: false,
        });
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
    });
});

describe('HRD mobile health reader', () => {
    it('reads only health and drivers, never the attention aggregate', async () => {
        const result = await getHrdMobileHealth();

        expect(result).toEqual({ success: true, data: healthFixture });
        expect(readHrdDashboardHealth).toHaveBeenCalledWith(prisma);
        expect(readHrdDashboardMobileAggregate).not.toHaveBeenCalled();
        if (!result.success) throw new Error(result.error);
        expect(result.data).not.toHaveProperty('attention');
    });

    it('keeps the role guard before reading', async () => {
        session('FINANCE');
        expect(await getHrdMobileHealth()).toMatchObject({ success: false });
        expect(readHrdDashboardHealth).not.toHaveBeenCalled();
    });
});

describe('HRD team attendance summary and paging', () => {
    function roster(total: number, presentIds: string[]) {
        const people = Array.from({ length: total }, (_, i) => ({
            id: `emp-${String(i).padStart(2, '0')}`,
            name: `Synthetic ${String(i).padStart(2, '0')}`,
            code: `E${i}`,
            role: 'OPERATOR',
        }));
        vi.mocked(prisma.employee.findMany).mockResolvedValue(people as never);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue(
            presentIds.map((employeeId) => ({
                id: `rec-${employeeId}`,
                employeeId,
                status: 'PRESENT',
                workShift: { name: 'Shift', startTime: '06:00', endTime: '14:00' },
                clockInAt: new Date('2026-09-23T00:00:00Z'),
                clockOutAt: null,
                actualHours: null,
            })) as never,
        );
    }

    it('counts tiles from the whole day even when a status filter is active', async () => {
        roster(5, ['emp-00', 'emp-01']);
        const result = await getHrdMobileTeamAttendance({
            date: '2026-09-23',
            status: 'NO_RECORD',
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data.presentCount).toBe(2);
        expect(result.data.noRecordCount).toBe(3);
        expect(result.data.totalEmployees).toBe(3);
        expect(result.data.records).toHaveLength(3);
    });

    it('returns the requested second page with its own rows', async () => {
        roster(45, []);
        const result = await getHrdMobileTeamAttendance({
            date: '2026-09-23',
            page: '2',
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data).toMatchObject({
            page: 2,
            pageCount: 3,
            totalEmployees: 45,
            returned: 20,
        });
        expect(result.data.records[0].employeeName).toBe('Synthetic 20');
    });

    it('clamps an out-of-range page to the last page', async () => {
        roster(45, []);
        const result = await getHrdMobileTeamAttendance({
            date: '2026-09-23',
            page: '99',
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data).toMatchObject({ page: 3, returned: 5 });
        expect(result.data.records[0].employeeName).toBe('Synthetic 40');
    });

    it('keeps page 1 and zero pages worth of rows for an empty roster', async () => {
        roster(0, []);
        const result = await getHrdMobileTeamAttendance({ page: '7' });
        if (!result.success) throw new Error(result.error);
        expect(result.data).toMatchObject({ page: 1, pageCount: 1, returned: 0 });
    });

    it('forwards the specific rule message for an invalid status', async () => {
        const result = await getHrdMobileTeamAttendance({ status: 'BAD' as never });
        expect(result).toMatchObject({
            success: false,
            error: 'Filter status absensi tidak valid.',
        });
    });
});

describe('HRD team attendance on a non-working day', () => {
    function twoEmployees() {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            { id: 'one', name: 'Synthetic One', code: 'E1', role: 'OPERATOR' },
            { id: 'two', name: 'Synthetic Two', code: 'E2', role: 'OPERATOR' },
        ] as never);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
            {
                id: 'a1',
                employeeId: 'one',
                status: 'PRESENT',
                workShift: { name: 'Shift', startTime: '06:00', endTime: '14:00' },
                clockInAt: new Date('2026-09-27T00:00:00Z'),
                clockOutAt: null,
                actualHours: null,
            },
        ] as never);
    }

    it('has no not-yet-clocked-in people on Sunday', async () => {
        twoEmployees();
        const result = await getHrdMobileTeamAttendance({ date: '2026-09-27' });
        if (!result.success) throw new Error(result.error);
        expect(result.data.isNonWorkingDay).toBe(true);
        expect(result.data.noRecordCount).toBe(0);
        expect(result.data.records.map((r) => r.employeeId)).toEqual(['one']);
    });

    it('returns no rows for the not-yet-clocked-in filter on Sunday', async () => {
        twoEmployees();
        const result = await getHrdMobileTeamAttendance({
            date: '2026-09-27',
            status: 'NO_RECORD',
        });
        if (!result.success) throw new Error(result.error);
        expect(result.data).toMatchObject({ totalEmployees: 0, records: [] });
    });

    it.each(['2026-09-26', '2026-09-28'])('keeps %s unchanged', async (date) => {
        twoEmployees();
        const result = await getHrdMobileTeamAttendance({ date });
        if (!result.success) throw new Error(result.error);
        expect(result.data.isNonWorkingDay).toBe(false);
        expect(result.data.noRecordCount).toBe(1);
        expect(result.data.records).toHaveLength(2);
    });
});
