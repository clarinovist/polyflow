import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    collectHrdDashboardAggregate,
    readHrdDashboardAggregate,
    readHrdDashboardMobileAggregate,
    readHrdDashboardPayrollReadiness,
    readHrdPendingLeaveDashboardCount,
    type HrdDashboardReader,
} from '../hrd-dashboard-service';

const db = {
    employee: { count: vi.fn() },
    attendanceRecord: { groupBy: vi.fn(), aggregate: vi.fn() },
    payrollPeriod: { count: vi.fn(), findFirst: vi.fn() },
    payslip: { groupBy: vi.fn() },
    leaveRequest: { count: vi.fn() },
    employeeLoan: { aggregate: vi.fn() },
    notification: { count: vi.fn() },
};

const now = new Date('2026-10-09T17:30:00.000Z');

function setupAvailableZeroes() {
    db.employee.count.mockResolvedValue(0);
    db.attendanceRecord.groupBy.mockResolvedValue([]);
    db.attendanceRecord.aggregate.mockResolvedValue({
        _sum: { overtimeHours: null },
    });
    db.payrollPeriod.count.mockResolvedValue(0);
    db.payrollPeriod.findFirst.mockResolvedValue(null);
    db.payslip.groupBy.mockResolvedValue([]);
    db.leaveRequest.count.mockResolvedValue(0);
    db.employeeLoan.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { remainingBalance: null },
    });
    db.notification.count.mockResolvedValue(0);
}

describe('readHrdDashboardAggregate', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupAvailableZeroes();
    });

    it('uses the narrow supplied-client pending-leave owner reader', async () => {
        db.leaveRequest.count.mockResolvedValue(7);

        await expect(
            readHrdPendingLeaveDashboardCount(db as never),
        ).resolves.toEqual({ count: 7 });
        expect(db.leaveRequest.count).toHaveBeenCalledWith({
            where: { status: 'PENDING' },
        });
        expect(db.employee.count).not.toHaveBeenCalled();
        expect(db.payrollPeriod.count).not.toHaveBeenCalled();
        expect(db.employeeLoan.aggregate).not.toHaveBeenCalled();
    });

    it('counts only the current ACTIVE employee snapshot', async () => {
        db.employee.count.mockImplementation(
            async (args: {
                where: {
                    status: string;
                    employmentStatus?: string;
                    bpjsParticipant?: boolean;
                };
            }) =>
                args.where.status === 'ACTIVE' &&
                args.where.employmentStatus === undefined &&
                args.where.bpjsParticipant === undefined
                    ? 42
                    : 0,
        );

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.activeHeadcount).toEqual({
            status: 'AVAILABLE',
            data: { count: 42 },
        });
        expect(db.employee.count).toHaveBeenCalledWith({
            where: { status: 'ACTIVE' },
        });
    });

    it('returns valid zeroes as AVAILABLE and no open payroll period as NOT_CONFIGURED', async () => {
        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.workDate).toBe('2026-10-10');
        expect(result.yesterdayWorkDate).toBe('2026-10-09');
        expect(result.health.activeHeadcount).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
        expect(result.health.attendanceToday).toEqual({
            status: 'AVAILABLE',
            data: {
                present: 0,
                absent: 0,
                onLeave: 0,
                overtimeHours: 0,
            },
        });
        expect(result.health.payrollReadiness).toEqual({
            status: 'NOT_CONFIGURED',
            data: null,
        });
        expect(result.attention.payroll).toEqual({
            status: 'AVAILABLE',
            data: { openPeriods: 0, periodsNeedGenerate: 0 },
        });
        expect(result.drivers).toEqual({
            status: 'NOT_CONFIGURED',
            data: null,
        });
    });

    it('counts unique stored statuses by status+employee and sums PRESENT overtime hours', async () => {
        db.attendanceRecord.groupBy.mockImplementation(
            async (args: { by: string[] }) =>
                args.by.includes('status')
                    ? [
                          { status: 'PRESENT', employeeId: 'one' },
                          { status: 'PRESENT', employeeId: 'two' },
                          { status: 'ABSENT', employeeId: 'two' },
                          { status: 'ON_LEAVE', employeeId: 'three' },
                      ]
                    : [],
        );
        db.attendanceRecord.aggregate.mockResolvedValue({
            _sum: { overtimeHours: 3.335 },
        });

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.attendanceToday).toEqual({
            status: 'AVAILABLE',
            data: {
                present: 2,
                absent: 1,
                onLeave: 1,
                overtimeHours: 3.34,
            },
        });
        expect(db.attendanceRecord.groupBy).toHaveBeenCalledWith({
            by: ['status', 'employeeId'],
            where: { workDate: new Date('2026-10-10T00:00:00.000Z') },
        });
        expect(db.attendanceRecord.aggregate).toHaveBeenCalledWith({
            where: {
                workDate: new Date('2026-10-10T00:00:00.000Z'),
                status: 'PRESENT',
            },
            _sum: { overtimeHours: true },
        });
        expect(JSON.stringify(result)).not.toContain('NO_RECORD');
    });

    it('reads the deterministic latest OPEN period and grouped generated-slip statuses', async () => {
        db.payrollPeriod.count
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1);
        db.payrollPeriod.findFirst.mockResolvedValue({
            id: 'latest',
            year: 2026,
            month: 9,
        });
        db.payslip.groupBy.mockResolvedValue([
            { status: 'DRAFT', _count: { _all: 2 } },
            { status: 'FINALIZED', _count: { _all: 3 } },
            { status: 'PAID', _count: { _all: 4 } },
        ]);

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.payrollReadiness).toEqual({
            status: 'AVAILABLE',
            data: {
                year: 2026,
                month: 9,
                total: 9,
                draft: 2,
                finalized: 3,
                paid: 4,
            },
        });
        expect(result.attention.payroll).toEqual({
            status: 'AVAILABLE',
            data: { openPeriods: 2, periodsNeedGenerate: 1 },
        });
        expect(db.payrollPeriod.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: 'OPEN' },
                orderBy: [
                    { year: 'desc' },
                    { month: 'desc' },
                    { id: 'asc' },
                ],
                select: { id: true, year: true, month: true },
            }),
        );
        expect(db.payslip.groupBy).toHaveBeenCalledWith({
            by: ['status'],
            where: { payrollPeriodId: 'latest' },
            _count: { _all: true },
        });
    });

    it('keeps an OPEN period with zero generated slips AVAILABLE and actionable', async () => {
        db.payrollPeriod.count
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1);
        db.payrollPeriod.findFirst.mockResolvedValue({
            id: 'period',
            year: 2026,
            month: 10,
        });

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.payrollReadiness).toMatchObject({
            status: 'AVAILABLE',
            data: { total: 0, draft: 0, finalized: 0, paid: 0 },
        });
        expect(result.attention.payroll).toEqual({
            status: 'AVAILABLE',
            data: { openPeriods: 1, periodsNeedGenerate: 1 },
        });
    });

    it('pairs active PROBATION and CONTRACT only with their matching date fields through the exact horizon', async () => {
        db.employee.count.mockImplementation(
            async (args: {
                where: {
                    employmentStatus?: string;
                    probationEndDate?: unknown;
                    contractEndDate?: unknown;
                    bpjsParticipant?: boolean;
                };
            }) => {
                if (args.where.employmentStatus === 'PROBATION') return 2;
                if (args.where.employmentStatus === 'CONTRACT') return 3;
                return 0;
            },
        );

        const result = await readHrdDashboardAggregate(db as never, { now });
        const cutoff = new Date('2026-11-09T23:59:59.999+07:00');

        expect(result.health.employmentFollowUp).toEqual({
            status: 'AVAILABLE',
            data: {
                probation: 2,
                contract: 3,
                total: 5,
                horizonDays: 30,
            },
        });
        expect(db.employee.count).toHaveBeenCalledWith({
            where: {
                status: 'ACTIVE',
                employmentStatus: 'PROBATION',
                probationEndDate: { not: null, lte: cutoff },
            },
        });
        expect(db.employee.count).toHaveBeenCalledWith({
            where: {
                status: 'ACTIVE',
                employmentStatus: 'CONTRACT',
                contractEndDate: { not: null, lte: cutoff },
            },
        });
        const calls = db.employee.count.mock.calls.map(([args]) => args);
        const probationQuery = calls.find(
            (args) => args.where.employmentStatus === 'PROBATION',
        );
        const contractQuery = calls.find(
            (args) => args.where.employmentStatus === 'CONTRACT',
        );
        expect(probationQuery.where).not.toHaveProperty('contractEndDate');
        expect(contractQuery.where).not.toHaveProperty('probationEndDate');
    });

    it('uses database aggregates for desktop loan portfolio and omits the query and field on mobile', async () => {
        db.employeeLoan.aggregate.mockResolvedValue({
            _count: { _all: 4 },
            _sum: { remainingBalance: 1250000.555 },
        });

        const result = await readHrdDashboardAggregate(db as never, { now });
        const serialized = JSON.stringify(result);

        expect(result.attention.loanPortfolio).toEqual({
            status: 'AVAILABLE',
            data: { activeCount: 4, outstandingAmount: 1250000.56 },
        });
        expect(db.employeeLoan.aggregate).toHaveBeenCalledWith({
            where: { status: 'ACTIVE' },
            _count: { _all: true },
            _sum: { remainingBalance: true },
        });

        db.employeeLoan.aggregate.mockClear();
        const mobile = await readHrdDashboardMobileAggregate(db as never, {
            now,
        });
        expect(mobile.attention).not.toHaveProperty('loanPortfolio');
        expect(db.employeeLoan.aggregate).not.toHaveBeenCalled();

        for (const forbidden of [
            'employeeName',
            'employeeId',
            'employeeCode',
            'notificationTitle',
            'message',
            'bankAccount',
            'netPay',
            'loanNumber',
            'pendingLeaves',
            'alerts',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('marks a failed active snapshot UNAVAILABLE while unrelated sections survive', async () => {
        db.employee.count.mockImplementation(
            async (args: { where: { bpjsParticipant?: boolean } }) => {
                if (args.where.bpjsParticipant) return 0;
                throw new Error('active employee snapshot unavailable');
            },
        );

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.activeHeadcount).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.attention.pendingLeave).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
    });

    it('keeps payroll Attention available when only generated-slip readiness fails', async () => {
        db.payrollPeriod.count
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1);
        db.payrollPeriod.findFirst.mockResolvedValue({
            id: 'latest',
            year: 2026,
            month: 10,
        });
        db.payslip.groupBy.mockRejectedValue(
            new Error('generated-slip statuses unavailable'),
        );

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.payrollReadiness).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.attention.payroll).toEqual({
            status: 'AVAILABLE',
            data: { openPeriods: 2, periodsNeedGenerate: 1 },
        });
    });

    it('marks independent failed sections unavailable while unrelated valid zeroes survive', async () => {
        db.attendanceRecord.aggregate.mockRejectedValue(
            new Error('attendance unavailable'),
        );
        db.payrollPeriod.count.mockRejectedValue(
            new Error('payroll Attention unavailable'),
        );
        db.payrollPeriod.findFirst.mockRejectedValue(
            new Error('payroll readiness unavailable'),
        );

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.health.attendanceToday).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.health.payrollReadiness).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.attention.payroll).toEqual({
            status: 'UNAVAILABLE',
            data: null,
        });
        expect(result.health.activeHeadcount).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
        expect(result.attention.pendingLeave).toEqual({
            status: 'AVAILABLE',
            data: { count: 0 },
        });
    });

    it('executes explicit boundary fixtures for stale fields, inactive/missing dates, overdue, and exact horizon', async () => {
        const employees = [
            {
                status: 'ACTIVE',
                employmentStatus: 'PROBATION',
                probationEndDate: new Date('2026-11-09T23:59:59.999+07:00'),
                contractEndDate: null,
            },
            {
                status: 'ACTIVE',
                employmentStatus: 'PROBATION',
                probationEndDate: new Date('2026-09-01T00:00:00.000Z'),
                contractEndDate: null,
            },
            {
                status: 'ACTIVE',
                employmentStatus: 'PROBATION',
                probationEndDate: null,
                contractEndDate: new Date('2026-10-20T00:00:00.000Z'),
            },
            {
                status: 'ACTIVE',
                employmentStatus: 'CONTRACT',
                probationEndDate: new Date('2026-10-20T00:00:00.000Z'),
                contractEndDate: null,
            },
            {
                status: 'ACTIVE',
                employmentStatus: 'CONTRACT',
                probationEndDate: null,
                contractEndDate: new Date('2026-11-10T00:00:00.000Z'),
            },
            {
                status: 'INACTIVE',
                employmentStatus: 'CONTRACT',
                probationEndDate: null,
                contractEndDate: new Date('2026-10-20T00:00:00.000Z'),
            },
        ];
        const reader: HrdDashboardReader = {
            readActiveHeadcount: async () => ({ count: 5 }),
            readAttendanceToday: async () => ({
                present: 0,
                absent: 0,
                onLeave: 0,
                overtimeHours: 0,
            }),
            readPayrollAttention: async () => ({
                openPeriods: 0,
                periodsNeedGenerate: 0,
            }),
            readPayrollReadiness: async () => null,
            readEmploymentFollowUp: async (asOf) => {
                const cutoffDate = new Date(
                    `${asOf.toLocaleDateString('en-CA', {
                        timeZone: 'Asia/Jakarta',
                    })}T00:00:00.000Z`,
                );
                cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 30);
                const cutoff = new Date(
                    `${cutoffDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`,
                );
                const probation = employees.filter(
                    (employee) =>
                        employee.status === 'ACTIVE' &&
                        employee.employmentStatus === 'PROBATION' &&
                        employee.probationEndDate !== null &&
                        employee.probationEndDate <= cutoff,
                ).length;
                const contract = employees.filter(
                    (employee) =>
                        employee.status === 'ACTIVE' &&
                        employee.employmentStatus === 'CONTRACT' &&
                        employee.contractEndDate !== null &&
                        employee.contractEndDate <= cutoff,
                ).length;
                return {
                    probation,
                    contract,
                    total: probation + contract,
                    horizonDays: 30,
                };
            },
            readPendingLeave: async () => ({ count: 0 }),
            readLoanPortfolio: async () => ({
                activeCount: 0,
                outstandingAmount: 0,
            }),
            readBpjs: async () => ({ activeParticipants: 0 }),
            readHrAlerts: async () => ({
                unreadRecipientNotifications: 0,
            }),
            readRecordedAbsence: async () => ({ count: 0 }),
        };

        const result = await collectHrdDashboardAggregate(reader, { now });

        expect(result.health.employmentFollowUp).toEqual({
            status: 'AVAILABLE',
            data: {
                probation: 2,
                contract: 0,
                total: 2,
                horizonDays: 30,
            },
        });
    });

    it('keeps recorded ABSENT yesterday distinct and never fetches personal rows', async () => {
        db.attendanceRecord.groupBy.mockImplementation(
            async (args: { by: string[] }) =>
                args.by.length === 1
                    ? [{ employeeId: 'one' }, { employeeId: 'two' }]
                    : [],
        );

        const result = await readHrdDashboardAggregate(db as never, { now });

        expect(result.attention.recordedAbsenceYesterday).toEqual({
            status: 'AVAILABLE',
            data: { count: 2 },
        });
        expect(db.attendanceRecord.groupBy).toHaveBeenCalledWith({
            by: ['employeeId'],
            where: {
                workDate: new Date('2026-10-09T00:00:00.000Z'),
                status: 'ABSENT',
            },
        });
        expect(db.attendanceRecord).not.toHaveProperty('findMany');
    });
});

describe('readHrdDashboardPayrollReadiness', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupAvailableZeroes();
    });

    it('reads only the deterministic latest OPEN period and grouped slip statuses', async () => {
        db.payrollPeriod.findFirst.mockResolvedValue({
            id: 'latest',
            year: 2026,
            month: 9,
        });
        db.payslip.groupBy.mockResolvedValue([
            { status: 'DRAFT', _count: { _all: 2 } },
            { status: 'FINALIZED', _count: { _all: 3 } },
            { status: 'PAID', _count: { _all: 4 } },
        ]);

        await expect(
            readHrdDashboardPayrollReadiness(db as never),
        ).resolves.toEqual({
            year: 2026,
            month: 9,
            total: 9,
            draft: 2,
            finalized: 3,
            paid: 4,
        });
        expect(db.payrollPeriod.findFirst).toHaveBeenCalledWith({
            where: { status: 'OPEN' },
            select: { id: true, year: true, month: true },
            orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'asc' }],
        });
        expect(db.payslip.groupBy).toHaveBeenCalledWith({
            by: ['status'],
            where: { payrollPeriodId: 'latest' },
            _count: { _all: true },
        });
        expect(db.employee.count).not.toHaveBeenCalled();
        expect(db.employeeLoan.aggregate).not.toHaveBeenCalled();
        expect(db.notification.count).not.toHaveBeenCalled();
    });

    it('returns null without a slip query when no OPEN period exists', async () => {
        db.payrollPeriod.findFirst.mockResolvedValue(null);

        await expect(
            readHrdDashboardPayrollReadiness(db as never),
        ).resolves.toBeNull();
        expect(db.payslip.groupBy).not.toHaveBeenCalled();
    });

    it('keeps an OPEN period with zero generated slips a valid zero', async () => {
        db.payrollPeriod.findFirst.mockResolvedValue({
            id: 'empty',
            year: 2026,
            month: 10,
        });
        db.payslip.groupBy.mockResolvedValue([]);

        await expect(
            readHrdDashboardPayrollReadiness(db as never),
        ).resolves.toEqual({
            year: 2026,
            month: 10,
            total: 0,
            draft: 0,
            finalized: 0,
            paid: 0,
        });
    });
});
