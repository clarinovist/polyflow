/** Format tampilan murni untuk rekap absensi (zona waktu WIB, locale id-ID). */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const METERS_PER_KM = 1000;

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

const SOURCE_LABELS: Record<string, string> = {
    KIOSK: 'Kiosk',
    SELF_SERVICE: 'Mandiri',
    MANUAL: 'Manual',
};

/** Label sumber absensi; sumber tak dikenal ditampilkan apa adanya. */
export function sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
}

export function sourceBadgeClass(source: string): string {
    switch (source) {
        case 'SELF_SERVICE':
            return 'bg-blue-500/10 text-blue-600';
        case 'MANUAL':
            return 'bg-amber-500/10 text-amber-600';
        default:
            return 'bg-emerald-500/10 text-emerald-600';
    }
}

export function formatIdr(n: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n);
}

export function weekLabel(start: Date, end: Date): string {
    const opts: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    };
    return `${start.toLocaleDateString('id-ID', opts)} – ${end.toLocaleDateString('id-ID', opts)}`;
}

export function formatTime(iso: Date | string | null): string {
    if (!iso) return '-';
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    });
}

export function formatHours(h: number | null): string {
    if (h == null) return '-';
    return `${h.toFixed(1)}j`;
}

/** Jarak ke lokasi kerja: meter di bawah 1 km, selebihnya kilometer. */
export function formatDistance(meters: number): string {
    return meters < METERS_PER_KM
        ? `${Math.round(meters)}m`
        : `${(meters / METERS_PER_KM).toFixed(1)}km`;
}

/**
 * Render a timestamp as a `datetime-local` value in WIB, whatever the device
 * timezone is. The server reads it back as WIB (parseWibDateTime), so both ends
 * must agree on Asia/Jakarta — not on how the HRD laptop happens to be set.
 */
export function toWibInput(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}
