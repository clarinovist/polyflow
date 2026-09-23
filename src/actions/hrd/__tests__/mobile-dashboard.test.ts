import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getHrdMobileOverview, getHrdMobileTeamAttendance } from '../mobile-dashboard';
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    user: { findUnique: vi.fn() }, attendanceRecord: { findMany: vi.fn() },
    leaveRequest: { findMany: vi.fn(), count: vi.fn() }, payrollPeriod: { findFirst: vi.fn() },
    employee: { findMany: vi.fn() }, workShift: { findMany: vi.fn() },
} }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn, getTenantContext: () => ({ tenantId: 'test' }) }));
function session(role: string, roles?: string[]) {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role, roles } } as never);
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T18:00:00Z'));
    session('HRD');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([]);
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0);
    vi.mocked(prisma.payrollPeriod.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workShift.findMany).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
describe('HRD overview authorization and meaning', () => {
    it.each(['HRD', 'ADMIN', 'FINANCE'])('allows existing HRD workspace role %s', async (role) => {
        session(role); expect(await getHrdMobileOverview()).toMatchObject({ success: true });
    });
    it('allows an existing HRD secondary role', async () => {
        session('SALES', ['SALES', 'HRD']); expect(await getHrdMobileOverview()).toMatchObject({ success: true });
    });
    it.each(['SALES', 'WAREHOUSE', 'PRODUCTION'])('denies %s before any HRD read', async (role) => {
        session(role); expect(await getHrdMobileOverview()).toMatchObject({ success: false });
        expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled(); expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
    });
    it('rejects no session before HRD reads', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        expect(await getHrdMobileOverview()).toMatchObject({ success: false });
        expect(prisma.attendanceRecord.findMany).not.toHaveBeenCalled();
    });
    it('counts unique PRESENT employees on the WIB date and full pending leave count', async () => {
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([{ employeeId: 'one' }, { employeeId: 'two' }] as never);
        vi.mocked(prisma.leaveRequest.count).mockResolvedValue(35);
        const result = await getHrdMobileOverview();
        expect(result).toMatchObject({ success: true, data: { highlights: { presentTodayCount: 2, pendingLeaveCount: 35 } } });
        expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith({ where: { workDate: new Date('2026-09-23T00:00:00Z'), status: 'PRESENT' }, distinct: ['employeeId'], select: { employeeId: true } });
        expect(prisma.leaveRequest.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
        if (result.success) expect(result.data.highlights).not.toHaveProperty('attendanceAlertsCount');
    });
    it('does not convert DB errors to healthy zero', async () => {
        vi.mocked(prisma.attendanceRecord.findMany).mockRejectedValue(new Error('Synthetic failure'));
        expect(await getHrdMobileOverview()).toMatchObject({ success: false });
    });
});
describe('HRD team attendance', () => {
    function employees() {
        vi.mocked(prisma.employee.findMany).mockResolvedValue([
            { id: 'one', name: 'Synthetic One', code: 'E1', role: 'OPERATOR' },
            { id: 'two', name: 'Synthetic Two', code: 'E2', role: 'OPERATOR' },
        ] as never);
        vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([
            { id: 'a1', employeeId: 'one', status: 'PRESENT', workShift: { name: 'Shift' }, clockInAt: new Date('2026-09-23T00:00:00Z'), actualHours: null },
        ] as never);
    }
    it('filters NO_RECORD only after merging real attendance, never sends it to Prisma', async () => {
        employees();
        const result = await getHrdMobileTeamAttendance({ date: '2026-09-23', status: 'NO_RECORD', workShiftId: 'shift' });
        expect(result).toMatchObject({ success: true, data: { noRecordCount: 1, presentCount: 0, records: [{ employeeId: 'two', status: 'NO_RECORD' }] } });
        const args = vi.mocked(prisma.attendanceRecord.findMany).mock.calls[0][0];
        expect(args?.where).not.toHaveProperty('status');
        expect(args?.where?.workShiftId).toBe('shift');
    });
    it('filters PRESENT and preserves distinct missing vs absent', async () => {
        employees();
        expect(await getHrdMobileTeamAttendance({ status: 'PRESENT' })).toMatchObject({ success: true, data: { presentCount: 1, noRecordCount: 0 } });
        expect(await getHrdMobileTeamAttendance()).toMatchObject({ success: true, data: { presentCount: 1, absentCount: 0, noRecordCount: 1 } });
    });
    it('rejects invalid filters and fails reads instead of inventing missing records', async () => {
        expect(await getHrdMobileTeamAttendance({ status: 'BAD' as never })).toMatchObject({ success: false });
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
        employees(); vi.mocked(prisma.attendanceRecord.findMany).mockRejectedValue(new Error('Synthetic failure'));
        expect(await getHrdMobileTeamAttendance()).toMatchObject({ success: false });
    });
    it('keeps team attendance restricted to HRD/admin', async () => {
        session('FINANCE'); expect(await getHrdMobileTeamAttendance()).toMatchObject({ success: false });
        expect(prisma.employee.findMany).not.toHaveBeenCalled();
    });
});
