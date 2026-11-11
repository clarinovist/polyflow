import type { PrismaClient } from '@prisma/client';
import { isValidAttendancePhotoUrl } from '@/lib/media/attendance-photo-url';
import {
    getLateGraceMinutes,
    resolveGeofenceMode,
} from '@/services/hrd/attendance-location';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { staleSessionCutoff } from '@/services/hrd/stale-session';
import { isLateForShift } from '@/services/hrd/shift-window';

export interface HrdAttendanceToday {
    present: number;
    absent: number;
    onLeave: number;
    noRecord: number;
    /** Subset of `present`. */
    late: number;
    outsideRadius: number;
    noSelfie: number;
    overtimeHours: number;
    isNonWorkingDay: boolean;
    /** Employees with >= 1 open session older than the stale cutoff (60 days). */
    staleOpen: number;
}

export interface AttendanceTodayRecord {
    employeeId: string;
    status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
    clockInAt: Date | null;
    /** Prisma Decimal, number or null. */
    clockInDistance: unknown;
    clockInPhotoUrl: string | null;
    overtimeHours: unknown;
    workShift: { startTime: string };
}

interface SummarizeInput {
    records: AttendanceTodayRecord[];
    /** ACTIVE employees already joined on the date. */
    eligibleHeadcount: number;
    /** WIB business date, YYYY-MM-DD. */
    workDate: string;
    graceMinutes: number;
    radiusMeters: number | null;
    /** Distinct employees with a stale open session (computed by the reader). */
    staleOpen: number;
}

const SUNDAY = 0;
const HOURS_PRECISION = 100;
const STALE_LOOKBACK_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATUS_PRIORITY = { PRESENT: 3, ON_LEAVE: 2, ABSENT: 1 } as const;

function isSunday(workDate: string): boolean {
    return new Date(`${workDate}T00:00:00.000Z`).getUTCDay() === SUNDAY;
}

function toNumber(value: unknown): number {
    return Number(value ?? 0);
}

function roundHours(value: number): number {
    return Math.round(value * HOURS_PRECISION) / HOURS_PRECISION;
}

/** Radius used to flag outside-radius clock-ins; null when not configured. */
export function resolveAnomalyRadiusMeters(
    settings: Record<string, string | null | undefined>,
): number | null {
    if (resolveGeofenceMode(settings) === 'off') return null;
    const radius = parseFloat(settings['attendance.radiusMeters'] ?? '');
    return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function bestStatusPerEmployee(
    records: AttendanceTodayRecord[],
): Map<string, AttendanceTodayRecord['status']> {
    const byEmployee = new Map<string, AttendanceTodayRecord['status']>();
    for (const record of records) {
        const current = byEmployee.get(record.employeeId);
        if (
            !current ||
            STATUS_PRIORITY[record.status] > STATUS_PRIORITY[current]
        ) {
            byEmployee.set(record.employeeId, record.status);
        }
    }
    return byEmployee;
}

function isLateRecord(
    record: AttendanceTodayRecord,
    workDate: string,
    graceMinutes: number,
): boolean {
    return (
        record.clockInAt !== null &&
        isLateForShift(
            record.clockInAt,
            workDate,
            record.workShift.startTime,
            graceMinutes,
        )
    );
}

function isOutsideRadius(
    record: AttendanceTodayRecord,
    radiusMeters: number | null,
): boolean {
    if (radiusMeters === null || record.clockInDistance == null) return false;
    return toNumber(record.clockInDistance) > radiusMeters;
}

/** Employee ids with at least one PRESENT record matching the predicate. */
function countPresentEmployees(
    records: AttendanceTodayRecord[],
    predicate: (record: AttendanceTodayRecord) => boolean,
): number {
    const matched = new Set<string>();
    for (const record of records) {
        if (record.status === 'PRESENT' && predicate(record)) {
            matched.add(record.employeeId);
        }
    }
    return matched.size;
}

/**
 * Pure, per-employee summary of one day's attendance rows. Two shifts for one
 * person count once; anomalies count an employee once when any PRESENT row
 * matches.
 */
export function summarizeAttendanceToday(
    input: SummarizeInput,
): HrdAttendanceToday {
    const { records, workDate, graceMinutes, radiusMeters } = input;
    const statuses = bestStatusPerEmployee(records);
    const counts = { present: 0, absent: 0, onLeave: 0 };
    for (const status of statuses.values()) {
        if (status === 'PRESENT') counts.present += 1;
        if (status === 'ABSENT') counts.absent += 1;
        if (status === 'ON_LEAVE') counts.onLeave += 1;
    }
    const isNonWorkingDay = isSunday(workDate);
    const overtime = records
        .filter((record) => record.status === 'PRESENT')
        .reduce((sum, record) => sum + toNumber(record.overtimeHours), 0);

    return {
        ...counts,
        noRecord: isNonWorkingDay
            ? 0
            : Math.max(0, input.eligibleHeadcount - statuses.size),
        late: countPresentEmployees(records, (record) =>
            isLateRecord(record, workDate, graceMinutes),
        ),
        outsideRadius: countPresentEmployees(records, (record) =>
            isOutsideRadius(record, radiusMeters),
        ),
        noSelfie: countPresentEmployees(
            records,
            (record) => !isValidAttendancePhotoUrl(record.clockInPhotoUrl),
        ),
        overtimeHours: roundHours(overtime),
        isNonWorkingDay,
        staleOpen: input.staleOpen,
    };
}

function nextDayStartWib(workDate: string): Date {
    const next = new Date(
        new Date(`${workDate}T00:00:00.000Z`).getTime() + MS_PER_DAY,
    );
    return new Date(`${next.toISOString().slice(0, 10)}T00:00:00.000+07:00`);
}

async function countEligibleEmployees(
    db: PrismaClient,
    workDate: string,
): Promise<number> {
    return db.employee.count({
        where: {
            status: 'ACTIVE',
            OR: [
                { joinDate: null },
                { joinDate: { lt: nextDayStartWib(workDate) } },
            ],
        },
    });
}

/**
 * Distinct employees holding an open session past the stale cutoff within the
 * lookback window. Historical, so it ignores the displayed day and Sundays.
 */
async function countStaleOpenEmployees(
    db: PrismaClient,
    workDate: Date,
    now: Date,
): Promise<number> {
    const earliestWorkDate = new Date(
        workDate.getTime() - STALE_LOOKBACK_DAYS * MS_PER_DAY,
    );
    const groups = await db.attendanceRecord.groupBy({
        by: ['employeeId'],
        where: {
            workDate: { gte: earliestWorkDate },
            clockInAt: { not: null, lt: staleSessionCutoff(now) },
            clockOutAt: null,
        },
    });
    return groups.length;
}

/**
 * One record query, one headcount query (skipped on Sunday), one stale-session
 * group query and one settings query; everything else is computed in memory. Any failed read rejects so the
 * caller can mark the section UNAVAILABLE instead of showing zeroes.
 */
export async function readAttendanceTodaySnapshot(
    db: PrismaClient,
    workDate: Date,
): Promise<HrdAttendanceToday> {
    const workDateString = workDate.toISOString().slice(0, 10);
    const [records, eligibleHeadcount, staleOpen, settings] = await Promise.all([
        db.attendanceRecord.findMany({
            where: { workDate },
            select: {
                employeeId: true,
                status: true,
                clockInAt: true,
                clockInDistance: true,
                clockInPhotoUrl: true,
                overtimeHours: true,
                workShift: { select: { startTime: true } },
            },
        }),
        isSunday(workDateString)
            ? Promise.resolve(0)
            : countEligibleEmployees(db, workDateString),
        countStaleOpenEmployees(db, workDate, new Date()),
        readAttendanceSettings(db),
    ]);

    return summarizeAttendanceToday({
        records,
        eligibleHeadcount,
        workDate: workDateString,
        graceMinutes: getLateGraceMinutes(settings),
        radiusMeters: resolveAnomalyRadiusMeters(settings),
        staleOpen,
    });
}
