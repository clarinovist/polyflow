import { formatWIB } from '@/lib/utils/timezone';

/**
 * Visibilitas cakupan shift harian (disiplin admin).
 *
 * Latar belakang (diagnosis produksi 2026-10-03, rincian tenant ada di plan
 * lokal docs/plan/2026-10-03-disiplin-admin-shift-harian.md): operator
 * mencatat hasil lewat kiosk, tapi admin tidak membuat shift untuk jadwal
 * hari itu. Kiosk lalu jatuh ke fallback "shift terakhir" (lihat
 * `pickRekapShift`), dan guard 24 jam di `resolveShiftAwareLogTimes` menolak
 * backdate — akibatnya hasil shift malam tidak masuk bucket tanggal shift yang
 * benar dan atribusi shift menyesatkan.
 *
 * Banner kiosk hanya menegur operator. Helper murni di sini dipakai untuk
 * memberi sinyal ke ADMIN: dashboard produksi ("Butuh perhatian") dan
 * pengelola shift di detail SPK.
 */

/** Shift dianggap "aktif" bila `now` berada di dalam window-nya (inklusif). */
export interface ShiftWindowLike {
    startTime: Date | string;
    endTime: Date | string;
}

export interface ExecutionTimeLike {
    startTime: Date | string;
}

const RECENT_PRODUCTION_MS = 24 * 60 * 60 * 1000;

function toMs(value: Date | string): number {
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** true bila ada shift yang window-nya mencakup `now`. */
export function hasActiveShift(
    shifts: readonly ShiftWindowLike[] | null | undefined,
    now: Date,
): boolean {
    if (!shifts || shifts.length === 0) return false;
    const nowMs = now.getTime();
    return shifts.some(
        (s) => nowMs >= toMs(s.startTime) && nowMs <= toMs(s.endTime),
    );
}

/** `startTime` shift terakhir (null bila tidak ada shift sama sekali). */
export function lastShiftStart(
    shifts: readonly ShiftWindowLike[] | null | undefined,
): Date | null {
    if (!shifts || shifts.length === 0) return null;
    return shifts.reduce<Date | null>((latest, s) => {
        const ms = toMs(s.startTime);
        return latest === null || ms > latest.getTime() ? new Date(ms) : latest;
    }, null);
}

/** `endTime` shift terakhir (null bila tidak ada shift sama sekali). */
export function lastShiftEnd(
    shifts: readonly ShiftWindowLike[] | null | undefined,
): Date | null {
    if (!shifts || shifts.length === 0) return null;
    return shifts.reduce<Date | null>((latest, s) => {
        const ms = toMs(s.endTime);
        return latest === null || ms > latest.getTime() ? new Date(ms) : latest;
    }, null);
}

export interface MissingShiftInput {
    shifts: readonly ShiftWindowLike[];
    executions: readonly ExecutionTimeLike[];
    createdAt: Date;
    now: Date;
}

export interface MissingShiftAssessment {
    /** true = perlu peringatan ke admin. */
    alert: boolean;
    /** merah = ada produksi baru tapi tidak ada shift aktif (data sedang risiko). */
    severity: 'red' | 'amber';
    /** Menit sejak shift terakhir berakhir (atau sejak SPK dibuat bila tanpa shift). */
    ageMinutes: number;
    lastShiftStart: Date | null;
    /** true = belum punya shift sama sekali. */
    neverHadShift: boolean;
}

/**
 * Putuskan apakah sebuah SPK perlu peringatan "tanpa shift aktif".
 *
 * Alert HANYA bila tidak ada shift yang mencakup `now` DAN salah satu:
 * - ada hasil produksi dalam 24 jam terakhir (kiosk dipakai → data sedang
 *   menempel ke shift basi), atau
 * - SPK belum punya shift sama sekali (perlu dibuat sebelum operator catat).
 *
 * SPK yang shift-nya sudah lewat tapi tidak ada aktivitas 24 jam terakhir
 * TIDAK di-alert agar daftar perhatian tidak dibanjiri SPK dorman.
 */
export function assessMissingShift(input: MissingShiftInput): MissingShiftAssessment {
    const { shifts, executions, createdAt, now } = input;

    if (hasActiveShift(shifts, now)) {
        return {
            alert: false,
            severity: 'amber',
            ageMinutes: 0,
            lastShiftStart: lastShiftStart(shifts),
            neverHadShift: false,
        };
    }

    const neverHadShift = shifts.length === 0;
    const recentProduction = executions.some(
        (e) => now.getTime() - toMs(e.startTime) <= RECENT_PRODUCTION_MS,
    );

    if (!recentProduction && !neverHadShift) {
        return {
            alert: false,
            severity: 'amber',
            ageMinutes: 0,
            lastShiftStart: lastShiftStart(shifts),
            neverHadShift: false,
        };
    }

    const reference = lastShiftEnd(shifts) ?? createdAt;
    const ageMinutes = Math.max(
        0,
        Math.floor((now.getTime() - reference.getTime()) / 60000),
    );

    return {
        alert: true,
        severity: recentProduction ? 'red' : 'amber',
        ageMinutes,
        lastShiftStart: lastShiftStart(shifts),
        neverHadShift,
    };
}

/** Subtitle peringatan untuk admin (dipakai dashboard & pengelola shift). */
export function missingShiftMessage(
    shifts: readonly ShiftWindowLike[],
    now: Date,
): string {
    if (!shifts || shifts.length === 0) {
        return `SPK ini belum punya shift sama sekali. Buat shift jadwal ${formatWIB(now, 'dd MMM yyyy')} sebelum operator mencatat hasil.`;
    }
    const last = lastShiftStart(shifts);
    return `Tidak ada shift yang mencakup ${formatWIB(now, 'HH:mm')} (shift terakhir ${last ? formatWIB(last, 'dd MMM HH:mm') : '-'}). Hasil kiosk akan menempel ke shift lama — laporan harian bisa salah tanggal.`;
}
