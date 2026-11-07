import { z } from 'zod';
import { BusinessRuleError } from '@/lib/errors/errors';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KM_PRECISION = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Within this many days of the due date the item turns SEGERA. */
export const SERVICE_SOON_DAYS = 14;
/** When the admin leaves the warning distance empty it is this share of the interval. */
export const DEFAULT_WARN_RATIO = 0.1;
export const MAX_INTERVAL_DAYS = 3650;
export const SERVICE_LABEL_SUGGESTIONS = ['Oli mesin', 'Oli gardan', 'Ban', 'Filter', 'Lainnya'] as const;
/** The quick-pick that means "type your own label". */
export const SERVICE_LABEL_OTHER = 'Lainnya';

export type ServiceStatus = 'AMAN' | 'SEGERA' | 'LEWAT' | 'BELUM_ADA_DATA';
export type ServiceDueBy = 'KM' | 'DATE';

export function defaultWarnKm(intervalKm: number): number {
    return Math.round(intervalKm * DEFAULT_WARN_RATIO);
}

/** `YYYY-MM-DD` (Asia/Jakarta calendar day) to the instant that day starts. */
export function wibDateToInstant(date: string): Date {
    return new Date(`${date}T00:00:00+07:00`);
}
/** Instant to the Asia/Jakarta calendar day as `YYYY-MM-DD` (for date inputs). */
export function toWibDateInput(instant: Date): string {
    return new Date(instant.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

const MAX_KM = 99999999.99;
const kmValue = z.number('KM harus berupa angka').min(0, 'KM tidak boleh negatif').max(MAX_KM, 'KM terlalu besar').refine(
    (value) => Math.abs(value * KM_PRECISION - Math.round(value * KM_PRECISION)) < 0.000001,
    'Gunakan maksimal dua angka desimal',
);
const label = z.string().trim().min(1, 'Nama jenis servis wajib diisi').max(60, 'Nama jenis servis maksimal 60 karakter');
const intervalKm = kmValue.refine((value) => value > 0, 'Interval KM harus lebih dari nol');
const intervalDays = z.number().int('Interval hari harus bilangan bulat').positive('Interval hari harus lebih dari nol')
    .max(MAX_INTERVAL_DAYS, `Interval hari maksimal ${MAX_INTERVAL_DAYS}`).nullable().optional()
    .transform((value) => value ?? null);
const warnKm = kmValue.optional();
const note = z.string().trim().max(300, 'Keterangan maksimal 300 karakter').optional().transform((value) => (value ? value : undefined));
const reason = z.string().trim().min(5, 'Alasan koreksi minimal 5 karakter').max(300, 'Alasan koreksi maksimal 300 karakter');
const servicedAt = z.string().regex(DATE_ONLY, 'Tanggal servis tidak valid').transform(wibDateToInstant)
    .refine((value) => !Number.isNaN(value.getTime()), 'Tanggal servis tidak valid');

export const createServiceItemSchema = z.object({
    vehicleId: z.string().min(1, 'Kendaraan wajib dipilih'),
    label, intervalKm, intervalDays, warnKm,
});
export const updateServiceItemSchema = z.object({
    itemId: z.string().min(1, 'Jenis servis wajib dipilih'),
    intervalKm, intervalDays, warnKm,
    isActive: z.boolean().optional(),
});
export const recordVehicleServiceSchema = z.object({
    vehicleId: z.string().min(1, 'Kendaraan wajib dipilih'),
    serviceItemId: z.string().min(1, 'Jenis servis wajib dipilih'),
    servicedAt, odometerKm: kmValue, note,
});
export const correctVehicleServiceSchema = z.object({
    recordId: z.string().min(1, 'Catatan servis wajib dipilih'),
    servicedAt, odometerKm: kmValue, note, reason,
});

export interface ServiceChain {
    odometerKm: number;
    /** KM of the record just before this one (by service date), if any. */
    previousKm: number | null;
    /** KM of the record just after this one (by service date), if any. */
    nextKm: number | null;
}

export function validateServiceChain({ odometerKm, previousKm, nextKm }: ServiceChain): void {
    if (previousKm !== null && odometerKm < previousKm) {
        throw new BusinessRuleError('KM servis tidak boleh di bawah KM servis sebelumnya untuk jenis ini.');
    }
    if (nextKm !== null && odometerKm > nextKm) {
        throw new BusinessRuleError('KM servis tidak boleh di atas KM servis sesudahnya untuk jenis ini.');
    }
}

export function assertServicedAtNotFuture(servicedAtInstant: Date, now: Date): void {
    if (servicedAtInstant.getTime() > now.getTime()) throw new BusinessRuleError('Tanggal servis tidak boleh di masa depan.');
}

export interface ServiceItemTerms { intervalKm: number; intervalDays: number | null; warnKm: number }
export interface LastService { servicedAt: Date; odometerKm: number }
export interface ServiceStatusInput {
    item: ServiceItemTerms;
    lastService: LastService | null;
    /** Latest odometer reading from the mileage book (end reading, else start reading). */
    latestMileageKm: number | null;
    now: Date;
}
export interface ServiceStatusResult {
    status: ServiceStatus;
    currentKm: number | null;
    dueKm: number | null;
    remainingKm: number | null;
    dueDate: Date | null;
    remainingDays: number | null;
    /** What made the status what it is; null when there is no data or nothing is close. */
    dueBy: ServiceDueBy | null;
}

const SEVERITY: Record<ServiceStatus, number> = { BELUM_ADA_DATA: -1, AMAN: 0, SEGERA: 1, LEWAT: 2 };
const round2 = (value: number) => Math.round(value * KM_PRECISION) / KM_PRECISION;

function statusByKm(remainingKm: number, warn: number): ServiceStatus {
    if (remainingKm < 0) return 'LEWAT';
    return remainingKm <= warn ? 'SEGERA' : 'AMAN';
}
function statusByDays(remainingDays: number): ServiceStatus {
    if (remainingDays < 0) return 'LEWAT';
    return remainingDays <= SERVICE_SOON_DAYS ? 'SEGERA' : 'AMAN';
}

export const NO_SERVICE_DATA: ServiceStatusResult = {
    status: 'BELUM_ADA_DATA', currentKm: null, dueKm: null, remainingKm: null, dueDate: null, remainingDays: null, dueBy: null,
};

/** Pure status of one service item. The more urgent of the KM and the date criteria wins (KM on a tie). */
export function computeServiceStatus({ item, lastService, latestMileageKm, now }: ServiceStatusInput): ServiceStatusResult {
    if (!lastService) return NO_SERVICE_DATA;
    const currentKm = Math.max(latestMileageKm ?? lastService.odometerKm, lastService.odometerKm);
    const dueKm = round2(lastService.odometerKm + item.intervalKm);
    const remainingKm = round2(dueKm - currentKm);
    const kmStatus = statusByKm(remainingKm, item.warnKm);
    const dueDate = item.intervalDays === null ? null : new Date(lastService.servicedAt.getTime() + item.intervalDays * DAY_MS);
    const remainingDays = dueDate === null ? null : Math.floor((dueDate.getTime() - now.getTime()) / DAY_MS);
    const dateStatus = remainingDays === null ? null : statusByDays(remainingDays);
    const byDate = dateStatus !== null && SEVERITY[dateStatus] > SEVERITY[kmStatus];
    const status = byDate ? dateStatus : kmStatus;
    return { status, currentKm, dueKm, remainingKm, dueDate, remainingDays, dueBy: status === 'AMAN' ? null : byDate ? 'DATE' : 'KM' };
}

export function isServiceAlert(status: ServiceStatus): boolean {
    return status === 'SEGERA' || status === 'LEWAT';
}

const formatKm = (value: number) => `${value.toLocaleString('id-ID')} km`;

/** "sisa 320 km" / "lewat 1.200 km" / "sisa 5 hari" / "lewat 3 hari"; null when there is nothing to say. */
export function describeServiceRemaining(result: Pick<ServiceStatusResult, 'status' | 'dueBy' | 'remainingKm' | 'remainingDays'>): string | null {
    if (result.status === 'BELUM_ADA_DATA') return null;
    const useDays = result.dueBy === 'DATE' && result.remainingDays !== null;
    const amount = useDays ? result.remainingDays : result.remainingKm;
    if (amount === null) return null;
    const text = useDays ? `${Math.abs(amount)} hari` : formatKm(Math.abs(amount));
    return amount < 0 ? `lewat ${text}` : `sisa ${text}`;
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
    AMAN: 'Aman', SEGERA: 'Segera servis', LEWAT: 'Lewat jadwal', BELUM_ADA_DATA: 'Belum ada data',
};
