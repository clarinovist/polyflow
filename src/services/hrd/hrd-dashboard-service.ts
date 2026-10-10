import type { PrismaClient } from '@prisma/client';
import { wibDateStringFrom } from '@/services/hrd/shift-window';

export type HrdDashboardSection<T> =
    | { status: 'AVAILABLE'; data: T }
    | { status: 'UNAVAILABLE'; data: null }
    | { status: 'NOT_CONFIGURED'; data: null };

export interface HrdDashboardAggregate {
    generatedAt: string;
    workDate: string;
    yesterdayWorkDate: string;
    health: {
        activeHeadcount: HrdDashboardSection<{ count: number }>;
        attendanceToday: HrdDashboardSection<{
            present: number;
            absent: number;
            onLeave: number;
            overtimeHours: number;
        }>;
        payrollReadiness: HrdDashboardSection<{
            year: number;
            month: number;
            total: number;
            draft: number;
            finalized: number;
            paid: number;
        }>;
        employmentFollowUp: HrdDashboardSection<{
            probation: number;
            contract: number;
            total: number;
            horizonDays: 30;
        }>;
    };
    attention: {
        pendingLeave: HrdDashboardSection<{ count: number }>;
        loanPortfolio: HrdDashboardSection<{
            activeCount: number;
            outstandingAmount: number;
        }>;
        payroll: HrdDashboardSection<{
            openPeriods: number;
            periodsNeedGenerate: number;
        }>;
        bpjs: HrdDashboardSection<{ activeParticipants: number }>;
        hrAlerts: HrdDashboardSection<{ unreadRecipientNotifications: number }>;
        recordedAbsenceYesterday: HrdDashboardSection<{ count: number }>;
    };
    drivers: HrdDashboardSection<never>;
}

export type HrdDashboardMobileAggregate = Omit<
    HrdDashboardAggregate,
    'attention'
> & {
    attention: Omit<HrdDashboardAggregate['attention'], 'loanPortfolio'>;
};

export interface HrdDashboardReader {
    readActiveHeadcount(): Promise<{ count: number }>;
    readAttendanceToday(workDate: Date): Promise<{
        present: number;
        absent: number;
        onLeave: number;
        overtimeHours: number;
    }>;
    readPayrollAttention(): Promise<{
        openPeriods: number;
        periodsNeedGenerate: number;
    }>;
    readPayrollReadiness(): Promise<{
        year: number;
        month: number;
        total: number;
        draft: number;
        finalized: number;
        paid: number;
    } | null>;
    readEmploymentFollowUp(now: Date): Promise<{
        probation: number;
        contract: number;
        total: number;
        horizonDays: 30;
    }>;
    readPendingLeave(): Promise<{ count: number }>;
    readLoanPortfolio(): Promise<{
        activeCount: number;
        outstandingAmount: number;
    }>;
    readBpjs(): Promise<{ activeParticipants: number }>;
    readHrAlerts(): Promise<{ unreadRecipientNotifications: number }>;
    readRecordedAbsence(workDate: Date): Promise<{ count: number }>;
}

type AvailableSection<T> = Extract<
    HrdDashboardSection<T>,
    { status: 'AVAILABLE' }
>;
type UnavailableSection<T> = Extract<
    HrdDashboardSection<T>,
    { status: 'UNAVAILABLE' }
>;

const EMPLOYMENT_FOLLOW_UP_HORIZON_DAYS = 30;

function available<T>(data: T): AvailableSection<T> {
    return { status: 'AVAILABLE', data };
}

function unavailable<T>(): UnavailableSection<T> {
    return { status: 'UNAVAILABLE', data: null };
}

function notConfigured<T>(): HrdDashboardSection<T> {
    return { status: 'NOT_CONFIGURED', data: null };
}

function outcomeSection<T>(
    outcome: PromiseSettledResult<T>,
): AvailableSection<T> | UnavailableSection<T> {
    return outcome.status === 'fulfilled'
        ? available(outcome.value)
        : unavailable();
}

function dateOnly(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

function previousDate(date: string): string {
    const value = dateOnly(date);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
}

function roundHours(value: unknown): number {
    return Math.round(Number(value ?? 0) * 100) / 100;
}

async function readAttendanceToday(db: PrismaClient, workDate: Date) {
    const [statusRows, overtime] = await Promise.all([
        db.attendanceRecord.groupBy({
            by: ['status', 'employeeId'],
            where: { workDate },
        }),
        db.attendanceRecord.aggregate({
            where: { workDate, status: 'PRESENT' },
            _sum: { overtimeHours: true },
        }),
    ]);

    const counts = { present: 0, absent: 0, onLeave: 0 };
    for (const row of statusRows) {
        if (row.status === 'PRESENT') counts.present += 1;
        if (row.status === 'ABSENT') counts.absent += 1;
        if (row.status === 'ON_LEAVE') counts.onLeave += 1;
    }

    return {
        ...counts,
        overtimeHours: roundHours(overtime._sum.overtimeHours),
    };
}

async function readPayrollAttention(db: PrismaClient) {
    const [openPeriods, periodsNeedGenerate] = await Promise.all([
        db.payrollPeriod.count({ where: { status: 'OPEN' } }),
        db.payrollPeriod.count({
            where: { status: 'OPEN', payslips: { none: {} } },
        }),
    ]);

    return { openPeriods, periodsNeedGenerate };
}

async function readPayrollReadiness(db: PrismaClient) {
    const latest = await db.payrollPeriod.findFirst({
        where: { status: 'OPEN' },
        select: { id: true, year: true, month: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'asc' }],
    });

    if (!latest) return null;

    const groups = await db.payslip.groupBy({
        by: ['status'],
        where: { payrollPeriodId: latest.id },
        _count: { _all: true },
    });
    const counts = { draft: 0, finalized: 0, paid: 0 };
    for (const group of groups) {
        const count = group._count._all;
        if (group.status === 'DRAFT') counts.draft = count;
        if (group.status === 'FINALIZED') counts.finalized = count;
        if (group.status === 'PAID') counts.paid = count;
    }

    return {
        year: latest.year,
        month: latest.month,
        total: counts.draft + counts.finalized + counts.paid,
        ...counts,
    };
}

async function readEmploymentFollowUp(db: PrismaClient, now: Date) {
    const cutoffWorkDate = dateOnly(wibDateStringFrom(now));
    cutoffWorkDate.setUTCDate(
        cutoffWorkDate.getUTCDate() + EMPLOYMENT_FOLLOW_UP_HORIZON_DAYS,
    );
    const cutoff = new Date(
        `${cutoffWorkDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`,
    );
    const [probation, contract] = await Promise.all([
        db.employee.count({
            where: {
                status: 'ACTIVE',
                employmentStatus: 'PROBATION',
                probationEndDate: { not: null, lte: cutoff },
            },
        }),
        db.employee.count({
            where: {
                status: 'ACTIVE',
                employmentStatus: 'CONTRACT',
                contractEndDate: { not: null, lte: cutoff },
            },
        }),
    ]);

    return {
        probation,
        contract,
        total: probation + contract,
        horizonDays: EMPLOYMENT_FOLLOW_UP_HORIZON_DAYS as 30,
    };
}

async function readLoanPortfolio(db: PrismaClient) {
    const result = await db.employeeLoan.aggregate({
        where: { status: 'ACTIVE' },
        _count: { _all: true },
        _sum: { remainingBalance: true },
    });
    return {
        activeCount: result._count._all,
        outstandingAmount:
            Math.round(Number(result._sum.remainingBalance ?? 0) * 100) / 100,
    };
}

function createPrismaReader(db: PrismaClient): HrdDashboardReader {
    return {
        async readActiveHeadcount() {
            return {
                count: await db.employee.count({ where: { status: 'ACTIVE' } }),
            };
        },
        readAttendanceToday: (workDate) => readAttendanceToday(db, workDate),
        readPayrollAttention: () => readPayrollAttention(db),
        readPayrollReadiness: () => readPayrollReadiness(db),
        readEmploymentFollowUp: (now) => readEmploymentFollowUp(db, now),
        async readPendingLeave() {
            return {
                count: await db.leaveRequest.count({
                    where: { status: 'PENDING' },
                }),
            };
        },
        readLoanPortfolio: () => readLoanPortfolio(db),
        async readBpjs() {
            return {
                activeParticipants: await db.employee.count({
                    where: { status: 'ACTIVE', bpjsParticipant: true },
                }),
            };
        },
        async readHrAlerts() {
            return {
                unreadRecipientNotifications: await db.notification.count({
                    where: {
                        type: {
                            in: [
                                'HRD_PROBATION_ENDING',
                                'HRD_CONTRACT_EXPIRING',
                            ],
                        },
                        isRead: false,
                    },
                }),
            };
        },
        async readRecordedAbsence(workDate) {
            return {
                count: (
                    await db.attendanceRecord.groupBy({
                        by: ['employeeId'],
                        where: { workDate, status: 'ABSENT' },
                    })
                ).length,
            };
        },
    };
}

async function collectHrdDashboard(
    reader: HrdDashboardReader,
    options: { now?: Date; audience: 'DESKTOP_ROOT' | 'MOBILE' },
): Promise<HrdDashboardAggregate | HrdDashboardMobileAggregate> {
    const now = options.now ?? new Date();
    const workDate = wibDateStringFrom(now);
    const yesterdayWorkDate = previousDate(workDate);
    const workDateValue = dateOnly(workDate);
    const yesterdayWorkDateValue = dateOnly(yesterdayWorkDate);

    const [
        activeHeadcount,
        attendanceToday,
        payrollAttention,
        payrollReadiness,
        employmentFollowUp,
        pendingLeave,
        loanPortfolio,
        bpjs,
        hrAlerts,
        recordedAbsenceYesterday,
    ] = await Promise.allSettled([
        reader.readActiveHeadcount(),
        reader.readAttendanceToday(workDateValue),
        reader.readPayrollAttention(),
        reader.readPayrollReadiness(),
        reader.readEmploymentFollowUp(now),
        reader.readPendingLeave(),
        options.audience === 'DESKTOP_ROOT'
            ? reader.readLoanPortfolio()
            : Promise.resolve(null),
        reader.readBpjs(),
        reader.readHrAlerts(),
        reader.readRecordedAbsence(yesterdayWorkDateValue),
    ]);

    const healthPayroll: HrdDashboardAggregate['health']['payrollReadiness'] =
        payrollReadiness.status === 'rejected'
            ? unavailable()
            : payrollReadiness.value
              ? available(payrollReadiness.value)
              : notConfigured();
    const commonAttention = {
        pendingLeave: outcomeSection(pendingLeave),
        payroll: outcomeSection(payrollAttention),
        bpjs: outcomeSection(bpjs),
        hrAlerts: outcomeSection(hrAlerts),
        recordedAbsenceYesterday: outcomeSection(recordedAbsenceYesterday),
    };
    const common = {
        generatedAt: new Date().toISOString(),
        workDate,
        yesterdayWorkDate,
        health: {
            activeHeadcount: outcomeSection(activeHeadcount),
            attendanceToday: outcomeSection(attendanceToday),
            payrollReadiness: healthPayroll,
            employmentFollowUp: outcomeSection(employmentFollowUp),
        },
        drivers: notConfigured<never>(),
    };

    if (options.audience === 'MOBILE') {
        return { ...common, attention: commonAttention };
    }

    return {
        ...common,
        attention: {
            ...commonAttention,
            loanPortfolio:
                loanPortfolio.status === 'fulfilled' && loanPortfolio.value
                    ? available(loanPortfolio.value)
                    : unavailable(),
        },
    };
}

/** Compose root-authorized aggregates without turning rejection into zero. */
export async function collectHrdDashboardAggregate(
    reader: HrdDashboardReader,
    options: { now?: Date } = {},
): Promise<HrdDashboardAggregate> {
    return collectHrdDashboard(reader, {
        ...options,
        audience: 'DESKTOP_ROOT',
    }) as Promise<HrdDashboardAggregate>;
}

/**
 * Canonical, read-only HRD dashboard snapshot shared by desktop and mobile.
 * Every query returns aggregates only; no personal row is selected for the root DTO.
 */
export async function readHrdDashboardAggregate(
    db: PrismaClient,
    options: { now?: Date } = {},
): Promise<HrdDashboardAggregate> {
    return collectHrdDashboardAggregate(createPrismaReader(db), options);
}

/** Mobile projection omits and does not query root-only financial aggregates. */
export async function readHrdDashboardMobileAggregate(
    db: PrismaClient,
    options: { now?: Date } = {},
): Promise<HrdDashboardMobileAggregate> {
    return collectHrdDashboard(createPrismaReader(db), {
        ...options,
        audience: 'MOBILE',
    }) as Promise<HrdDashboardMobileAggregate>;
}
