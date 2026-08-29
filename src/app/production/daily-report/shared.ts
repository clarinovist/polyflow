/**
 * Pure display helpers shared by the daily production report pages
 * (period overview + per-day machine detail). Server-side only — no
 * client/component code here, so both server pages can import freely.
 */

import { toBusinessDateString } from '@/lib/utils/timezone';
import type { MachineTotals } from '@/services/production/production-daily-report-service';
import type { ProcessKey } from '@/lib/production/process-keys';

export const PROCESS_LABEL: Record<ProcessKey, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extrusi',
    PACKING: 'Packing',
    OTHER: 'Lainnya',
};

export function dayName(dateStr: string): string {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
    }).format(new Date(`${dateStr}T12:00:00+07:00`));
}

export const fmt = (n: number) => n.toLocaleString('id-ID');

/**
 * Affal share of gross output: affal / (hasil + affal) * 100, rounded to
 * 1 decimal. Null when there is nothing to divide (empty process) — both
 * quantities share one unit, so the ratio is unit-safe.
 */
export function affalPercent(
    produced: number,
    affal: number,
): number | null {
    const gross = produced + affal;
    if (gross <= 0) return null;
    return Math.round((affal / gross) * 1000) / 10;
}

/**
 * The worst affal share among named machines — the HIGHEST % affal (most
 * waste relative to output), null when not comparable (fewer than two named
 * machines, or no computable share). Regression guard 2026-08-29: the badge
 * used Math.min and flagged the BEST machine instead.
 */
export function worstAffalShare(machines: MachineTotals[]): number | null {
    const named = machines.filter((m) => m.machineName !== null);
    if (named.length < 2) return null;
    const shares = named
        .map((m) => affalPercent(m.produced, m.scrap))
        .filter((s): s is number => s !== null);
    if (shares.length === 0) return null;
    return Math.max(...shares);
}

/** "(tanpa mesin)" when neither the relation nor a type snapshot exists. */
export function machineDisplayName(m: MachineTotals): string {
    return m.machineName || m.machineType || '(tanpa mesin)';
}

/** EXTRUDER → Extruder, MIXER HD → Mixer hd (compact type hint). */
export function machineTypeLabel(m: MachineTotals): string | null {
    const t = m.machineType;
    if (!t) return null;
    if (m.machineName) {
        return t
            .toLowerCase()
            .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    }
    // Type-only bucket: the type IS the identity, render as-is.
    return t;
}

/** '2026-08' → 'Agustus 2026' (id-ID long month). */
export function monthLabelId(month: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) return month;
    const d = new Date(`${month}-15T12:00:00+07:00`);
    return new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
    }).format(d);
}

/**
 * The last `count` WIB months including the current one, latest first —
 * options for the machine-recap month select. Month identity follows the WIB
 * business date (same calendar as the report rows), not the server-local one.
 */
export function recentMonthOptions(count: number, now: Date): string[] {
    const [y, m] = toBusinessDateString(now)
        .slice(0, 7)
        .split('-')
        .map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const total = y * 12 + (m - 1) - i;
        out.push(
            `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad(
                (total % 12) + 1,
            )}`,
        );
    }
    return out;
}

/**
 * URL param → validated business date, or null when absent/malformed
 * (format OR calendar — 2026-02-30 is rejected). Page-level guard so a
 * hand-edited query string degrades to the default view, never a 500.
 */
export function sanitizeBusinessDateParam(
    param: string | undefined,
): string | null {
    if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
    const [y, m, d] = param.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y &&
        check.getUTCMonth() === m - 1 &&
        check.getUTCDate() === d
        ? param
        : null;
}
