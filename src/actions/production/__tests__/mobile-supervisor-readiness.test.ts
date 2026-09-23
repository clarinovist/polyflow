import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductionSupervisorOverview, getMobileTeamAttendance } from '../mobile-supervisor';
const m = vi.hoisted(() => ({ orders: vi.fn(), count: vi.fn(), output: vi.fn(), downtime: vi.fn(), qc: vi.fn(), employees: vi.fn(), attendance: vi.fn(), shifts: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: m.auth }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    productionOrder: { findMany: m.orders, count: m.count }, productionExecution: { aggregate: m.output }, machineDowntime: { findMany: m.downtime }, qualityInspection: { count: m.qc },
    employee: { findMany: m.employees }, attendanceRecord: { findMany: m.attendance }, workShift: { findMany: m.shifts },
} }));
beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-23T03:00:00Z'));
    m.auth.mockResolvedValue({ user: { role: 'PRODUCTION' } }); m.orders.mockResolvedValue([]); m.count.mockResolvedValue(25); m.output.mockResolvedValue({ _sum: {} }); m.qc.mockResolvedValue(0); m.downtime.mockResolvedValue([]);
    m.employees.mockResolvedValue([]); m.attendance.mockResolvedValue([]); m.shifts.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
describe('mobile production read semantics', () => {
    it('counts full active orders and sums all downtime clipped to WIB day with live elapsed time', async () => {
        m.downtime.mockResolvedValue([
            ...Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, machine: { name: 'Machine' }, reason: 'Synthetic', startTime: new Date('2026-09-23T02:00:00Z'), endTime: new Date('2026-09-23T02:10:00Z'), createdAt: new Date() })),
            { id: 'ongoing', machine: { name: 'Machine' }, reason: 'Synthetic', startTime: new Date('2026-09-22T16:00:00Z'), endTime: null, createdAt: new Date() },
        ]);
        const result = await getProductionSupervisorOverview();
        expect(result).toMatchObject({ success: true, data: { highlights: { activeOrdersCount: 25, downtimeMinutesToday: 660 } } });
        if (result.success) expect(result.data.downtimeAlerts).toHaveLength(5);
        expect(m.downtime.mock.calls[0][0]).not.toHaveProperty('take');
        expect(m.output.mock.calls[0][0].where.startTime).toEqual({ gte: new Date('2026-09-22T17:00:00Z'), lte: new Date('2026-09-23T16:59:59.999Z') });
    });
    it('fails rather than inventing zero downtime', async () => {
        m.downtime.mockRejectedValue(new Error('Synthetic unavailable')); expect(await getProductionSupervisorOverview()).toMatchObject({ success: false });
    });
    it('derives NO_RECORD after reading attendance without an enum filter', async () => {
        m.employees.mockResolvedValue([{ id: 'one', name: 'One', code: 'E1', role: 'OPERATOR' }, { id: 'two', name: 'Two', code: 'E2', role: 'PACKER' }]);
        m.attendance.mockResolvedValue([{ id: 'a', employeeId: 'one', status: 'PRESENT', employee: { id: 'one' }, workShift: { id: 's', name: 'Shift' }, workDate: new Date(), clockInAt: null }]);
        expect(await getMobileTeamAttendance({ date: '2026-09-23', status: 'NO_RECORD' })).toMatchObject({ success: true, data: { noRecordCount: 1, records: [{ employeeId: 'two' }] } });
        expect(m.attendance.mock.calls[0][0].where).not.toHaveProperty('status');
    });
    it('rejects unsupported employee role before querying and preserves query failures', async () => {
        expect(await getMobileTeamAttendance({ date: '2026-09-23', role: 'FINANCE' })).toMatchObject({ success: false }); expect(m.employees).not.toHaveBeenCalled();
        m.attendance.mockRejectedValue(new Error('Synthetic unavailable'));
        expect(await getMobileTeamAttendance({ date: '2026-09-23' })).toMatchObject({ success: false });
    });
});
