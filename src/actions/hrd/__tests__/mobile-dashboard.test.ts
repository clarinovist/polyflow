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
    getHrdMobileOverview,
    getHrdMobileTeamAttendance,
} from '../mobile-dashboard';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { readHrdDashboardMobileAggregate } from '@/services/hrd/hrd-dashboard-service';

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
        expect(readHrdDashboardMobileAggregate).toHaveBeenCalledWith(prisma);
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

    it.each(['ADMIN', 'FINANCE'])(
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
                noRecordCount: 1,
                presentCount: 0,
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
            data: { presentCount: 1, noRecordCount: 0 },
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

    it('keeps team attendance restricted to HRD', async () => {
        session('FINANCE');
        expect(await getHrdMobileTeamAttendance()).toMatchObject({
            success: false,
        });
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
    });
});
