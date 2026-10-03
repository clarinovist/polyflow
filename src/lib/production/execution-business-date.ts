import {
    businessDateToEntryDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import { getProductionOutputDateError } from '@/lib/schemas/production-output-date';
import { ProductionRuleViolationError } from '@/lib/errors/errors';

/**
 * Shift-aware business-time resolver untuk pencatatan hasil produksi.
 *
 * Latar belakang (laporan produksi 2026-09-01): shift malam melewati tengah
 * malam — hasil yang dicatat jam 00:30 WIB terbaca sebagai tanggal hari berikutnya
 * di Laporan Produksi Harian, padahal secara shift masih hari sebelumnya.
 *
 * Aturan:
 * - Tanggal eksplisit dari form WO selalu dipakai persis (start=end=00:00 WIB).
 * - Entri OTOMATIS (kiosk log / caller lama yang mengirim `now`) yang dilakukan
 *   setelah tengah malam namun masih dalam jangkauan shift (≤ 24 jam sejak shift
 *   mulai, dan tanggal-WIB shift berbeda dari tanggal-WIB entri) di-backdate ke
 *   `shiftStart` sehingga masuk bucket tanggal shift.
 * - SHIFT 3 (mulai 00:00 WIB — "Shift Malam" / "Shift 3") adalah ekor siklus
 *   hari sebelumnya: shift 1 = 08:00–16:00, shift 2 = 16:00–00:00, shift 3 =
 *   00:00–08:00 esok pagi. Karena shift 3 dan entri berada pada tanggal-WIB yang
 *   sama, aturan di atas tidak menolongnya — maka cabang khusus: hasil shift 3
 *   di-set ke 00:00 WIB tanggal siklus sebelumnya sehingga se-hari dengan shift 1
 *   dan shift 2 (user 2026-10-03).
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

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Shift yang bermulai 00:00–00:59 WIB dianggap shift 3 (ekor siklus hari
 * sebelumnya). Di kedua tenant produksi hanya "Shift Malam"/"Shift 3" yang
 * mulai pada jam tersebut; shift 1 selalu 08:00 dan shift 2 selalu 16:00.
 */
export const NIGHT_SHIFT_START_WINDOW_MS = 60 * 60 * 1000;

/** Kelonggaran entri yang dicatat sesaat setelah shift 3 berakhir (default 2 jam). */
export const NIGHT_SHIFT_LOG_GRACE_MS = 2 * 60 * 60 * 1000;

/** true bila `shiftStart` berada di 00:00–00:59 WIB (shift 3). */
export function isNightTailShiftStart(shiftStart: Date): boolean {
    const wibMs = shiftStart.getTime() + WIB_OFFSET_MS;
    const timeOfDay = ((wibMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
    return timeOfDay < NIGHT_SHIFT_START_WINDOW_MS;
}

export interface ResolveShiftAwareLogTimesInput {
    /** Waktu submit di server (ground truth "sekarang"). */
    logAt: Date;
    /** Explicit WO date, takes precedence over automatic overnight shift bucketing. */
    productionDate?: string;
    /** Waktu mulai dari client (batch form editable); null/undefined = auto. */
    clientStart?: Date | null;
    /** Waktu selesai dari client; null/undefined = pakai logAt. */
    clientEnd?: Date | null;
    /** `ProductionShift.startTime` shift terpilih; null = tidak ada shift. */
    shiftStart?: Date | null;
    /**
     * `ProductionShift.endTime` shift terpilih. Diperlukan untuk cabang shift 3
     * (tanpa ini cabang tidak aktif — caller lama tetap perilaku lamanya).
     */
    shiftEnd?: Date | null;
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
    const {
        logAt,
        clientStart,
        clientEnd,
        shiftStart,
        shiftEnd,
        productionDate,
    } = input;

    if (productionDate !== undefined) {
        const error = getProductionOutputDateError(productionDate, logAt);
        if (error) throw new ProductionRuleViolationError(error);
        // A date-only entry is instantaneous, not an all-day machine run.
        // createdAt and stock/journal posting timestamps remain the actual save time.
        const at = businessDateToEntryDate(productionDate);
        return { startTime: at, endTime: at, backdated: false };
    }

    const baseStart = clientStart ?? logAt;
    const baseEnd = clientEnd ?? logAt;

    if (isDeliberate(logAt, clientStart, clientEnd)) {
        return { startTime: baseStart, endTime: baseEnd, backdated: false };
    }

    const withinReach =
        shiftStart != null &&
        shiftStart.getTime() < logAt.getTime() &&
        logAt.getTime() - shiftStart.getTime() <= MAX_SHIFT_GAP_MS;

    // Entri setelah tengah malam untuk shift yang mulai sore/malam sebelumnya.
    const crossesMidnight =
        withinReach &&
        toBusinessDateString(shiftStart!) !== toBusinessDateString(logAt);

    if (crossesMidnight) {
        return { startTime: shiftStart!, endTime: shiftStart!, backdated: true };
    }

    // Shift 3 (mulai 00:00 WIB): tanggal-WIB shift sama dengan tanggal-WIB entri,
    // jadi aturan di atas tidak menolong. Geser ke tanggal siklus sebelumnya
    // (08:00 D → 08:00 D+1) supaya hasil shift 3 se-hari dengan shift 1 & 2.
    // Butuh `shiftEnd` supaya entri yang jauh melewati jendela shift tidak ikut.
    const isNightTail =
        withinReach &&
        shiftEnd != null &&
        shiftStart != null &&
        isNightTailShiftStart(shiftStart) &&
        logAt.getTime() <= shiftEnd.getTime() + NIGHT_SHIFT_LOG_GRACE_MS;

    if (isNightTail) {
        const cycleDate = toBusinessDateString(
            new Date(shiftStart!.getTime() - MS_PER_DAY),
        );
        const at = businessDateToEntryDate(cycleDate);
        return { startTime: at, endTime: at, backdated: true };
    }

    return { startTime: baseStart, endTime: baseEnd, backdated: false };
}
