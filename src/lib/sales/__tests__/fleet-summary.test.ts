import { describe, expect, it } from 'vitest';
import { fleetMonth, fleetMonthRange, formatFleetKm, kirStatus, summarizeFleetTrips } from '../fleet-summary';

describe('fleet summary invariants', () => {
    it('uses WIB boundaries including year rollover and validates operational months', () => {
        expect(fleetMonth(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01');
        expect(fleetMonthRange('2026-12')).toEqual({ gte: new Date('2026-11-30T17:00:00Z'), lt: new Date('2026-12-31T17:00:00Z') });
        for (const month of ['', '2026-13', '0099-01', '2026-00']) expect(() => fleetMonthRange(month)).toThrow('Bulan tidak valid');
    });
    it('counts physical mileage after cancellation, not plans, undated trips or other usage', () => {
        const trip = { departureDate: '2026-09-23', status: 'COMPLETED', actualDistanceKm: null, hasMileage: false, eligible: true };
        expect(summarizeFleetTrips([
            { ...trip, actualDistanceKm: 84, hasMileage: true, status: 'CANCELLED' },
            { ...trip, actualDistanceKm: 0, hasMileage: true }, trip,
            { ...trip, status: 'CANCELLED' }, { ...trip, eligible: false },
            { ...trip, status: 'PLANNED' }, { ...trip, departureDate: null, actualDistanceKm: 500 },
            { ...trip, status: 'CANCELLED', hasMileage: true },
        ])).toEqual({ actualKm: 84, recordedTrips: 2, pendingTrips: 2, undatedTrips: 1 });
    });
    it('does not claim zero when nothing is recorded', () => {
        expect(summarizeFleetTrips([]).actualKm).toBeNull();
        expect(formatFleetKm(null)).toBe('Belum tercatat');
        expect(formatFleetKm(0)).toBe('0 km');
    });
    it('marks KIR unknown, expired, today and 30-day threshold without host timezone drift', () => {
        const now = new Date('2026-09-23T17:00:00Z'); // Sep 24 WIB
        expect(kirStatus(null, now).tone).toBe('unknown');
        expect(kirStatus('invalid', now).tone).toBe('unknown');
        expect(kirStatus('2026-09-23', now)).toMatchObject({ tone: 'expired' });
        expect(kirStatus('2026-09-24', now).label).toContain('(0 hari)');
        expect(kirStatus('2026-10-24', now).tone).toBe('due');
        expect(kirStatus('2026-10-25', now).tone).toBe('valid');
    });
});
