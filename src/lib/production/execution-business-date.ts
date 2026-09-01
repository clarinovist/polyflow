import { toBusinessDateString } from '@/lib/utils/timezone';

/**
 * Shift-aware business-time resolver untuk pencatatan hasil produksi.
 *
 * Latar belakang (laporan produksi 2026-09-01): shift malam melewati tengah
 * malam — hasil yang dicatat jam 00:30 WIB terbaca sebagai tanggal hari berikutnya
 * di Laporan Produksi Harian, padahal secara shift masih hari sebelumnya.
 *
 * Aturan:
 * - Entri OTOMATIS (kiosk log / dialog desktop yang mengirim `now`) yang dilakukan
 *   setelah tengah malam namun masih dalam jangkauan shift (≤ 24 jam sejak shift
 *   mulai, dan tanggal-WIB shift berbeda dari tanggal-WIB entri) di-backdate ke
 *   `shiftStart` sehingga masuk bucket tanggal shift.
 * - Entri DELIBERATE (user mengedit "Mulai/Selesai Pukul" di batch form, atau
 *   deviasi dari waktu submit > DELIBERATE_TOLERANCE_MS) DIHORMATI apa adanya.
 * - Waktu input nyata tetap tersimpan di `ProductionExecution.createdAt` — pola
 *   yang sama dengan JournalEntry (`entryDate` = tanggal buku, `createdAt` = saat
 *   input aktual).
 *
 * Backdate menyetel start = end = shiftStart (durasi 0) supaya tidak menggelembungkan
 * durasi mesin di costing (`endTime - startTime`) dan analytics — semantik entri
 * instan saat ini memang start = end = now.
 */

/** Deviasi client time dari waktu submit yang masih dianggap otomatis (menit). */
export const DELIBERATE_TOLERANCE_MS = 15 * 60 * 1000;

/** Jarak maksimum shiftStart dari waktu submit yang masih boleh di-backdate. */
export const MAX_SHIFT_GAP_MS = 24 * 60 * 60 * 1000;

export interface ResolveShiftAwareLogTimesInput {
    /** Waktu submit di server (ground truth "sekarang"). */
    logAt: Date;
    /** Waktu mulai dari client (batch form editable); null/undefined = auto. */
    clientStart?: Date | null;
    /** Waktu selesai dari client; null/undefined = pakai logAt. */
    clientEnd?: Date | null;
    /** `ProductionShift.startTime` shift terpilih; null = tidak ada shift. */
    shiftStart?: Date | null;
}

export interface ShiftAwareLogTimes {
    startTime: Date;
    endTime: Date;
    /** true = waktu di-backdate ke mulai shift. */
    backdated: boolean;
}

function isDeliberate(logAt: Date, clientStart?: Date | null, clientEnd?: Date | null): boolean {
    if (clientStart != null) {
        if (Math.abs(clientStart.getTime() - logAt.getTime()) > DELIBERATE_TOLERANCE_MS) {
            return true;
        }
    }
    if (clientEnd != null) {
        if (Math.abs(clientEnd.getTime() - logAt.getTime()) > DELIBERATE_TOLERANCE_MS) {
            return true;
        }
    }
    return false;
}

/**
 * Resolve waktu efektif untuk entri hasil produksi (log kiosk / add output).
 * Pure function — tidak menyentuh DB; pemanggil fetch `shiftStart` sendiri.
 */
export function resolveShiftAwareLogTimes(
    input: ResolveShiftAwareLogTimesInput,
): ShiftAwareLogTimes {
    const { logAt, clientStart, clientEnd, shiftStart } = input;

    const baseStart = clientStart ?? logAt;
    const baseEnd = clientEnd ?? logAt;

    const canBackdate =
        shiftStart != null &&
        shiftStart.getTime() < logAt.getTime() &&
        logAt.getTime() - shiftStart.getTime() <= MAX_SHIFT_GAP_MS &&
        toBusinessDateString(shiftStart) !== toBusinessDateString(logAt);

    if (!canBackdate || isDeliberate(logAt, clientStart, clientEnd)) {
        return { startTime: baseStart, endTime: baseEnd, backdated: false };
    }

    return { startTime: shiftStart, endTime: shiftStart, backdated: true };
}
