import { z } from 'zod';
import { BusinessRuleError } from '@/lib/errors/errors';
import { kmReadingSchema } from './trip-distance';

const driverName = z.string().trim().min(1, 'Nama sopir wajib diisi').max(150, 'Nama sopir maksimal 150 karakter');
const note = z.string().trim().max(300, 'Keterangan maksimal 300 karakter').optional().transform((value) => (value ? value : undefined));
const reason = z.string().trim().min(5, 'Alasan koreksi minimal 5 karakter').max(300, 'Alasan koreksi maksimal 300 karakter');

export const startVehicleMileageSchema = z.object({
    vehicleId: z.string().min(1, 'Kendaraan wajib dipilih'),
    driverName,
    odometerStart: kmReadingSchema,
    note,
});
export const finishVehicleMileageSchema = z.object({
    mileageId: z.string().min(1, 'Catatan KM wajib dipilih'),
    odometerEnd: kmReadingSchema,
});
export const correctVehicleMileageSchema = z.object({
    mileageId: z.string().min(1, 'Catatan KM wajib dipilih'),
    driverName,
    odometerStart: kmReadingSchema,
    odometerEnd: kmReadingSchema.nullable(),
    reason,
});

export type StartVehicleMileageInput = z.infer<typeof startVehicleMileageSchema>;
export type CorrectVehicleMileageInput = z.infer<typeof correctVehicleMileageSchema>;

export interface CorrectionChain {
    odometerStart: number;
    odometerEnd: number | null;
    /** End reading of the record before this one (by start time), if any. */
    previousEnd: number | null;
    /** Start reading of the record after this one (by start time), if any. */
    nextStart: number | null;
}

export function assertOdometerNotBelowPrevious(odometerStart: number, previousEnd: number | null): void {
    if (previousEnd !== null && odometerStart < previousEnd) {
        throw new BusinessRuleError('Odometer awal tidak boleh di bawah odometer akhir perjalanan sebelumnya.');
    }
}

export function validateCorrectionChain({ odometerStart, odometerEnd, previousEnd, nextStart }: CorrectionChain): void {
    assertOdometerNotBelowPrevious(odometerStart, previousEnd);
    if (odometerEnd === null) {
        if (nextStart !== null) throw new BusinessRuleError('Catatan yang sudah ada perjalanan berikutnya tidak boleh dibuka kembali.');
        return;
    }
    if (odometerEnd < odometerStart) {
        throw new BusinessRuleError('Odometer kembali tidak boleh lebih kecil dari odometer berangkat.');
    }
    if (nextStart !== null && odometerEnd > nextStart) {
        throw new BusinessRuleError('Odometer kembali tidak boleh di atas odometer berangkat perjalanan berikutnya.');
    }
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** An open record older than this most likely means the return reading was forgotten. */
export const STALE_OPEN_MILEAGE_MS = DAY_MS;

/** Asia/Jakarta calendar day containing `now`, as UTC instants (the database stores UTC). */
export function wibDayRange(now: Date): { gte: Date; lt: Date } {
    const startUtc = Math.floor((now.getTime() + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS;
    return { gte: new Date(startUtc), lt: new Date(startUtc + DAY_MS) };
}

export function isOpenMileageStale(startedAt: Date, now: Date): boolean {
    return now.getTime() - startedAt.getTime() > STALE_OPEN_MILEAGE_MS;
}

/** Form text to a number. Accepts a decimal comma; empty or non-numeric text is null (never zero). */
export function parseKmText(text: string): number | null {
    const normalized = text.trim().replace(',', '.');
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
}
