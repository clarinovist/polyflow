import { BusinessRuleError } from '@/lib/errors/errors';

const WIB_OFFSET = 7 * 60 * 60 * 1000;

export function fleetMonth(now = new Date()): string {
    return new Date(now.getTime() + WIB_OFFSET).toISOString().slice(0, 7);
}

export function fleetMonthRange(month: string) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new BusinessRuleError('Bulan tidak valid.');
    }
    const from = new Date(`${month}-01T00:00:00+07:00`);
    const [year, m] = month.split('-').map(Number);
    return { gte: from, lt: new Date(Date.UTC(year, m, 1) - WIB_OFFSET) };
}

export function kirStatus(expiry: string | null, now = new Date()) {
    const day = (date: Date) => Math.floor((date.getTime() + WIB_OFFSET) / 86400000);
    if (!expiry || !Number.isFinite(new Date(expiry).getTime())) {
        return { label: 'KIR belum diisi', tone: 'unknown' as const };
    }
    const days = day(new Date(expiry)) - day(now);
    if (days < 0) return { label: `KIR kedaluwarsa (${Math.abs(days)} hari)`, tone: 'expired' as const };
    if (days <= 30) return { label: `KIR segera habis (${days} hari)`, tone: 'due' as const };
    return { label: `KIR berlaku (${days} hari)`, tone: 'valid' as const };
}

export interface FleetTripMeasure {
    departureDate: Date | string | null;
    status: string;
    actualDistanceKm: number | null;
    hasMileage: boolean;
    eligible: boolean;
}

/** Physical travel survives cancellation. Undated legacy trips stay outside the month total. */
export function summarizeFleetTrips(trips: FleetTripMeasure[]) {
    const dated = trips.filter((trip) => trip.departureDate !== null);
    const recorded = dated.filter((trip) => trip.actualDistanceKm !== null);
    const pending = dated.filter((trip) => trip.actualDistanceKm === null && (
        trip.hasMileage || (trip.eligible && ['DEPARTED', 'COMPLETED'].includes(trip.status))
    ));
    return {
        actualKm: recorded.length ? Math.round(recorded.reduce((sum, trip) => sum + trip.actualDistanceKm!, 0) * 100) / 100 : null,
        recordedTrips: recorded.length,
        pendingTrips: pending.length,
        undatedTrips: trips.filter((trip) => trip.departureDate === null).length,
    };
}

export const formatFleetKm = (value: number | null) => value === null ? 'Belum tercatat' : `${value.toLocaleString('id-ID')} km`;
export const formatFleetDate = (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
