import { describe, expect, it } from 'vitest';
import {
    assertServicedAtNotFuture, computeServiceStatus, correctVehicleServiceSchema, createServiceItemSchema, defaultWarnKm,
    describeServiceRemaining, isServiceAlert, recordVehicleServiceSchema, SERVICE_SOON_DAYS, toWibDateInput,
    updateServiceItemSchema, validateServiceChain, wibDateToInstant,
} from '../vehicle-service';

const NOW = new Date('2026-11-07T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const item = { intervalKm: 10000, intervalDays: null, warnKm: 1000 };
const last = { servicedAt: new Date('2026-10-01T00:00:00Z'), odometerKm: 40000 };
const status = (overrides: Partial<Parameters<typeof computeServiceStatus>[0]> = {}) =>
    computeServiceStatus({ item, lastService: last, latestMileageKm: 40500, now: NOW, ...overrides });

describe('computeServiceStatus', () => {
    it('is BELUM_ADA_DATA without any recorded service, even with mileage', () => {
        expect(status({ lastService: null, latestMileageKm: 99999 })).toMatchObject({ status: 'BELUM_ADA_DATA', currentKm: null, remainingKm: null, dueBy: null });
    });
    it('is AMAN when far from the due km', () => {
        expect(status()).toMatchObject({ status: 'AMAN', currentKm: 40500, dueKm: 50000, remainingKm: 9500, dueBy: null });
    });
    it('is SEGERA at exactly the warning distance and below', () => {
        expect(status({ latestMileageKm: 49000 })).toMatchObject({ status: 'SEGERA', remainingKm: 1000, dueBy: 'KM' });
        expect(status({ latestMileageKm: 49680 })).toMatchObject({ status: 'SEGERA', remainingKm: 320 });
    });
    it('is SEGERA at exactly the due km and LEWAT one km past it', () => {
        expect(status({ latestMileageKm: 50000 })).toMatchObject({ status: 'SEGERA', remainingKm: 0 });
        expect(status({ latestMileageKm: 50001 })).toMatchObject({ status: 'LEWAT', remainingKm: -1, dueBy: 'KM' });
    });
    it('uses the last service km as current km when the mileage book is empty or behind', () => {
        expect(status({ latestMileageKm: null })).toMatchObject({ currentKm: 40000, remainingKm: 10000 });
        expect(status({ latestMileageKm: 39000 })).toMatchObject({ currentKm: 40000 });
        expect(status({ latestMileageKm: 40000.4 })).toMatchObject({ currentKm: 40000.4, remainingKm: 9999.6 });
    });
    it('turns SEGERA by date within the soon window while km is still AMAN', () => {
        const dated = { ...item, intervalDays: 30 }; // due 2026-10-31 relative to the last service below
        const recent = { servicedAt: new Date(NOW.getTime() - 20 * DAY), odometerKm: 40000 };
        const result = status({ item: dated, lastService: recent });
        expect(result).toMatchObject({ status: 'SEGERA', dueBy: 'DATE', remainingDays: 10 });
        expect(result.remainingKm).toBe(10000 - 500);
    });
    it('is AMAN by date beyond the soon window', () => {
        const recent = { servicedAt: new Date(NOW.getTime() - 10 * DAY), odometerKm: 40000 };
        expect(status({ item: { ...item, intervalDays: SERVICE_SOON_DAYS + 11 }, lastService: recent })).toMatchObject({ status: 'AMAN', remainingDays: SERVICE_SOON_DAYS + 1 });
    });
    it('is SEGERA on the soon boundary day and LEWAT once the due date has passed', () => {
        const serviced = new Date(NOW.getTime() - 16 * DAY);
        expect(status({ item: { ...item, intervalDays: 30 }, lastService: { servicedAt: serviced, odometerKm: 40000 } })).toMatchObject({ status: 'SEGERA', remainingDays: 14 });
        const overdue = status({ item: { ...item, intervalDays: 30 }, lastService: { servicedAt: new Date(NOW.getTime() - 33 * DAY), odometerKm: 40000 } });
        expect(overdue).toMatchObject({ status: 'LEWAT', dueBy: 'DATE', remainingDays: -3 });
        expect(overdue.dueDate?.getTime()).toBe(NOW.getTime() - 3 * DAY);
    });
    it('treats a due date a few hours ago as LEWAT and one a few hours ahead as SEGERA today', () => {
        const hoursAgo = status({ item: { ...item, intervalDays: 1 }, lastService: { servicedAt: new Date(NOW.getTime() - DAY - 3600_000), odometerKm: 40000 } });
        expect(hoursAgo).toMatchObject({ status: 'LEWAT', remainingDays: -1 });
        const hoursAhead = status({ item: { ...item, intervalDays: 1 }, lastService: { servicedAt: new Date(NOW.getTime() - DAY + 3600_000), odometerKm: 40000 } });
        expect(hoursAhead).toMatchObject({ status: 'SEGERA', remainingDays: 0 });
    });
    it('lets the more urgent criterion win: km overdue beats a safe date and date overdue beats a safe km', () => {
        const safeDate = { ...item, intervalDays: 365 };
        expect(status({ item: safeDate, latestMileageKm: 52000 })).toMatchObject({ status: 'LEWAT', dueBy: 'KM' });
        const old = { servicedAt: new Date(NOW.getTime() - 400 * DAY), odometerKm: 40000 };
        expect(status({ item: safeDate, lastService: old })).toMatchObject({ status: 'LEWAT', dueBy: 'DATE' });
    });
    it('reports KM on an equal-severity tie', () => {
        const old = { servicedAt: new Date(NOW.getTime() - 40 * DAY), odometerKm: 40000 };
        expect(status({ item: { ...item, intervalDays: 30 }, lastService: old, latestMileageKm: 51000 })).toMatchObject({ status: 'LEWAT', dueBy: 'KM' });
    });
    it('never reports dates when no day interval is set', () => {
        expect(status()).toMatchObject({ dueDate: null, remainingDays: null });
    });
    it('rounds the due km to two decimals', () => {
        expect(status({ item: { ...item, intervalKm: 0.1 + 0.2 }, lastService: { ...last, odometerKm: 1.1 }, latestMileageKm: null }).dueKm).toBe(1.4);
    });
});

describe('describeServiceRemaining and helpers', () => {
    it('formats remaining and overdue km with thousands separators', () => {
        expect(describeServiceRemaining({ status: 'SEGERA', dueBy: 'KM', remainingKm: 320, remainingDays: null })).toBe('sisa 320 km');
        expect(describeServiceRemaining({ status: 'LEWAT', dueBy: 'KM', remainingKm: -1200, remainingDays: null })).toBe('lewat 1.200 km');
    });
    it('formats days when the date is the trigger', () => {
        expect(describeServiceRemaining({ status: 'SEGERA', dueBy: 'DATE', remainingKm: 9000, remainingDays: 5 })).toBe('sisa 5 hari');
        expect(describeServiceRemaining({ status: 'LEWAT', dueBy: 'DATE', remainingKm: 9000, remainingDays: -3 })).toBe('lewat 3 hari');
    });
    it('describes a safe item by km and nothing for missing data', () => {
        expect(describeServiceRemaining({ status: 'AMAN', dueBy: null, remainingKm: 9500, remainingDays: null })).toBe('sisa 9.500 km');
        expect(describeServiceRemaining({ status: 'BELUM_ADA_DATA', dueBy: null, remainingKm: null, remainingDays: null })).toBeNull();
        expect(describeServiceRemaining({ status: 'AMAN', dueBy: null, remainingKm: null, remainingDays: null })).toBeNull();
    });
    it('flags only SEGERA and LEWAT as alerts', () => {
        expect(['AMAN', 'SEGERA', 'LEWAT', 'BELUM_ADA_DATA'].map((value) => isServiceAlert(value as 'AMAN'))).toEqual([false, true, true, false]);
    });
    it('defaults the warning distance to 10 percent of the interval, rounded', () => {
        expect(defaultWarnKm(10000)).toBe(1000);
        expect(defaultWarnKm(15555)).toBe(1556);
        expect(defaultWarnKm(5)).toBe(1);
    });
    it('converts a Jakarta calendar day to its start instant and back', () => {
        expect(wibDateToInstant('2026-11-07').toISOString()).toBe('2026-11-06T17:00:00.000Z');
        expect(toWibDateInput(new Date('2026-11-06T17:00:00Z'))).toBe('2026-11-07');
        expect(toWibDateInput(new Date('2026-11-07T16:59:00Z'))).toBe('2026-11-07');
    });
});

describe('validateServiceChain and future check', () => {
    it('accepts equal and in-between readings and open ends', () => {
        expect(() => validateServiceChain({ odometerKm: 100, previousKm: 100, nextKm: 100 })).not.toThrow();
        expect(() => validateServiceChain({ odometerKm: 150, previousKm: 100, nextKm: 200 })).not.toThrow();
        expect(() => validateServiceChain({ odometerKm: 5, previousKm: null, nextKm: null })).not.toThrow();
    });
    it('rejects a reading below the previous or above the next one', () => {
        expect(() => validateServiceChain({ odometerKm: 99, previousKm: 100, nextKm: null })).toThrow('di bawah KM servis sebelumnya');
        expect(() => validateServiceChain({ odometerKm: 201, previousKm: null, nextKm: 200 })).toThrow('di atas KM servis sesudahnya');
    });
    it('rejects a service date in the future but allows today', () => {
        expect(() => assertServicedAtNotFuture(wibDateToInstant('2026-11-08'), NOW)).toThrow('masa depan');
        expect(() => assertServicedAtNotFuture(wibDateToInstant('2026-11-07'), NOW)).not.toThrow();
    });
});

describe('schemas', () => {
    it('trims the label, defaults optional fields and keeps an explicit warning distance', () => {
        const parsed = createServiceItemSchema.parse({ vehicleId: 'v', label: '  Oli mesin ', intervalKm: 10000 });
        expect(parsed).toEqual({ vehicleId: 'v', label: 'Oli mesin', intervalKm: 10000, intervalDays: null, warnKm: undefined });
        expect(createServiceItemSchema.parse({ vehicleId: 'v', label: 'Ban', intervalKm: 50000, intervalDays: 365, warnKm: 0 })).toMatchObject({ intervalDays: 365, warnKm: 0 });
    });
    it.each([
        [{ label: ' ' }, 'wajib diisi'],
        [{ label: 'x'.repeat(61) }, 'maksimal 60'],
        [{ intervalKm: 0 }, 'lebih dari nol'],
        [{ intervalKm: -5 }, 'tidak boleh negatif'],
        [{ intervalDays: 0 }, 'lebih dari nol'],
        [{ intervalDays: 1.5 }, 'bilangan bulat'],
        [{ intervalDays: 4000 }, 'maksimal 3650'],
        [{ warnKm: -1 }, 'tidak boleh negatif'],
        [{ warnKm: 1.234 }, 'dua angka desimal'],
        [{ intervalKm: 'abc' }, 'harus berupa angka'],
        [{ vehicleId: '' }, 'Kendaraan wajib'],
    ])('rejects invalid item input %j', (override, message) => {
        const result = createServiceItemSchema.safeParse({ vehicleId: 'v', label: 'Oli', intervalKm: 100, ...override });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.issues[0].message).toContain(message);
    });
    it('parses a service record date as the Jakarta day start and trims an empty note away', () => {
        const parsed = recordVehicleServiceSchema.parse({ vehicleId: 'v', serviceItemId: 'i', servicedAt: '2026-11-07', odometerKm: 42000, note: '  ' });
        expect(parsed.servicedAt.toISOString()).toBe('2026-11-06T17:00:00.000Z');
        expect(parsed.note).toBeUndefined();
    });
    it.each(['07-11-2026', '2026-13-45', '', 'besok'])('rejects malformed service date %j', (servicedAt) => {
        expect(recordVehicleServiceSchema.safeParse({ vehicleId: 'v', serviceItemId: 'i', servicedAt, odometerKm: 1 }).success).toBe(false);
    });
    it('requires a 5 to 300 character reason on corrections', () => {
        const base = { recordId: 'r', servicedAt: '2026-11-07', odometerKm: 1 };
        expect(correctVehicleServiceSchema.safeParse({ ...base, reason: 'abc' }).success).toBe(false);
        expect(correctVehicleServiceSchema.safeParse({ ...base, reason: 'x'.repeat(301) }).success).toBe(false);
        expect(correctVehicleServiceSchema.safeParse({ ...base, reason: 'salah ketik' }).success).toBe(true);
    });
    it('keeps an optional active flag on item updates', () => {
        expect(updateServiceItemSchema.parse({ itemId: 'i', intervalKm: 100, isActive: false })).toMatchObject({ isActive: false, intervalDays: null });
        expect(updateServiceItemSchema.parse({ itemId: 'i', intervalKm: 100 }).isActive).toBeUndefined();
    });
});
