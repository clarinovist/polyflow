/**
 * Tipe bersama untuk halaman Target Sales — dipecah dari SalesTargetsClient.tsx
 * (665 baris) sesuai plan §3 (docs/plan/2026-08-08-redesign-sales-routes-targets.md).
 */

// ── Bentuk data dari service (setelah serializeData) ──

export type TargetRow = {
    id: string | null;
    userId: string;
    periodYear: number;
    periodMonth: number;
    revenueTarget: number | string | { toNumber?: () => number };
    visitTarget: number | null;
    orderTarget: number | null;
    notes: string | null;
    userName: string | null;
    revenueActual: number | string | { toNumber?: () => number };
    revenueAchievementPercent: number | null;
    visitActual: number;
    visitAchievementPercent: number | null;
    orderActual: number;
    orderAchievementPercent: number | null;
};

export type TargetContextRow = {
    userId: string;
    prevMonthActual: number | string | { toNumber?: () => number };
    avg3MonthActual: number | string | { toNumber?: () => number };
    sameMonthLastYearActual: number | string | { toNumber?: () => number };
};

export type TeamMember = {
    id: string;
    name: string | null;
};

// ── State edit di client (T1) ──

export type EditableField = {
    userId: string;
    revenueTarget?: number;
    visitTarget?: number | null;
    orderTarget?: number | null;
    notes?: string | null;
};

/** Konteks historis sudah dinormalisasi ke number murni (dari Decimal/string). */
export type EffectiveContext = {
    prevMonthActual: number;
    avg3MonthActual: number;
    sameMonthLastYearActual: number;
};

// ── Baris gabungan (tim + target + edit + konteks) dipakai Table & Header ──

export type EffectiveRow = {
    userId: string;
    name: string;
    targetId: string | null;
    revenueTarget: number;
    revenueTargetIsEdited: boolean;
    revenueActual: number;
    revenueAchievementPercent: number | null;
    visitTarget: number | null;
    visitTargetIsEdited: boolean;
    visitActual: number;
    visitAchievementPercent: number | null;
    orderTarget: number | null;
    orderTargetIsEdited: boolean;
    orderActual: number;
    orderAchievementPercent: number | null;
    isEdited: boolean;
    context: EffectiveContext | undefined;
};

export const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];
