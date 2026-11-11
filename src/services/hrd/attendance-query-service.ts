import type { Prisma, PrismaClient } from '@prisma/client';
import { isValidAttendancePhotoUrl } from '@/lib/media/attendance-photo-url';
import { isLateForShift } from './shift-window';
import type {
    AttendanceRecordResult,
    DailySummary,
    ListFilters,
    MonthlyEmployeeSummary,
    RecordWithRelations,
    WeeklyEmployeeSummary,
} from './attendance-service';

export interface AttendanceFlags {
    /** PRESENT dan masuk lewat batas toleransi shift. */
    isLate: boolean;
    /** Jarak masuk melebihi radius geofence yang dikonfigurasi. */
    isOutsideRadius: boolean;
    /** Selfie masuk berupa path foto absensi internal yang valid. */
    hasValidSelfie: boolean;
}

export type AttendanceRecordWithFlags = AttendanceRecordResult &
    AttendanceFlags;

export interface AttendanceFlagContext {
    /** Hari kerja `YYYY-MM-DD` (WIB). */
    workDate: string;
    graceMinutes: number;
    /** Null bila radius belum dikonfigurasi. */
    radiusMeters: number | null;
    /** workShiftId -> jam mulai `HH:mm`. */
    shiftStartTimes: ReadonlyMap<string, string>;
}

/** Radius geofence dari setelan absensi; null bila kosong/tidak valid. */
export function readConfiguredRadius(
    settings: Record<string, string | null | undefined>,
): number | null {
    const radius = parseFloat(settings['attendance.radiusMeters'] ?? '');
    return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function isRecordLate(
    record: AttendanceRecordResult,
    context: AttendanceFlagContext,
): boolean {
    if (record.status !== 'PRESENT' || !record.clockInAt) return false;
    const shiftStart = context.shiftStartTimes.get(record.workShiftId);
    if (!shiftStart) return false;
    return isLateForShift(
        record.clockInAt,
        context.workDate,
        shiftStart,
        context.graceMinutes,
    );
}

function isRecordOutsideRadius(
    record: AttendanceRecordResult,
    radiusMeters: number | null,
): boolean {
    if (radiusMeters === null || record.clockInDistance == null) return false;
    return record.clockInDistance > radiusMeters;
}

/** Tambahkan penanda turunan (terlambat / luar radius / selfie) tanpa mengubah input. */
export function withAttendanceFlags(
    records: AttendanceRecordResult[],
    context: AttendanceFlagContext,
): AttendanceRecordWithFlags[] {
    return records.map((record) => ({
        ...record,
        isLate: isRecordLate(record, context),
        isOutsideRadius: isRecordOutsideRadius(record, context.radiusMeters),
        hasValidSelfie: isValidAttendancePhotoUrl(record.clockInPhotoUrl),
    }));
}

type AttendanceQueryDependencies = {
    buildRecordResult: (record: RecordWithRelations) => AttendanceRecordResult;
    includeRelations: {
        employee: { select: { name: true; code: true } };
        workShift: true;
    };
};

/** Read/recap operations use the caller's DB and the service's existing projector. */
export function createAttendanceQueries({
    buildRecordResult,
    includeRelations,
}: AttendanceQueryDependencies) {
    return {

        /**
         * List attendance records by date with optional filters.
         */
        async listByDate(
            db: PrismaClient,
            date: Date,
            filters?: ListFilters,
        ): Promise<AttendanceRecordResult[]> {
            const where: Prisma.AttendanceRecordWhereInput = { workDate: date };
            if (filters?.workShiftId) where.workShiftId = filters.workShiftId;

            const records = await db.attendanceRecord.findMany({
                where,
                include: includeRelations,
                orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
            });

            let results = records.map((r) =>
                buildRecordResult(r as unknown as RecordWithRelations),
            );

            if (filters?.overtimeOnly) {
                results = results.filter(
                    (r) => r.isOvertimeShift || r.overtimeHours > 0,
                );
            }

            return results;
        },

        /**
         * Get daily summary with aggregate metrics.
         */
        async getSummary(db: PrismaClient, date: Date): Promise<DailySummary> {
            const records = await db.attendanceRecord.findMany({
                where: { workDate: date, status: 'PRESENT' },
                include: includeRelations,
                orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
            });

            const results = records.map((r) =>
                buildRecordResult(r as unknown as RecordWithRelations),
            );
            const uniqueEmployees = new Set(results.map((r) => r.employeeId));
            const multiShiftEmployees = new Set(
                results.filter((r) => r.isOvertimeShift).map((r) => r.employeeId),
            );

            return {
                date,
                totalEmployees: uniqueEmployees.size,
                totalRecords: results.length,
                multiShiftCount: multiShiftEmployees.size,
                totalActualHours:
                    Math.round(
                        results.reduce((sum, r) => sum + (r.actualHours ?? 0), 0) *
                            100,
                    ) / 100,
                totalOvertimeHours:
                    Math.round(
                        results.reduce((sum, r) => sum + r.overtimeHours, 0) * 100,
                    ) / 100,
                totalDailyEarnings:
                    Math.round(
                        results.reduce((sum, r) => sum + r.dailyEarnings, 0) * 100,
                    ) / 100,
                totalOvertimeEarnings:
                    Math.round(
                        results.reduce((sum, r) => sum + r.overtimeEarnings, 0) *
                            100,
                    ) / 100,
                totalEarnings:
                    Math.round(
                        results.reduce((sum, r) => sum + r.totalEarnings, 0) * 100,
                    ) / 100,
                records: results,
            };
        },

        // ─────────────────────────────────────────────────────────────
        // Fase 3: range methods (used by weekly attendance recap + monthly payroll §5)
        // ─────────────────────────────────────────────────────────────

        /**
         * List attendance records in a date range [from, to] inclusive.
         * Reuses same filters as listByDate minus the single-date where.
         */
        async listByRange(
            db: PrismaClient,
            from: Date,
            to: Date,
            filters?: ListFilters,
        ): Promise<AttendanceRecordResult[]> {
            const where: Record<string, unknown> = {
                workDate: { gte: from, lte: to },
            };
            if (filters?.workShiftId) where.workShiftId = filters.workShiftId;

            const records = await db.attendanceRecord.findMany({
                where: where as never,
                include: includeRelations,
                orderBy: [
                    { employee: { code: 'asc' } },
                    { workDate: 'asc' },
                    { clockInAt: 'asc' },
                ],
            });

            let results = records.map((r) =>
                buildRecordResult(r as unknown as RecordWithRelations),
            );
            if (filters?.overtimeOnly) {
                results = results.filter(
                    (r) => r.isOvertimeShift || r.overtimeHours > 0,
                );
            }
            return results;
        },

        /**
         * Weekly summary — aggregate per employee within [weekStart, weekEnd].
         * Used by /hrd/attendance weekly toggle (and also reusable for payroll monthly §5).
         */
        async getWeeklySummary(
            db: PrismaClient,
            weekStart: Date,
            weekEnd: Date,
        ): Promise<WeeklyEmployeeSummary[]> {
            const records = await db.attendanceRecord.findMany({
                where: {
                    workDate: { gte: weekStart, lte: weekEnd },
                    status: 'PRESENT',
                },
                include: includeRelations,
            });
            const results = records.map((r) =>
                buildRecordResult(r as unknown as RecordWithRelations),
            );

            const byEmployee = new Map<string, WeeklyEmployeeSummary>();
            // Hari hadir dihitung per tanggal unik: dua shift sehari = satu hari.
            const presentDates = new Map<string, Set<string>>();
            for (const r of results) {
                const key = r.employeeId;
                const existing = byEmployee.get(key) ?? {
                    employeeId: r.employeeId,
                    employeeCode: r.employeeCode,
                    employeeName: r.employeeName,
                    daysPresent: 0,
                    totalActualHours: 0,
                    totalOvertimeHours: 0,
                    totalDailyEarnings: 0,
                    totalOvertimeEarnings: 0,
                    totalEarnings: 0,
                };
                const dates = presentDates.get(key) ?? new Set<string>();
                dates.add(r.workDate.toISOString().slice(0, 10));
                presentDates.set(key, dates);
                existing.daysPresent = dates.size;
                existing.totalActualHours += r.actualHours ?? 0;
                existing.totalOvertimeHours += r.overtimeHours ?? 0;
                existing.totalDailyEarnings += r.dailyEarnings ?? 0;
                existing.totalOvertimeEarnings += r.overtimeEarnings ?? 0;
                existing.totalEarnings += r.totalEarnings ?? 0;
                byEmployee.set(key, existing);
            }

            const round2 = (n: number) => Math.round(n * 100) / 100;
            return Array.from(byEmployee.values()).map((s) => ({
                ...s,
                totalActualHours: round2(s.totalActualHours),
                totalOvertimeHours: round2(s.totalOvertimeHours),
                totalDailyEarnings: round2(s.totalDailyEarnings),
                totalOvertimeEarnings: round2(s.totalOvertimeEarnings),
                totalEarnings: round2(s.totalEarnings),
            }));
        },

        /**
         * List attendance records for a single employee in a date range [from, to] inclusive.
         * Used by employee 360° profile attendance tab.
         */
        async listByEmployee(
            db: PrismaClient,
            employeeId: string,
            from: Date,
            to: Date,
        ): Promise<AttendanceRecordResult[]> {
            const records = await db.attendanceRecord.findMany({
                where: {
                    employeeId,
                    workDate: { gte: from, lte: to },
                },
                include: includeRelations,
                orderBy: [{ workDate: 'desc' }, { clockInAt: 'desc' }],
            });

            return records.map((r) =>
                buildRecordResult(r as unknown as RecordWithRelations),
            );
        },

        /**
         * Monthly summary — aggregate per employee for a calendar month.
         * Counts PRESENT / ABSENT / ON_LEAVE records and multi-shift days.
         * Gelombang A1.
         */
        async getMonthlySummary(
            db: PrismaClient,
            year: number,
            month: number,
        ): Promise<MonthlyEmployeeSummary[]> {
            const monthStart = new Date(Date.UTC(year, month - 1, 1));
            const monthEnd = new Date(Date.UTC(year, month, 0));

            const records = await db.attendanceRecord.findMany({
                where: { workDate: { gte: monthStart, lte: monthEnd } },
                select: {
                    employeeId: true,
                    workDate: true,
                    status: true,
                    actualHours: true,
                    overtimeHours: true,
                    employee: { select: { name: true, code: true } },
                },
                orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
            });

            const byEmployee = new Map<
                string,
                MonthlyEmployeeSummary & {
                    _dateCounts: Map<string, number>;
                    _presentDates: Set<string>;
                    _absentDates: Set<string>;
                    _leaveDates: Set<string>;
                }
            >();
            for (const r of records) {
                let entry = byEmployee.get(r.employeeId);
                if (!entry) {
                    entry = {
                        employeeId: r.employeeId,
                        employeeCode: r.employee.code,
                        employeeName: r.employee.name,
                        daysPresent: 0,
                        daysAbsent: 0,
                        daysOnLeave: 0,
                        totalActualHours: 0,
                        totalOvertimeHours: 0,
                        multiShiftDays: 0,
                        _dateCounts: new Map(),
                        _presentDates: new Set(),
                        _absentDates: new Set(),
                        _leaveDates: new Set(),
                    };
                    byEmployee.set(r.employeeId, entry);
                }

                const dateKey = r.workDate.toISOString().slice(0, 10);
                const prevCount = entry._dateCounts.get(dateKey) ?? 0;
                entry._dateCounts.set(dateKey, prevCount + 1);

                if (r.status === 'PRESENT') {
                    entry._presentDates.add(dateKey);
                    entry.totalActualHours += r.actualHours
                        ? Number(r.actualHours)
                        : 0;
                    entry.totalOvertimeHours += r.overtimeHours
                        ? Number(r.overtimeHours)
                        : 0;
                } else if (r.status === 'ABSENT') {
                    entry._absentDates.add(dateKey);
                } else if (r.status === 'ON_LEAVE') {
                    entry._leaveDates.add(dateKey);
                }
            }

            const round2 = (n: number) => Math.round(n * 100) / 100;
            return Array.from(byEmployee.values()).map((s) => {
                const multiShiftDays = Array.from(s._dateCounts.values()).filter(
                    (c) => c > 1,
                ).length;
                return {
                    employeeId: s.employeeId,
                    employeeCode: s.employeeCode,
                    employeeName: s.employeeName,
                    daysPresent: s._presentDates.size,
                    daysAbsent: s._absentDates.size,
                    daysOnLeave: s._leaveDates.size,
                    totalActualHours: round2(s.totalActualHours),
                    totalOvertimeHours: round2(s.totalOvertimeHours),
                    multiShiftDays,
                };
            });
        },
    };
}
