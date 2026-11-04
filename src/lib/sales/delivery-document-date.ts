/**
 * Batas tanggal Surat Jalan (dokumen pengiriman).
 *
 * `deliveryDate` adalah tanggal dokumen/rencana, bukan tanggal pengakuan stok
 * dan invoice — keduanya mengikuti `actualShipmentDate` saat "Tandai Dikirim".
 * Karena truk sering dimuat/disiapkan sehari sebelum keberangkatan, dokumen
 * boleh bertanggal satu hari kerja ke depan, tidak lebih.
 */
import { toBusinessDateString } from '@/lib/utils/timezone';

/** Jumlah hari kerja toleransi tanggal dokumen ke depan. */
export const DELIVERY_DOCUMENT_LEAD_BUSINESS_DAYS = 1;

function toUtcDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function addCalendarDays(dateStr: string, days: number): string {
    const next = toUtcDate(dateStr);
    next.setUTCDate(next.getUTCDate() + days);
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Hari kerja aplikasi = Senin–Sabtu; hanya hari Minggu yang dilewati. */
function isNonBusinessDay(dateStr: string): boolean {
    return toUtcDate(dateStr).getUTCDay() === 0;
}

/**
 * Tanggal dokumen terjauh yang boleh dibuat, WIB, format `YYYY-MM-DD`.
 * H+1 hari kerja: Sabtu → Senin, Minggu → Senin.
 */
export function maxDeliveryDocumentDate(now: Date = new Date()): string {
    let candidate = addCalendarDays(toBusinessDateString(now), 1);
    for (let index = 0; index < 2 && isNonBusinessDay(candidate); index += 1) {
        candidate = addCalendarDays(candidate, 1);
    }
    return candidate;
}

export function isDeliveryDocumentDateAllowed(
    dateStr: string,
    now: Date = new Date(),
): boolean {
    return dateStr <= maxDeliveryDocumentDate(now);
}
