/**
 * Pure display helpers shared by the daily production report pages
 * (period overview + per-day machine detail). Server-side only — no
 * client/component code here, so both server pages can import freely.
 */

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
