/** Format tampilan murni untuk koreksi massal sesi lupa pulang (WIB, id-ID). */

const LOCALE = 'id-ID';

/** `YYYY-MM-DD` menjadi "9 Nov 2026" (tanggal kalender, tanpa konversi zona). */
export function formatWorkDate(workDate: string): string {
    if (!workDate) return '-';
    return new Date(`${workDate}T00:00:00.000Z`).toLocaleDateString(LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/** Instan ISO menjadi "10 Nov, 15.00" dalam WIB; null menjadi "-". */
export function formatWibDateTime(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleString(LOCALE, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    });
}

/** 7.5 menjadi "7,5 jam"; null menjadi "-". */
export function formatHoursLong(hours: number | null): string {
    if (hours == null) return '-';
    return `${hours.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} jam`;
}
