import type { ViewMode } from './attendance-recap-types';

export const ATTENDANCE_PATH = '/hrd/attendance';
const EXPORT_PATH = '/api/hrd/attendance/export';

interface ParamsSource {
    toString(): string;
}

/** Mode tampilan dari `?mode=`; nilai tak dikenal jatuh ke harian. */
export function parseViewMode(raw: string | null): ViewMode {
    if (raw === 'monthly') return 'monthly';
    if (raw === 'weekly') return 'weekly';
    return 'daily';
}

/** Salinan query dengan satu key diubah (null/kosong = hapus key). */
export function withParam(
    current: ParamsSource,
    key: string,
    value: string | null,
): URLSearchParams {
    const sp = new URLSearchParams(current.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    return sp;
}

/** Salinan query untuk berpindah mode; tahun/bulan hanya dipakai mode bulanan. */
export function withViewMode(
    current: ParamsSource,
    mode: ViewMode,
    year: number,
    month: number,
): URLSearchParams {
    const sp = new URLSearchParams(current.toString());
    sp.set('mode', mode);
    if (mode === 'monthly') {
        sp.set('year', String(year));
        sp.set('month', String(month));
    } else {
        sp.delete('year');
        sp.delete('month');
    }
    return sp;
}

/** Salinan query dengan dua key periode (yang diubah dulu, lalu pasangannya). */
export function withPeriod(
    current: ParamsSource,
    changed: readonly [string, string],
    other: readonly [string, string],
): URLSearchParams {
    const sp = new URLSearchParams(current.toString());
    sp.set(changed[0], changed[1]);
    sp.set(other[0], other[1]);
    return sp;
}

export interface ExportHrefInput {
    viewMode: ViewMode;
    year: number;
    month: number;
    date: string;
    shift?: string;
    overtimeOnly: boolean;
}

/** Tautan ekspor CSV sesuai mode dan filter yang sedang tampil. */
export function buildExportHref(input: ExportHrefInput): string {
    if (input.viewMode === 'monthly') {
        return `${EXPORT_PATH}?mode=monthly&year=${input.year}&month=${input.month}`;
    }
    if (input.viewMode === 'weekly') {
        return `${EXPORT_PATH}?mode=weekly&date=${input.date}`;
    }
    const sp = new URLSearchParams({ mode: 'daily', date: input.date });
    if (input.shift) sp.set('shift', input.shift);
    if (input.overtimeOnly) sp.set('ot', '1');
    return `${EXPORT_PATH}?${sp.toString()}`;
}
