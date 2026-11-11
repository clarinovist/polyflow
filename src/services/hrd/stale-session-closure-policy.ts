/**
 * Fungsi murni koreksi massal sesi lupa pulang: jam pulang usulan per
 * kebijakan, dan sidik (fingerprint) pratinjau. Tanpa akses DB.
 */
import { createHash } from 'node:crypto';
import type { ClosurePolicy } from '@/lib/hrd/stale-session-closure-constants';
import { MAX_ATTENDANCE_SHIFT_HOURS } from './attendance-service';
import { getEffectivePlannedHours, isOvernightShift } from './shift-window';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
/** Zona kerja absensi: WIB (UTC+7), sama dengan shift-window. */
const WIB_OFFSET = '+07:00';

export const REASON_LATE_CLOCK_IN =
    'Jam masuk melewati akhir shift; tutup manual lewat Koreksi jam';
export const REASON_TOO_LONG =
    'Durasi kerja melebihi 24 jam; tutup manual lewat Koreksi jam';
export const REASON_INVALID_SHIFT_TIME =
    'Jam shift tidak valid; tutup manual lewat Koreksi jam';

export interface ClosureShiftInput {
    startTime: string;
    endTime: string;
    plannedHours?: number | null;
}

export interface ProposedClockOutInput {
    clockInAt: Date;
    /** Tanggal kerja (UTC midnight, kolom @db.Date). */
    workDate: Date;
    shift: ClosureShiftInput;
}

export type ProposedClockOutResult =
    | { ok: true; clockOutAt: Date }
    | { ok: false; reason: string };

function isValidTime(time: string): boolean {
    const match = TIME_RE.exec(time);
    if (!match) return false;
    return Number(match[1]) <= MAX_HOUR && Number(match[2]) <= MAX_MINUTE;
}

/** Jam selesai shift pada tanggal kerja (WIB); lintas tengah malam -> +1 hari. */
function shiftEndInstant(workDate: Date, shift: ClosureShiftInput): Date {
    const dateText = workDate.toISOString().slice(0, 10);
    const sameDay = new Date(`${dateText}T${shift.endTime}:00${WIB_OFFSET}`);
    return isOvernightShift(shift.startTime, shift.endTime)
        ? new Date(sameDay.getTime() + MS_PER_DAY)
        : sameDay;
}

function validateDuration(
    clockInAt: Date,
    clockOutAt: Date,
    nonPositiveReason: string,
): ProposedClockOutResult {
    const hours = (clockOutAt.getTime() - clockInAt.getTime()) / MS_PER_HOUR;
    if (hours <= 0) return { ok: false, reason: nonPositiveReason };
    if (hours > MAX_ATTENDANCE_SHIFT_HOURS) {
        return { ok: false, reason: REASON_TOO_LONG };
    }
    return { ok: true, clockOutAt };
}

/**
 * Jam pulang usulan untuk sesi yang lupa pulang. Batas durasi identik dengan
 * `AttendanceService.correct()` (<= 0 atau > 24 jam tidak layak).
 */
export function computeProposedClockOut(
    policy: ClosurePolicy,
    { clockInAt, workDate, shift }: ProposedClockOutInput,
): ProposedClockOutResult {
    if (policy === 'SHIFT_END') {
        if (!isValidTime(shift.endTime) || !isValidTime(shift.startTime)) {
            return { ok: false, reason: REASON_INVALID_SHIFT_TIME };
        }
        return validateDuration(
            clockInAt,
            shiftEndInstant(workDate, shift),
            REASON_LATE_CLOCK_IN,
        );
    }
    const plannedHours = getEffectivePlannedHours(
        shift.plannedHours,
        shift.startTime,
        shift.endTime,
    );
    const clockOutAt = new Date(
        clockInAt.getTime() + Math.round(plannedHours * MS_PER_HOUR),
    );
    return validateDuration(clockInAt, clockOutAt, REASON_TOO_LONG);
}

// ─── Fingerprint ───

export interface FingerprintEntry {
    id: string;
    /** null bila record tidak ditemukan. */
    updatedAt: Date | null;
    /** null bila baris tidak layak. */
    proposedClockOutAt: Date | null;
    /** Upah usulan (0 untuk baris tidak layak). */
    earnings: number;
}

function byId(a: FingerprintEntry, b: FingerprintEntry): number {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

/**
 * sha256 atas JSON kanonik { policy, ids terurut, per record }. Waktu
 * pembuatan pratinjau sengaja tidak ikut: yang diikat hanya data yang
 * menentukan hasil tulis.
 */
export function computeFingerprint(
    policy: ClosurePolicy,
    entries: readonly FingerprintEntry[],
): string {
    const sorted = [...entries].sort(byId);
    const canonical = JSON.stringify({
        policy,
        ids: sorted.map((entry) => entry.id),
        records: sorted.map((entry) => ({
            id: entry.id,
            updatedAt: entry.updatedAt?.toISOString() ?? null,
            proposedClockOutAt: entry.proposedClockOutAt?.toISOString() ?? null,
            earnings: entry.earnings,
        })),
    });
    return createHash('sha256').update(canonical).digest('hex');
}
