import {
    PrismaClient,
    AttendanceSource,
    AttendanceStatus,
} from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { verifyPin } from './pin-helpers';
import {
    resolveWorkDate,
    getEffectivePlannedHours,
    calcActualHours,
    calcOvertimeHours,
} from './shift-window';
import { Prisma } from '@prisma/client';
import { isValidAttendancePhotoUrl } from '@/lib/media/attendance-photo-url';
import {
    resolveGeofence,
    resolveGeofenceMode,
    measureObservedDistance,
    validateLocation,
    type LocationEvidence,
    type GeofenceResult,
} from './attendance-location';
import { serializeGeofenceForStorage } from './attendance-location-storage';
import { isValidCoordinate } from '@/lib/utils/geo';
import {
    isOvernightShift,
    wibDateFrom,
    wibDateStringFrom,
} from './shift-window';

// ─── Input types ───

export interface KioskClockInInput {
    employeeCode: string;
    pin: string;
    workShiftId?: string;
    /** Required when source is KIOSK (default). */
    clockInPhotoUrl?: string;
    source?: AttendanceSource;
    /** Optional geofence evidence for kiosk. */
    locationEvidence?: LocationEvidence;
}

export interface KioskClockOutInput {
    employeeCode: string;
    pin: string;
    /** Optional evidence photo on clock-out. */
    clockOutPhotoUrl?: string;
    /** Optional geofence evidence for kiosk. */
    locationEvidence?: LocationEvidence;
}

/** Input for admin manual operations — no PIN required. */
export interface AdminClockInInput {
    employeeCode: string;
    workShiftId: string;
    source?: AttendanceSource;
}

export interface AdminClockOutInput {
    employeeCode: string;
}

/** Input for self-service operations — employeeId from session, no PIN. */
export interface SelfServiceClockInInput {
    employeeId: string;
    clockInPhotoUrl: string;
    locationEvidence: LocationEvidence;
}

export interface SelfServiceClockOutInput {
    employeeId: string;
    clockOutPhotoUrl?: string;
    locationEvidence: LocationEvidence;
}

export interface AttendanceRecordResult {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    workDate: Date;
    workShiftId: string;
    shiftName: string;
    clockInAt: Date | null;
    clockOutAt: Date | null;
    isOvertimeShift: boolean;
    plannedHours: number;
    actualHours: number | null;
    overtimeHours: number;
    regularHours: number;
    status: AttendanceStatus;
    source: AttendanceSource;
    dailyRateSnapshot: number;
    overtimeRateSnapshot: number;
    dailyEarnings: number;
    overtimeEarnings: number;
    totalEarnings: number;
    clockInPhotoUrl: string | null;
    clockOutPhotoUrl: string | null;
    clockInLatitude: number | null;
    clockInLongitude: number | null;
    clockInAccuracy: number | null;
    clockInDistance: number | null;
    clockOutLatitude: number | null;
    clockOutLongitude: number | null;
    clockOutAccuracy: number | null;
    clockOutDistance: number | null;
}

export interface DailySummary {
    date: Date;
    totalEmployees: number;
    totalRecords: number;
    multiShiftCount: number;
    totalActualHours: number;
    totalOvertimeHours: number;
    totalDailyEarnings: number;
    totalOvertimeEarnings: number;
    totalEarnings: number;
    records: AttendanceRecordResult[];
}

// Fase 3 — per-employee aggregate for weekly recap.
export interface WeeklyEmployeeSummary {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    daysPresent: number;
    totalActualHours: number;
    totalOvertimeHours: number;
    totalDailyEarnings: number;
    totalOvertimeEarnings: number;
    totalEarnings: number;
}

// Gelombang A1 — per-employee aggregate for monthly recap.
export interface MonthlyEmployeeSummary {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    daysPresent: number;
    daysAbsent: number;
    daysOnLeave: number;
    totalActualHours: number;
    totalOvertimeHours: number;
    multiShiftDays: number;
}

export interface ListFilters {
    workShiftId?: string;
    overtimeOnly?: boolean;
}

// ─── Helpers ───

type EmployeeSelect = {
    id: string;
    name: string;
    code: string;
    pinHash: string | null;
    status: string;
    payType: string;
    dailyRate: Prisma.Decimal;
    overtimeHourlyRate: Prisma.Decimal | null;
    standardDayHours: Prisma.Decimal;
};
type ShiftSelect = {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    plannedHours: Prisma.Decimal | null;
    status: string;
};
type RecordWithRelations = {
    id: string;
    employeeId: string;
    workDate: Date;
    workShiftId: string;
    clockInAt: Date | null;
    clockOutAt: Date | null;
    isOvertimeShift: boolean;
    status: AttendanceStatus;
    source: AttendanceSource;
    plannedHours: Prisma.Decimal | null;
    actualHours: Prisma.Decimal | null;
    regularHours: Prisma.Decimal | null;
    overtimeHours: Prisma.Decimal | null;
    standardDayHours: Prisma.Decimal | null;
    dailyRateSnapshot: Prisma.Decimal | null;
    overtimeRateSnapshot: Prisma.Decimal | null;
    dailyEarnings: Prisma.Decimal | null;
    overtimeEarnings: Prisma.Decimal | null;
    totalEarnings: Prisma.Decimal | null;
    clockInPhotoUrl: string | null;
    clockOutPhotoUrl: string | null;
    clockInLatitude: Prisma.Decimal | null;
    clockInLongitude: Prisma.Decimal | null;
    clockInAccuracy: Prisma.Decimal | null;
    clockInDistance: Prisma.Decimal | null;
    clockOutLatitude: Prisma.Decimal | null;
    clockOutLongitude: Prisma.Decimal | null;
    clockOutAccuracy: Prisma.Decimal | null;
    clockOutDistance: Prisma.Decimal | null;
    employee: { name: string; code: string };
    workShift: ShiftSelect;
};

function toNum(v: Prisma.Decimal | null | undefined): number {
    return v ? Number(v) : 0;
}

async function findEmployee(
    db: PrismaClient,
    code: string,
): Promise<EmployeeSelect | null> {
    return db.employee.findUnique({
        where: { code },
        select: {
            id: true,
            name: true,
            code: true,
            pinHash: true,
            status: true,
            payType: true,
            dailyRate: true,
            overtimeHourlyRate: true,
            standardDayHours: true,
        },
    });
}

async function findShift(
    db: PrismaClient,
    shiftId: string,
): Promise<ShiftSelect | null> {
    return db.workShift.findUnique({
        where: { id: shiftId },
        select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            plannedHours: true,
            status: true,
        },
    });
}

function calcRegularHours(actualHours: number, plannedHours: number): number {
    return Math.round(Math.min(actualHours, plannedHours) * 100) / 100;
}

function computeEarnings(
    actualHours: number,
    plannedHours: number,
    standardDayHours: number,
    dailyRate: number,
    overtimeHourlyRate: number,
): {
    regularHours: number;
    overtimeHours: number;
    dailyEarnings: number;
    overtimeEarnings: number;
    totalEarnings: number;
} {
    const regular = calcRegularHours(actualHours, plannedHours);
    const overtime = calcOvertimeHours(actualHours, plannedHours);
    const dailyEarnings =
        Math.round(dailyRate * (regular / standardDayHours) * 100) / 100;
    const overtimeEarnings =
        Math.round(overtime * overtimeHourlyRate * 100) / 100;
    return {
        regularHours: regular,
        overtimeHours: overtime,
        dailyEarnings,
        overtimeEarnings,
        totalEarnings: dailyEarnings + overtimeEarnings,
    };
}

const OVERTIME_MULTIPLIER = 1.5;
function defaultOvertimeHourlyRate(
    dailyRate: number,
    standardDayHours: number,
): number {
    if (standardDayHours <= 0) return 0;
    return (
        Math.round((dailyRate / standardDayHours) * OVERTIME_MULTIPLIER * 100) /
        100
    );
}

function buildRecordResult(
    record: RecordWithRelations,
): AttendanceRecordResult {
    const shift = record.workShift;
    const planned = getEffectivePlannedHours(
        toNum(shift.plannedHours),
        shift.startTime,
        shift.endTime,
    );
    const actual =
        record.clockInAt && record.clockOutAt
            ? calcActualHours(record.clockInAt, record.clockOutAt)
            : null;
    const standardDayHours =
        toNum(record.standardDayHours) > 0 ? toNum(record.standardDayHours) : 8;
    const dailyRate = toNum(record.dailyRateSnapshot);
    const overtimeRate =
        toNum(record.overtimeRateSnapshot) > 0
            ? toNum(record.overtimeRateSnapshot)
            : defaultOvertimeHourlyRate(dailyRate, standardDayHours);

    let regular = toNum(record.regularHours);
    let overtime = toNum(record.overtimeHours);
    let dailyEarnings = toNum(record.dailyEarnings);
    let overtimeEarnings = toNum(record.overtimeEarnings);

    if (actual !== null) {
        const computed = computeEarnings(
            actual,
            planned,
            standardDayHours,
            dailyRate,
            overtimeRate,
        );
        regular = computed.regularHours;
        overtime = computed.overtimeHours;
        dailyEarnings = computed.dailyEarnings;
        overtimeEarnings = computed.overtimeEarnings;
    }

    return {
        id: record.id,
        employeeId: record.employeeId,
        employeeName: record.employee.name,
        employeeCode: record.employee.code,
        workDate: record.workDate,
        workShiftId: record.workShiftId,
        shiftName: shift.name,
        clockInAt: record.clockInAt,
        clockOutAt: record.clockOutAt,
        isOvertimeShift: record.isOvertimeShift,
        plannedHours: planned,
        actualHours: actual,
        overtimeHours: overtime,
        regularHours: regular,
        status: record.status,
        source: record.source,
        dailyRateSnapshot: dailyRate,
        overtimeRateSnapshot: overtimeRate,
        dailyEarnings,
        overtimeEarnings,
        totalEarnings: dailyEarnings + overtimeEarnings,
        clockInPhotoUrl: record.clockInPhotoUrl ?? null,
        clockOutPhotoUrl: record.clockOutPhotoUrl ?? null,
        clockInLatitude: record.clockInLatitude
            ? Number(record.clockInLatitude)
            : null,
        clockInLongitude: record.clockInLongitude
            ? Number(record.clockInLongitude)
            : null,
        clockInAccuracy: record.clockInAccuracy
            ? Number(record.clockInAccuracy)
            : null,
        clockInDistance: record.clockInDistance
            ? Number(record.clockInDistance)
            : null,
        clockOutLatitude: record.clockOutLatitude
            ? Number(record.clockOutLatitude)
            : null,
        clockOutLongitude: record.clockOutLongitude
            ? Number(record.clockOutLongitude)
            : null,
        clockOutAccuracy: record.clockOutAccuracy
            ? Number(record.clockOutAccuracy)
            : null,
        clockOutDistance: record.clockOutDistance
            ? Number(record.clockOutDistance)
            : null,
    };
}

type AttendanceComputedData = {
    plannedHours: Prisma.Decimal;
    actualHours: Prisma.Decimal | null;
    regularHours: Prisma.Decimal;
    overtimeHours: Prisma.Decimal;
    standardDayHours: Prisma.Decimal;
    dailyEarnings: Prisma.Decimal;
    overtimeEarnings: Prisma.Decimal;
    totalEarnings: Prisma.Decimal;
};

function buildComputedData(
    record: RecordWithRelations,
): AttendanceComputedData {
    const shift = record.workShift;
    const planned = getEffectivePlannedHours(
        toNum(shift.plannedHours),
        shift.startTime,
        shift.endTime,
    );
    const standardDayHours =
        toNum(record.standardDayHours) > 0 ? toNum(record.standardDayHours) : 8;
    const actual =
        record.clockInAt && record.clockOutAt
            ? calcActualHours(record.clockInAt, record.clockOutAt)
            : null;
    if (actual === null || record.status !== 'PRESENT') {
        return {
            plannedHours: new Prisma.Decimal(planned),
            actualHours: null,
            regularHours: new Prisma.Decimal(0),
            overtimeHours: new Prisma.Decimal(0),
            standardDayHours: new Prisma.Decimal(standardDayHours),
            dailyEarnings: new Prisma.Decimal(0),
            overtimeEarnings: new Prisma.Decimal(0),
            totalEarnings: new Prisma.Decimal(0),
        };
    }
    const dailyRate = toNum(record.dailyRateSnapshot);
    const overtimeRate =
        toNum(record.overtimeRateSnapshot) > 0
            ? toNum(record.overtimeRateSnapshot)
            : defaultOvertimeHourlyRate(dailyRate, standardDayHours);
    const computed = computeEarnings(
        actual,
        planned,
        standardDayHours,
        dailyRate,
        overtimeRate,
    );
    return {
        plannedHours: new Prisma.Decimal(planned),
        actualHours: new Prisma.Decimal(actual),
        regularHours: new Prisma.Decimal(computed.regularHours),
        overtimeHours: new Prisma.Decimal(computed.overtimeHours),
        standardDayHours: new Prisma.Decimal(standardDayHours),
        dailyEarnings: new Prisma.Decimal(computed.dailyEarnings),
        overtimeEarnings: new Prisma.Decimal(computed.overtimeEarnings),
        totalEarnings: new Prisma.Decimal(computed.totalEarnings),
    };
}

function getEmployeeRateSnapshots(employee: EmployeeSelect): {
    dailyRate: number;
    overtimeHourlyRate: number;
    standardDayHours: number;
} {
    const standardDayHours =
        toNum(employee.standardDayHours) > 0
            ? toNum(employee.standardDayHours)
            : 8;
    // PIECE workers still record hours for discipline, but attendance does not pay.
    if (employee.payType === 'PIECE') {
        return { dailyRate: 0, overtimeHourlyRate: 0, standardDayHours };
    }
    const dailyRate = toNum(employee.dailyRate);
    const overtimeHourlyRate =
        toNum(employee.overtimeHourlyRate) > 0
            ? toNum(employee.overtimeHourlyRate)
            : defaultOvertimeHourlyRate(dailyRate, standardDayHours);
    return { dailyRate, overtimeHourlyRate, standardDayHours };
}

const includeRelations = {
    employee: { select: { name: true, code: true } },
    workShift: true,
} as const;

// ─── Geofence enforcement (self-service) ───

/**
 * Fail-closed geofence gate for self-service clock-in/out.
 *
 * Returns the validation result when the fence is active (caller needs its
 * distance), or null when geofencing is switched off. A config that is enabled
 * but incomplete throws — it must never degrade into "no geofence".
 *
 * The explicit `GeofenceResult | null` return type is load-bearing: it excludes
 * `undefined`, so under `strict` a future resolution kind that falls through the
 * switch is a compile error rather than a silent bypass. The `never` default
 * catches the same mistake with a clearer message.
 */
function enforceGeofence(
    settings: Record<string, string | null | undefined>,
    evidence: LocationEvidence,
): GeofenceResult | null {
    const resolution = resolveGeofence(settings);
    switch (resolution.kind) {
        case 'disabled':
            return null;
        case 'invalid':
            throw new BusinessRuleError(
                'Konfigurasi geofence belum lengkap. Hubungi HRD.',
            );
        case 'active': {
            const result = validateLocation(resolution.config, evidence);
            if (!result.withinFence) {
                throw new BusinessRuleError(
                    result.reason ?? 'Lokasi di luar area kerja',
                );
            }
            return result;
        }
        default: {
            // Statically unreachable — the `never` assignment above is what
            // actually catches a new resolution kind, at compile time. This
            // throw only guarantees the runtime also fails closed.
            const exhaustive: never = resolution;
            void exhaustive;
            throw new BusinessRuleError(
                'Konfigurasi geofence tidak dikenali. Hubungi HRD.',
            );
        }
    }
}

/**
 * Single decision point for every clock path: measure, and gate only when the
 * mode says to. Returns the distance in meters to persist, or null when none
 * could be measured.
 *
 * In `observe` mode this never throws — not for missing evidence, not for an
 * incomplete fence, not for a position far outside the radius. Enforcement was
 * previously switched on with an untested radius and blocked every employee for
 * ~13 hours; observation is the mode that collects the evidence to pick that
 * radius, so it is only safe to leave running if it cannot reject anyone.
 *
 * In `off` and `enforce` the behaviour is exactly what it was before this
 * function existed.
 */
function gateOrObserveLocation(
    settings: Record<string, string | null | undefined>,
    evidence: LocationEvidence | undefined,
): number | null {
    if (resolveGeofenceMode(settings) === 'observe') {
        return measureObservedDistance(settings, evidence);
    }

    // A fence that is active but received no evidence must fail closed with an
    // actionable message, not a TypeError from reading an undefined object.
    if (resolveGeofence(settings).kind === 'active' && !evidence) {
        throw new BusinessRuleError(
            'Lokasi GPS wajib untuk absensi. Aktifkan izin lokasi di browser kiosk.',
        );
    }

    const result = enforceGeofence(
        settings,
        evidence ?? { latitude: NaN, longitude: NaN, accuracy: NaN },
    );
    return result ? result.distanceMeters : null;
}

/** Distance column writer — shared so the null/non-finite rule lives in one place. */
function toDistanceDecimal(meters: number | null): Prisma.Decimal | null {
    if (meters === null || !Number.isFinite(meters)) return null;
    return new Prisma.Decimal(meters.toFixed(2));
}

/**
 * Location evidence is recorded for audit independently of whether the fence is
 * enforced. It arrives over the wire from a browser, so the compile-time type is
 * not a runtime guarantee — a non-finite accuracy would otherwise reach
 * `toFixed()` and write NaN into a Decimal column. Bad evidence is dropped, not
 * thrown on: when geofencing is off, location is an audit nicety and must not
 * block attendance.
 */
function toStoredLocation(evidence: LocationEvidence) {
    if (!isValidCoordinate(evidence.latitude, evidence.longitude)) return null;
    if (!Number.isFinite(evidence.accuracy)) return null;
    return serializeGeofenceForStorage(evidence);
}

// ─── Core service ───

export const AttendanceService = {
    /**
     * Kiosk clock-in. Handles multi-shift overtime detection.
     */
    async clockIn(
        db: PrismaClient,
        input: KioskClockInInput,
        settings: Record<string, string | null | undefined>,
    ): Promise<AttendanceRecordResult> {
        const employee = await findEmployee(db, input.employeeCode);
        if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        const pinValid = await verifyPin(input.pin, employee.pinHash);
        if (!pinValid) throw new BusinessRuleError('PIN salah');

        const source = input.source ?? 'KIOSK';
        if (source === 'KIOSK') {
            if (!input.clockInPhotoUrl?.trim()) {
                throw new BusinessRuleError('Data absensi tidak lengkap');
            }
            if (!isValidAttendancePhotoUrl(input.clockInPhotoUrl)) {
                throw new BusinessRuleError('Foto absensi tidak valid');
            }
        }

        // MANUAL (admin) source never carries GPS and must not be gated or
        // measured; only the kiosk path goes through the fence.
        const clockInDistanceMeters =
            source === 'KIOSK'
                ? gateOrObserveLocation(settings, input.locationEvidence)
                : null;

        let resolvedWorkShiftId = input.workShiftId?.trim();
        if (!resolvedWorkShiftId) {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const assignment = await db.employeeShiftAssignment.findFirst({
                where: {
                    employeeId: employee.id,
                    effectiveFrom: { lte: today },
                    OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: today } },
                    ],
                },
                select: { workShiftId: true },
                orderBy: { effectiveFrom: 'desc' },
            });

            if (assignment) {
                resolvedWorkShiftId = assignment.workShiftId;
            } else {
                const activeShifts = await db.workShift.findMany({
                    where: { status: 'ACTIVE' },
                    orderBy: { startTime: 'asc' },
                });
                if (activeShifts.length === 0) {
                    throw new BusinessRuleError(
                        'Tidak ada shift aktif terdaftar di sistem.',
                    );
                }
                resolvedWorkShiftId = activeShifts[0].id;
            }
        }

        const shift = await findShift(db, resolvedWorkShiftId);
        if (!shift) throw new NotFoundError('Shift tidak ditemukan');
        if (shift.status !== 'ACTIVE')
            throw new BusinessRuleError('Shift tidak aktif');

        const now = new Date();
        const workDate = resolveWorkDate(now, shift.startTime, shift.endTime);

        // Check for open session (any shift, same date)
        const openSession = await db.attendanceRecord.findFirst({
            where: {
                employeeId: employee.id,
                workDate,
                clockInAt: { not: null },
                clockOutAt: null,
            },
        });
        if (openSession) {
            const openShift = await findShift(db, openSession.workShiftId);
            throw new BusinessRuleError(
                `Masih belum clock-out shift ${openShift?.name ?? ''}. Pulang dulu sebelum masuk shift berikutnya.`,
            );
        }

        // Check duplicate shift
        const existing = await db.attendanceRecord.findUnique({
            where: {
                employeeId_workDate_workShiftId: {
                    employeeId: employee.id,
                    workDate,
                    workShiftId: resolvedWorkShiftId,
                },
            },
        });
        if (existing)
            throw new BusinessRuleError('Sudah absen shift ini hari ini');

        // Determine if overtime shift (2nd+ shift on same day)
        const sameDayCount = await db.attendanceRecord.count({
            where: { employeeId: employee.id, workDate, status: 'PRESENT' },
        });

        const rates = getEmployeeRateSnapshots(employee);
        const planned = getEffectivePlannedHours(
            toNum(shift.plannedHours),
            shift.startTime,
            shift.endTime,
        );

        const clockInGeoData = input.locationEvidence
            ? toStoredLocation(input.locationEvidence)
            : null;

        const record = await db.attendanceRecord.create({
            data: {
                employeeId: employee.id,
                workDate,
                workShiftId: resolvedWorkShiftId,
                clockInAt: now,
                isOvertimeShift: sameDayCount > 0,
                source,
                status: 'PRESENT',
                clockInPhotoUrl: input.clockInPhotoUrl?.trim() || null,
                clockInLatitude: clockInGeoData?.latitude ?? null,
                clockInLongitude: clockInGeoData?.longitude ?? null,
                clockInAccuracy: clockInGeoData?.accuracy ?? null,
                clockInDistance: toDistanceDecimal(clockInDistanceMeters),
                plannedHours: new Prisma.Decimal(planned),
                standardDayHours: new Prisma.Decimal(rates.standardDayHours),
                dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
                overtimeRateSnapshot: new Prisma.Decimal(
                    rates.overtimeHourlyRate,
                ),
                regularHours: new Prisma.Decimal(0),
                overtimeHours: new Prisma.Decimal(0),
                dailyEarnings: new Prisma.Decimal(0),
                overtimeEarnings: new Prisma.Decimal(0),
                totalEarnings: new Prisma.Decimal(0),
            },
            include: includeRelations,
        });

        return buildRecordResult(record as unknown as RecordWithRelations);
    },

    async _resolveOpenRecordForClockOut(
        db: PrismaClient,
        employeeId: string,
    ): Promise<
        (RecordWithRelations & { isStale?: boolean; staleDate?: string }) | null
    > {
        const now = new Date();
        const todayWibStr = wibDateStringFrom(now);

        // All open records, newest first
        const allOpen = (await db.attendanceRecord.findMany({
            where: { employeeId, clockInAt: { not: null }, clockOutAt: null },
            include: includeRelations,
            orderBy: { clockInAt: 'desc' },
        })) as unknown as RecordWithRelations[];

        if (allOpen.length === 0) return null;
        if (allOpen.length === 1) {
            const rec = allOpen[0];
            const workDateStr = (rec.workDate as Date)
                .toISOString()
                .slice(0, 10);
            const elapsedHours =
                (now.getTime() - new Date(rec.clockInAt as Date).getTime()) /
                (1000 * 60 * 60);
            const isStale = workDateStr !== todayWibStr && elapsedHours > 20;
            return {
                ...rec,
                isStale: isStale || undefined,
                staleDate: isStale ? workDateStr : undefined,
            };
        }

        // Prefer record whose workDate matches today WIB, or overnight shift that started yesterday
        const todayMatch = allOpen.filter((r) => {
            const wd = (r.workDate as Date).toISOString().slice(0, 10);
            if (wd === todayWibStr) return true;
            // Overnight: clock-in late night yesterday, still open early today — workDate = yesterday
            const shift = (
                r as { workShift?: { startTime: string; endTime: string } }
            ).workShift;
            if (shift && isOvernightShift(shift.startTime, shift.endTime)) {
                const clockInStr = wibDateStringFrom(
                    new Date(r.clockInAt as Date),
                );
                // If clocked in today WIB but workDate is yesterday due to overnight logic, it's valid today
                if (clockInStr === todayWibStr) return true;
            }
            return false;
        });

        if (todayMatch.length > 0) {
            return todayMatch[0];
        }

        // No today match — we have only stale records. Return newest stale with flag.
        const newest = allOpen[0];
        const staleDate = (newest.workDate as Date).toISOString().slice(0, 10);
        return {
            ...newest,
            isStale: true,
            staleDate,
        };
    },

    /**
     * Kiosk clock-out.
     */
    async clockOut(
        db: PrismaClient,
        input: KioskClockOutInput,
        settings: Record<string, string | null | undefined>,
    ): Promise<AttendanceRecordResult> {
        const employee = await findEmployee(db, input.employeeCode);
        if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        const pinValid = await verifyPin(input.pin, employee.pinHash);
        if (!pinValid) throw new BusinessRuleError('PIN salah');

        // This method has no MANUAL variant (clockOutAsAdmin is separate), so
        // the fence always applies here.
        const clockOutDistanceMeters = gateOrObserveLocation(
            settings,
            input.locationEvidence,
        );

        const openRecord =
            await AttendanceService._resolveOpenRecordForClockOut(
                db,
                employee.id,
            );
        if (!openRecord)
            throw new BusinessRuleError(
                'Tidak ada sesi absensi yang masih terbuka',
            );

        if (openRecord.isStale) {
            const d = openRecord.staleDate ?? '?';
            throw new BusinessRuleError(
                `Sesi absensi tanggal ${d} masih terbuka dan perlu koreksi HRD. Hubungi HRD untuk menutup sesi lama tersebut.`,
            );
        }

        if (
            input.clockOutPhotoUrl?.trim() &&
            !isValidAttendancePhotoUrl(input.clockOutPhotoUrl)
        ) {
            throw new BusinessRuleError('Foto absensi tidak valid');
        }

        const now = new Date();
        const clockOutGeoData = input.locationEvidence
            ? toStoredLocation(input.locationEvidence)
            : null;

        const updated = await db.attendanceRecord.update({
            where: { id: openRecord.id },
            data: {
                clockOutAt: now,
                ...(input.clockOutPhotoUrl?.trim()
                    ? { clockOutPhotoUrl: input.clockOutPhotoUrl.trim() }
                    : {}),
                clockOutLatitude: clockOutGeoData?.latitude ?? null,
                clockOutLongitude: clockOutGeoData?.longitude ?? null,
                clockOutAccuracy: clockOutGeoData?.accuracy ?? null,
                clockOutDistance: toDistanceDecimal(clockOutDistanceMeters),
            },
            include: includeRelations,
        });

        const computed = buildComputedData(
            updated as unknown as RecordWithRelations,
        );
        const finalized = await db.attendanceRecord.update({
            where: { id: updated.id },
            data: computed,
            include: includeRelations,
        });

        return buildRecordResult(finalized as unknown as RecordWithRelations);
    },

    /**
     * Admin manual clock-in — skips PIN verification.
     */
    async clockInAsAdmin(
        db: PrismaClient,
        input: AdminClockInInput,
    ): Promise<AttendanceRecordResult> {
        const employee = await findEmployee(db, input.employeeCode);
        if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        const shift = await findShift(db, input.workShiftId);
        if (!shift) throw new NotFoundError('Shift tidak ditemukan');
        if (shift.status !== 'ACTIVE')
            throw new BusinessRuleError('Shift tidak aktif');

        const now = new Date();
        const workDate = resolveWorkDate(now, shift.startTime, shift.endTime);

        const openSession = await db.attendanceRecord.findFirst({
            where: {
                employeeId: employee.id,
                workDate,
                clockInAt: { not: null },
                clockOutAt: null,
            },
        });
        if (openSession) {
            const openShift = await findShift(db, openSession.workShiftId);
            throw new BusinessRuleError(
                `Masih belum clock-out shift ${openShift?.name ?? ''}. Pulang dulu sebelum masuk shift berikutnya.`,
            );
        }

        const existing = await db.attendanceRecord.findUnique({
            where: {
                employeeId_workDate_workShiftId: {
                    employeeId: employee.id,
                    workDate,
                    workShiftId: input.workShiftId,
                },
            },
        });
        if (existing)
            throw new BusinessRuleError('Sudah absen shift ini hari ini');

        const sameDayCount = await db.attendanceRecord.count({
            where: { employeeId: employee.id, workDate, status: 'PRESENT' },
        });

        const rates = getEmployeeRateSnapshots(employee);
        const planned = getEffectivePlannedHours(
            toNum(shift.plannedHours),
            shift.startTime,
            shift.endTime,
        );

        const record = await db.attendanceRecord.create({
            data: {
                employeeId: employee.id,
                workDate,
                workShiftId: input.workShiftId,
                clockInAt: now,
                isOvertimeShift: sameDayCount > 0,
                source: input.source ?? 'MANUAL',
                status: 'PRESENT',
                plannedHours: new Prisma.Decimal(planned),
                standardDayHours: new Prisma.Decimal(rates.standardDayHours),
                dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
                overtimeRateSnapshot: new Prisma.Decimal(
                    rates.overtimeHourlyRate,
                ),
                regularHours: new Prisma.Decimal(0),
                overtimeHours: new Prisma.Decimal(0),
                dailyEarnings: new Prisma.Decimal(0),
                overtimeEarnings: new Prisma.Decimal(0),
                totalEarnings: new Prisma.Decimal(0),
            },
            include: includeRelations,
        });

        return buildRecordResult(record as unknown as RecordWithRelations);
    },

    /**
     * Admin manual clock-out — skips PIN verification.
     * Uses same stale-aware resolver but admin can still close stale via correct() flow.
     * Here we intentionally allow stale close when admin explicitly calls this.
     */
    async clockOutAsAdmin(
        db: PrismaClient,
        input: AdminClockOutInput,
    ): Promise<AttendanceRecordResult> {
        const employee = await findEmployee(db, input.employeeCode);
        if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        const openRecord = await db.attendanceRecord.findFirst({
            where: {
                employeeId: employee.id,
                clockInAt: { not: null },
                clockOutAt: null,
            },
            include: includeRelations,
            orderBy: { clockInAt: 'desc' },
        });
        if (!openRecord)
            throw new BusinessRuleError(
                'Tidak ada sesi absensi yang masih terbuka',
            );

        const now = new Date();
        const updated = await db.attendanceRecord.update({
            where: { id: openRecord.id },
            data: { clockOutAt: now },
            include: includeRelations,
        });

        const computed = buildComputedData(
            updated as unknown as RecordWithRelations,
        );
        const finalized = await db.attendanceRecord.update({
            where: { id: updated.id },
            data: computed,
            include: includeRelations,
        });

        return buildRecordResult(finalized as unknown as RecordWithRelations);
    },

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

    /**
     * Set employee attendance as ABSENT (manual only).
     */
    async setAbsent(
        db: PrismaClient,
        employeeId: string,
        workDate: Date,
        workShiftId: string,
        notes?: string,
    ): Promise<AttendanceRecordResult> {
        const existing = await db.attendanceRecord.findUnique({
            where: {
                employeeId_workDate_workShiftId: {
                    employeeId,
                    workDate,
                    workShiftId,
                },
            },
        });
        if (existing)
            throw new BusinessRuleError('Record sudah ada untuk shift ini');

        const employee = await db.employee.findUnique({
            where: { id: employeeId },
            select: {
                name: true,
                code: true,
                payType: true,
                dailyRate: true,
                overtimeHourlyRate: true,
                standardDayHours: true,
            },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        const shift = await findShift(db, workShiftId);
        if (!shift) throw new NotFoundError('Shift tidak ditemukan');

        const rates = getEmployeeRateSnapshots({
            id: employeeId,
            pinHash: null,
            status: 'ACTIVE',
            ...employee,
        } as EmployeeSelect);
        const planned = getEffectivePlannedHours(
            toNum(shift.plannedHours),
            shift.startTime,
            shift.endTime,
        );

        const record = await db.attendanceRecord.create({
            data: {
                employeeId,
                workDate,
                workShiftId,
                status: 'ABSENT',
                source: 'MANUAL',
                notes,
                plannedHours: new Prisma.Decimal(planned),
                standardDayHours: new Prisma.Decimal(rates.standardDayHours),
                dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
                overtimeRateSnapshot: new Prisma.Decimal(
                    rates.overtimeHourlyRate,
                ),
                regularHours: new Prisma.Decimal(0),
                overtimeHours: new Prisma.Decimal(0),
                dailyEarnings: new Prisma.Decimal(0),
                overtimeEarnings: new Prisma.Decimal(0),
                totalEarnings: new Prisma.Decimal(0),
            },
            include: includeRelations,
        });

        return buildRecordResult(record as unknown as RecordWithRelations);
    },

    /**
     * Correct an attendance record (admin edit).
     */
    async correct(
        db: PrismaClient,
        recordId: string,
        data: { clockInAt?: Date; clockOutAt?: Date; notes?: string },
    ): Promise<AttendanceRecordResult> {
        const record = await db.attendanceRecord.findUnique({
            where: { id: recordId },
            include: includeRelations,
        });
        if (!record) throw new NotFoundError('Record tidak ditemukan');

        const updated = await db.attendanceRecord.update({
            where: { id: recordId },
            data,
            include: includeRelations,
        });
        const computed = buildComputedData(
            updated as unknown as RecordWithRelations,
        );
        const finalized = await db.attendanceRecord.update({
            where: { id: updated.id },
            data: computed,
            include: includeRelations,
        });
        return buildRecordResult(finalized as unknown as RecordWithRelations);
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
            existing.daysPresent += 1;
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

    // ─────────────────────────────────────────────────────────────
    // Self-service: clock-in/clock-out from employee portal
    // ─────────────────────────────────────────────────────────────

    /**
     * Self-service clock-in. Employee identity from session, shift from assignment.
     * Geofence and photo required. No PIN needed (already authenticated).
     */
    async clockInSelfService(
        db: PrismaClient,
        input: SelfServiceClockInInput,
        settings: Record<string, string | null | undefined>,
    ): Promise<AttendanceRecordResult> {
        const employee = await db.employee.findUnique({
            where: { id: input.employeeId },
            select: {
                id: true,
                name: true,
                code: true,
                pinHash: true,
                status: true,
                payType: true,
                dailyRate: true,
                overtimeHourlyRate: true,
                standardDayHours: true,
            },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        // Validate photo
        if (!input.clockInPhotoUrl?.trim()) {
            throw new BusinessRuleError('Foto absensi wajib');
        }
        if (!isValidAttendancePhotoUrl(input.clockInPhotoUrl)) {
            throw new BusinessRuleError('Foto absensi tidak valid');
        }

        // Geofence — fail-closed under `enforce`, measure-only under `observe`
        const clockInDistanceMeters = gateOrObserveLocation(
            settings,
            input.locationEvidence,
        );

        // Resolve active shift assignment
        const now = new Date();
        const today = new Date(now);
        today.setUTCHours(0, 0, 0, 0);

        const assignment = await db.employeeShiftAssignment.findFirst({
            where: {
                employeeId: employee.id,
                effectiveFrom: { lte: today },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
            },
            include: { workShift: true },
            orderBy: { effectiveFrom: 'desc' },
        });
        if (!assignment) {
            throw new BusinessRuleError(
                'HRD belum menetapkan shift untuk Anda. Silakan hubungi HRD.',
            );
        }

        const shift = assignment.workShift;
        if (shift.status !== 'ACTIVE')
            throw new BusinessRuleError('Shift tidak aktif');

        const workDate = resolveWorkDate(now, shift.startTime, shift.endTime);

        // Check for open session
        const openSession = await db.attendanceRecord.findFirst({
            where: {
                employeeId: employee.id,
                workDate,
                clockInAt: { not: null },
                clockOutAt: null,
            },
        });
        if (openSession) {
            const openShift = await findShift(db, openSession.workShiftId);
            throw new BusinessRuleError(
                `Masih belum clock-out shift ${openShift?.name ?? ''}. Pulang dulu sebelum masuk shift berikutnya.`,
            );
        }

        // Check duplicate shift
        const existing = await db.attendanceRecord.findUnique({
            where: {
                employeeId_workDate_workShiftId: {
                    employeeId: employee.id,
                    workDate,
                    workShiftId: assignment.workShiftId,
                },
            },
        });
        if (existing)
            throw new BusinessRuleError('Sudah absen shift ini hari ini');

        // Determine if overtime shift
        const sameDayCount = await db.attendanceRecord.count({
            where: { employeeId: employee.id, workDate, status: 'PRESENT' },
        });

        const rates = getEmployeeRateSnapshots(employee);
        const planned = getEffectivePlannedHours(
            toNum(shift.plannedHours),
            shift.startTime,
            shift.endTime,
        );

        const geoData = toStoredLocation(input.locationEvidence);

        const record = await db.attendanceRecord.create({
            data: {
                employeeId: employee.id,
                workDate,
                workShiftId: assignment.workShiftId,
                clockInAt: now,
                isOvertimeShift: sameDayCount > 0,
                source: 'SELF_SERVICE',
                status: 'PRESENT',
                clockInPhotoUrl: input.clockInPhotoUrl.trim(),
                clockInLatitude: geoData?.latitude ?? null,
                clockInLongitude: geoData?.longitude ?? null,
                clockInAccuracy: geoData?.accuracy ?? null,
                clockInDistance: toDistanceDecimal(clockInDistanceMeters),
                plannedHours: new Prisma.Decimal(planned),
                standardDayHours: new Prisma.Decimal(rates.standardDayHours),
                dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
                overtimeRateSnapshot: new Prisma.Decimal(
                    rates.overtimeHourlyRate,
                ),
                regularHours: new Prisma.Decimal(0),
                overtimeHours: new Prisma.Decimal(0),
                dailyEarnings: new Prisma.Decimal(0),
                overtimeEarnings: new Prisma.Decimal(0),
                totalEarnings: new Prisma.Decimal(0),
            },
            include: includeRelations,
        });

        return buildRecordResult(record as unknown as RecordWithRelations);
    },

    /**
     * Self-service clock-out. Employee identity from session.
     * Geofence required when configured.
     */
    async clockOutSelfService(
        db: PrismaClient,
        input: SelfServiceClockOutInput,
        settings: Record<string, string | null | undefined>,
    ): Promise<AttendanceRecordResult> {
        const employee = await db.employee.findUnique({
            where: { id: input.employeeId },
            select: { id: true, name: true, code: true, status: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
        if (employee.status !== 'ACTIVE')
            throw new BusinessRuleError('Karyawan tidak aktif');

        // Geofence — fail-closed under `enforce`, measure-only under `observe`
        const clockOutDistanceMeters = gateOrObserveLocation(
            settings,
            input.locationEvidence,
        );

        const openResolved =
            await AttendanceService._resolveOpenRecordForClockOut(
                db,
                employee.id,
            );
        if (!openResolved)
            throw new BusinessRuleError(
                'Tidak ada sesi absensi yang masih terbuka',
            );

        if (openResolved.isStale) {
            const d = openResolved.staleDate ?? '?';
            throw new BusinessRuleError(
                `Sesi absensi tanggal ${d} masih terbuka dan perlu koreksi HRD. Hubungi HRD untuk menutup sesi lama tersebut.`,
            );
        }

        const openRecord = openResolved as unknown as RecordWithRelations;

        if (
            input.clockOutPhotoUrl?.trim() &&
            !isValidAttendancePhotoUrl(input.clockOutPhotoUrl)
        ) {
            throw new BusinessRuleError('Foto absensi tidak valid');
        }

        const now = new Date();
        const geoData = toStoredLocation(input.locationEvidence);

        const updated = await db.attendanceRecord.update({
            where: { id: openRecord.id },
            data: {
                clockOutAt: now,
                ...(input.clockOutPhotoUrl?.trim()
                    ? { clockOutPhotoUrl: input.clockOutPhotoUrl.trim() }
                    : {}),
                clockOutLatitude: geoData?.latitude ?? null,
                clockOutLongitude: geoData?.longitude ?? null,
                clockOutAccuracy: geoData?.accuracy ?? null,
                clockOutDistance: toDistanceDecimal(clockOutDistanceMeters),
            },
            include: includeRelations,
        });

        const computed = buildComputedData(
            updated as unknown as RecordWithRelations,
        );
        const finalized = await db.attendanceRecord.update({
            where: { id: updated.id },
            data: computed,
            include: includeRelations,
        });

        return buildRecordResult(finalized as unknown as RecordWithRelations);
    },

    /**
     * Get today's attendance status for an employee (self-service dashboard).
     */
    async getMyTodayStatus(
        db: PrismaClient,
        employeeId: string,
    ): Promise<{
        status: 'NOT_CLOCKED_IN' | 'WORKING' | 'CLOCKED_OUT' | 'OPEN_STALE';
        record: AttendanceRecordResult | null;
        shiftName: string | null;
        staleDate?: string;
    }> {
        const now = new Date();
        const todayMidnight = new Date(now);
        todayMidnight.setUTCHours(0, 0, 0, 0);

        // Find active shift assignment
        const assignment = await db.employeeShiftAssignment.findFirst({
            where: {
                employeeId,
                effectiveFrom: { lte: todayMidnight },
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: todayMidnight } },
                ],
            },
            include: { workShift: true },
            orderBy: { effectiveFrom: 'desc' },
        });

        // Find all open records — needed to correctly detect stale vs today
        const allOpen = await db.attendanceRecord.findMany({
            where: {
                employeeId,
                clockInAt: { not: null },
                clockOutAt: null,
            },
            include: includeRelations,
            orderBy: { clockInAt: 'desc' },
        });

        // Find today's completed records.
        // IMPORTANT: must filter by workDate — without it, Prisma returns the
        // most recently *ever* completed record (ordered by clockOutAt desc),
        // which permanently reports CLOCKED_OUT for every subsequent day after
        // an employee's very first successful cycle and hides the clock-in
        // button with no visible error.
        const todayWorkDate = wibDateFrom(now);
        const todayRecord = await db.attendanceRecord.findFirst({
            where: {
                employeeId,
                workDate: todayWorkDate,
                clockInAt: { not: null },
                clockOutAt: { not: null },
            },
            include: includeRelations,
            orderBy: { clockOutAt: 'desc' },
        });

        if (allOpen.length > 0) {
            const resolved =
                await AttendanceService._resolveOpenRecordForClockOut(
                    db,
                    employeeId,
                );

            if (resolved && resolved.isStale) {
                return {
                    status: 'OPEN_STALE',
                    record: buildRecordResult(
                        resolved as unknown as RecordWithRelations,
                    ),
                    shiftName:
                        (resolved as unknown as RecordWithRelations).workShift
                            ?.name ?? null,
                    staleDate: resolved.staleDate,
                };
            }

            if (resolved) {
                return {
                    status: 'WORKING',
                    record: buildRecordResult(
                        resolved as unknown as RecordWithRelations,
                    ),
                    shiftName:
                        (resolved as unknown as RecordWithRelations).workShift
                            ?.name ?? null,
                };
            }

            // Fallback: first open as WORKING (overnight compat)
            const firstOpen = allOpen[0] as unknown as RecordWithRelations;
            return {
                status: 'WORKING',
                record: buildRecordResult(firstOpen),
                shiftName: firstOpen.workShift?.name ?? null,
            };
        }

        if (todayRecord) {
            return {
                status: 'CLOCKED_OUT',
                record: buildRecordResult(
                    todayRecord as unknown as RecordWithRelations,
                ),
                shiftName:
                    (todayRecord as unknown as RecordWithRelations).workShift
                        ?.name ?? null,
            };
        }

        return {
            status: 'NOT_CLOCKED_IN',
            record: null,
            shiftName: assignment?.workShift?.name ?? null,
        };
    },
};
