/**
 * Pacing target — fungsi murni, tidak menyentuh Prisma/waktu server langsung.
 *
 * "Pacing" menjawab: seberapa jauh seharusnya pencapaian sudah berjalan pada
 * titik waktu `today` di dalam periode `[periodStart, periodEnd]`, supaya
 * 60% di tanggal 5 (jelek) dan 60% di tanggal 25 (bagus) tidak tampil sama
 * (T7). `paceStatus` membandingkan pencapaian aktual terhadap pace yang
 * diharapkan itu (T8: overachiever tidak di-clamp — lihat pemanggil UI).
 */

/** Rasio achievement/expected di atas ini dianggap "ON" (sesuai jalur). */
export const PACE_TIGHT_RATIO = 0.9;

/** Rasio achievement/expected di bawah ini dianggap "RISIKO". Antara TIGHT dan RISK = "TIPIS". */
export const PACE_RISK_RATIO = 0.7;

export type PaceStatus = 'ON' | 'TIPIS' | 'RISIKO';

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDaysInclusive(start: Date, end: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const diff = Math.round(
        (startOfDay(end).getTime() - startOfDay(start).getTime()) / MS_PER_DAY,
    );
    return diff + 1;
}

/**
 * Persentase pace yang diharapkan pada `today`, relatif terhadap rentang
 * `[periodStart, periodEnd]` (inklusif kedua ujung).
 *
 * - Periode yang sudah lewat (today > periodEnd) → 100 (bukan berdasarkan
 *   hari ini — periode sudah selesai, ekspektasi penuh).
 * - Periode yang belum mulai (today < periodStart) → 0.
 * - Di tengah periode → (hari berjalan / total hari) * 100, dibulatkan ke
 *   2 desimal, dan tidak pernah melebihi 100.
 */
export function expectedPacePercent(
    today: Date,
    periodStart: Date,
    periodEnd: Date,
): number {
    const start = startOfDay(periodStart);
    const end = startOfDay(periodEnd);
    const now = startOfDay(today);

    if (now.getTime() > end.getTime()) return 100;
    if (now.getTime() < start.getTime()) return 0;

    const totalDays = diffDaysInclusive(start, end);
    const elapsedDays = diffDaysInclusive(start, now);

    if (totalDays <= 0) return 100;

    const pct = (elapsedDays / totalDays) * 100;
    return Math.min(100, Math.round(pct * 100) / 100);
}

/**
 * Status pace berdasarkan rasio achievement aktual terhadap achievement yang
 * diharapkan pada titik waktu ini (`expectedPacePercent`).
 *
 * `achievementPercent` **tidak** di-clamp di sini — nilai >100% (overachiever)
 * tetap menghasilkan 'ON', konsisten dengan T8 (jangan clamp di UI).
 */
export function paceStatus(
    achievementPercent: number | null,
    expectedPercent: number,
): PaceStatus {
    if (achievementPercent == null) return 'RISIKO';
    // Di awal periode (expected 0) belum ada dasar untuk bilang "ketinggalan".
    if (expectedPercent <= 0) return 'ON';

    const ratio = achievementPercent / expectedPercent;
    if (ratio >= PACE_TIGHT_RATIO) return 'ON';
    if (ratio >= PACE_RISK_RATIO) return 'TIPIS';
    return 'RISIKO';
}
