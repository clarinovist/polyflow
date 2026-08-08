/**
 * Single source of truth for route compliance calculation.
 * Extracted from inline formula in route-plans.ts and reused by
 * visit-supervision-service.
 */

/**
 * Ambang batas "kunjungan overdue" untuk papan mingguan rute (route-planning-service).
 * Customer dianggap overdue kalau hari sejak kunjungan terakhir > angka ini
 * (persis 30 hari BUKAN overdue, 31+ hari overdue).
 *
 * Ditaruh di sini (bukan konstanta telanjang di action) karena route-plans.ts
 * ber-'use server' — semua export dari file itu wajib async, jadi konstanta
 * harus tinggal di lib biasa.
 */
export const OVERDUE_VISIT_DAYS = 30;

const DAYS_IN_ROUTE_WEEK = 6; // Senin–Sabtu

/**
 * Senin (UTC midnight) dari minggu yang memuat `date`.
 * Fungsi murni, aman dipakai dari client maupun server — sengaja ditaruh di
 * lib ini (bukan route-planning-service.ts) karena file itu meng-import
 * `prisma` di top-level dan tidak boleh dibundle ke client component.
 */
export function getMondayOfWeek(date: Date): Date {
    const utcMidnight = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utcMidnight.getUTCDay(); // 0=Minggu..6=Sabtu
    const diff = day === 0 ? -6 : 1 - day;
    utcMidnight.setUTCDate(utcMidnight.getUTCDate() + diff);
    return utcMidnight;
}

/** Tanggal Senin s.d. Sabtu (6 hari) mulai dari `weekStart` (harus sudah hari Senin). */
export function getRouteWeekDates(weekStart: Date): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < DAYS_IN_ROUTE_WEEK; i++) {
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + i);
        dates.push(d);
    }
    return dates;
}

export type VisitAgeDescriptor = {
    label: string;
    /** > OVERDUE_VISIT_DAYS, atau belum pernah dikunjungi sama sekali. */
    isOverdue: boolean;
    neverVisited: boolean;
};

/**
 * Label umur kunjungan terakhir untuk satu customer, dipakai di RouteStopList
 * dan RouteCandidatePicker (R6 — papan mingguan sudah menghitung ini per
 * customer lewat getWeekBoard; fungsi ini murni presentasi, tidak query apa
 * pun). `daysSince === null` WAJIB berarti belum pernah dikunjungi — jangan
 * pernah render itu sebagai "0 hari" atau string kosong, karena keduanya
 * bisa disalahartikan sebagai "baru saja dikunjungi".
 */
export function describeVisitAge(daysSince: number | null): VisitAgeDescriptor {
    if (daysSince === null) {
        return {
            label: 'Belum pernah dikunjungi',
            isOverdue: true,
            neverVisited: true,
        };
    }
    const label = daysSince === 0 ? 'Hari ini' : `${daysSince} hari lalu`;
    return {
        label,
        isOverdue: daysSince > OVERDUE_VISIT_DAYS,
        neverVisited: false,
    };
}

export type ComplianceInput = {
    assigned: number;
    visited: number;
    extraCalls: number;
};

/**
 * Calculate compliance percentage: (visited - extraCalls) / assigned * 100
 * Returns 0 when assigned === 0 to avoid NaN/Infinity.
 * Rounded to nearest integer, matching prior behavior.
 */
export function calculateComplianceRate({
    assigned,
    visited,
    extraCalls,
}: ComplianceInput): number {
    if (assigned === 0) return 0;
    return Math.round(((visited - extraCalls) / assigned) * 100);
}

// — Helpers for reviewStatus decision per Q1 —

export const REVIEW_PENDING_REASONS = [
    'TOKO_BARU',
    'PERMINTAAN_DADAKAN',
] as const;
export type ReviewPendingReason = (typeof REVIEW_PENDING_REASONS)[number];

export function isReviewPendingReason(
    reason: string | null | undefined,
): boolean {
    if (!reason) return false;
    return (REVIEW_PENDING_REASONS as readonly string[]).includes(reason);
}

/**
 * Determine initial reviewStatus for a newly synced visit.
 * Only extraCall + TOKO_BARU/PERMINTAAN_DADAKAN → PENDING, else NOT_REQUIRED.
 */
export function getInitialReviewStatus(input: {
    isExtraCall: boolean;
    extraReason?: string | null;
}): 'PENDING' | 'NOT_REQUIRED' {
    if (input.isExtraCall && isReviewPendingReason(input.extraReason)) {
        return 'PENDING';
    }
    return 'NOT_REQUIRED';
}
