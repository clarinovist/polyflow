/**
 * Evaluasi per record + penyusunan pratinjau koreksi massal (tanpa akses DB).
 * Hitungan jam/upah memakai jalur yang sama dengan AttendanceService.correct()
 * (computeAttendanceFields), bukan rumus baru.
 */
import type { Prisma } from '@prisma/client';
import type {
    ClosurePolicy,
    ClosurePreview,
    ClosurePreviewRow,
} from '@/lib/hrd/stale-session-closure-constants';
import { computeAttendanceFields } from './attendance-service';
import {
    computeProposedClockOut,
    type FingerprintEntry,
} from './stale-session-closure-policy';
import { startOfWeek } from './week-range';

export const CLOSURE_INCLUDE = {
    employee: { select: { name: true, code: true, payType: true } },
    workShift: true,
} as const;

export type ClosureRow = Prisma.AttendanceRecordGetPayload<{
    include: typeof CLOSURE_INCLUDE;
}>;

export interface ClosureCandidate {
    id: string;
    /** `updatedAt` yang dilihat saat evaluasi; dipakai pada klaim atomik. */
    updatedAt: Date;
    proposedClockOutAt: Date;
    totalEarnings: number;
    previousTotalEarnings: number;
}

export interface ClosureEvaluation {
    row: ClosurePreviewRow;
    fingerprintEntry: FingerprintEntry;
    candidate?: ClosureCandidate;
}

const REASON_NOT_FOUND = 'Sesi tidak ditemukan';
const REASON_FUTURE_CLOCK_OUT =
    'Jam pulang usulan belum tercapai; coba lagi nanti atau tutup manual lewat Koreksi jam';
const REASON_NO_CLOCK_IN = 'Record tanpa jam masuk';
const WARNING_ZERO_RATE = 'Tarif harian 0: upah tetap Rp0';
const WARNING_PIECE =
    'Karyawan borongan (PIECE): tarif absensi 0, upah tetap Rp0';
const PLACEHOLDER = '-';
const CENTS = 100;

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
    value ? Number(value) : 0;
const round2 = (value: number): number => Math.round(value * CENTS) / CENTS;
const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

function baseRow(record: ClosureRow): ClosurePreviewRow {
    return {
        id: record.id,
        employeeId: record.employeeId,
        employeeName: record.employee.name,
        employeeCode: record.employee.code,
        workDate: dateOnly(record.workDate),
        weekStart: dateOnly(startOfWeek(record.workDate)),
        shiftName: record.workShift.name,
        clockInAt: record.clockInAt?.toISOString() ?? '',
        proposedClockOutAt: null,
        actualHours: null,
        regularHours: 0,
        overtimeHours: 0,
        earnings: 0,
        eligible: false,
    };
}

export function missingEvaluation(id: string): ClosureEvaluation {
    return {
        row: {
            id,
            employeeId: PLACEHOLDER,
            employeeName: PLACEHOLDER,
            employeeCode: PLACEHOLDER,
            workDate: '',
            weekStart: '',
            shiftName: PLACEHOLDER,
            clockInAt: '',
            proposedClockOutAt: null,
            actualHours: null,
            regularHours: 0,
            overtimeHours: 0,
            earnings: 0,
            eligible: false,
            reason: REASON_NOT_FOUND,
        },
        fingerprintEntry: {
            id,
            updatedAt: null,
            proposedClockOutAt: null,
            earnings: 0,
        },
    };
}

function ineligibleEvaluation(
    record: ClosureRow,
    reason: string,
): ClosureEvaluation {
    return {
        row: { ...baseRow(record), reason },
        fingerprintEntry: {
            id: record.id,
            updatedAt: record.updatedAt,
            proposedClockOutAt: null,
            earnings: 0,
        },
    };
}

function warningFor(record: ClosureRow): string | undefined {
    if (record.employee.payType === 'PIECE') return WARNING_PIECE;
    if (toNumber(record.dailyRateSnapshot) <= 0) return WARNING_ZERO_RATE;
    return undefined;
}

/**
 * @param notStaleReason alasan record bukan sesi basi (null bila basi);
 *   ditentukan pemanggil agar kriteria satu sumber dengan findStaleOpenSessions.
 */
export function evaluateRecord(
    record: ClosureRow,
    policy: ClosurePolicy,
    now: Date,
    notStaleReason: string | null,
): ClosureEvaluation {
    if (notStaleReason) return ineligibleEvaluation(record, notStaleReason);
    if (!record.clockInAt) return ineligibleEvaluation(record, REASON_NO_CLOCK_IN);
    const { workShift } = record;
    const proposal = computeProposedClockOut(policy, {
        clockInAt: record.clockInAt,
        workDate: record.workDate,
        shift: {
            startTime: workShift.startTime,
            endTime: workShift.endTime,
            plannedHours: toNumber(workShift.plannedHours),
        },
    });
    if (!proposal.ok) return ineligibleEvaluation(record, proposal.reason);
    if (proposal.clockOutAt.getTime() > now.getTime()) {
        return ineligibleEvaluation(record, REASON_FUTURE_CLOCK_OUT);
    }

    const computed = computeAttendanceFields({
        ...record,
        clockOutAt: proposal.clockOutAt,
    });
    const earnings = Number(computed.totalEarnings);
    const warning = warningFor(record);
    const row: ClosurePreviewRow = {
        ...baseRow(record),
        proposedClockOutAt: proposal.clockOutAt.toISOString(),
        actualHours:
            computed.actualHours === null ? null : Number(computed.actualHours),
        regularHours: Number(computed.regularHours),
        overtimeHours: Number(computed.overtimeHours),
        earnings,
        eligible: true,
        ...(warning ? { warning } : {}),
    };
    return {
        row,
        fingerprintEntry: {
            id: record.id,
            updatedAt: record.updatedAt,
            proposedClockOutAt: proposal.clockOutAt,
            earnings,
        },
        candidate: {
            id: record.id,
            updatedAt: record.updatedAt,
            proposedClockOutAt: proposal.clockOutAt,
            totalEarnings: earnings,
            previousTotalEarnings: toNumber(record.totalEarnings),
        },
    };
}

// ─── Agregasi pratinjau ───

interface Subtotal {
    eligibleCount: number;
    earnings: number;
}

function sumBy<K extends string>(
    rows: readonly ClosurePreviewRow[],
    keyOf: (row: ClosurePreviewRow) => K,
): Map<K, Subtotal> {
    const totals = new Map<K, Subtotal>();
    for (const row of rows) {
        const key = keyOf(row);
        const current = totals.get(key) ?? { eligibleCount: 0, earnings: 0 };
        totals.set(key, {
            eligibleCount: current.eligibleCount + 1,
            earnings: round2(current.earnings + row.earnings),
        });
    }
    return totals;
}

function compareText(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function summarizeByEmployee(
    eligible: readonly ClosurePreviewRow[],
): ClosurePreview['byEmployee'] {
    const names = new Map(eligible.map((r) => [r.employeeId, r.employeeName]));
    return [...sumBy(eligible, (row) => row.employeeId)]
        .map(([employeeId, subtotal]) => ({
            employeeId,
            employeeName: names.get(employeeId) ?? PLACEHOLDER,
            ...subtotal,
        }))
        .sort(
            (a, b) =>
                compareText(a.employeeName, b.employeeName) ||
                compareText(a.employeeId, b.employeeId),
        );
}

function summarizeByWeek(
    eligible: readonly ClosurePreviewRow[],
): ClosurePreview['byWeek'] {
    return [...sumBy(eligible, (row) => row.weekStart)]
        .map(([weekStart, subtotal]) => ({ weekStart, ...subtotal }))
        .sort((a, b) => compareText(a.weekStart, b.weekStart));
}

export function buildPreview(
    policy: ClosurePolicy,
    fingerprint: string,
    now: Date,
    evaluations: readonly ClosureEvaluation[],
): ClosurePreview {
    const rows = evaluations.map((evaluation) => evaluation.row);
    const eligible = rows.filter((row) => row.eligible);
    return {
        policy,
        fingerprint,
        generatedAt: now.toISOString(),
        rows,
        totals: {
            eligibleCount: eligible.length,
            ineligibleCount: rows.length - eligible.length,
            earnings: round2(eligible.reduce((sum, r) => sum + r.earnings, 0)),
        },
        byEmployee: summarizeByEmployee(eligible),
        byWeek: summarizeByWeek(eligible),
    };
}
