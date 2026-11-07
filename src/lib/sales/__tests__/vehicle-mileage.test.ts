import { describe, expect, it } from 'vitest';
import {
    assertOdometerNotBelowPrevious, correctVehicleMileageSchema, finishVehicleMileageSchema,
    isOpenMileageStale, parseKmText, startVehicleMileageSchema, validateCorrectionChain, wibDayRange,
} from '../vehicle-mileage';
import { parseDistanceInput } from '../trip-distance';

describe('vehicle mileage schemas', () => {
    it('trims driver and note and drops an empty note', () => {
        const parsed = parseDistanceInput(startVehicleMileageSchema, { vehicleId: 'v', driverName: ' Sopir A ', odometerStart: 100, note: '   ' });
        expect(parsed).toEqual({ vehicleId: 'v', driverName: 'Sopir A', odometerStart: 100, note: undefined });
        expect(parseDistanceInput(startVehicleMileageSchema, { vehicleId: 'v', driverName: 'S', odometerStart: 0, note: ' ke bengkel ' }).note).toBe('ke bengkel');
    });
    it.each([
        [{ vehicleId: '', driverName: 'S', odometerStart: 1 }, 'Kendaraan wajib'],
        [{ vehicleId: 'v', driverName: '  ', odometerStart: 1 }, 'Nama sopir wajib'],
        [{ vehicleId: 'v', driverName: 'x'.repeat(151), odometerStart: 1 }, undefined],
        [{ vehicleId: 'v', driverName: 'S', odometerStart: -1 }, undefined],
        [{ vehicleId: 'v', driverName: 'S', odometerStart: '' }, undefined],
        [{ vehicleId: 'v', driverName: 'S', odometerStart: 1, note: 'x'.repeat(301) }, 'Keterangan'],
    ])('rejects invalid start input %j', (input, message) => {
        expect(() => parseDistanceInput(startVehicleMileageSchema, input)).toThrow(message);
    });
    it('requires a mileage id and a valid end reading when finishing', () => {
        expect(parseDistanceInput(finishVehicleMileageSchema, { mileageId: 'm', odometerEnd: 5 })).toEqual({ mileageId: 'm', odometerEnd: 5 });
        expect(() => parseDistanceInput(finishVehicleMileageSchema, { mileageId: '', odometerEnd: 5 })).toThrow();
        expect(() => parseDistanceInput(finishVehicleMileageSchema, { mileageId: 'm', odometerEnd: null })).toThrow();
    });
    it('requires a trimmed reason of at least five characters for corrections', () => {
        const base = { mileageId: 'm', driverName: 'S', odometerStart: 1, odometerEnd: 2 };
        expect(() => parseDistanceInput(correctVehicleMileageSchema, { ...base, reason: '  abc ' })).toThrow('Alasan');
        expect(() => parseDistanceInput(correctVehicleMileageSchema, { ...base, reason: 'x'.repeat(301) })).toThrow('Alasan');
        expect(parseDistanceInput(correctVehicleMileageSchema, { ...base, reason: '  salah ketik  ' }).reason).toBe('salah ketik');
        expect(parseDistanceInput(correctVehicleMileageSchema, { ...base, odometerEnd: null, reason: 'salah ketik' }).odometerEnd).toBeNull();
    });
});

describe('odometer chain validation', () => {
    it('allows a start equal to or above the previous end and rejects below', () => {
        expect(() => assertOdometerNotBelowPrevious(100, 100)).not.toThrow();
        expect(() => assertOdometerNotBelowPrevious(100, null)).not.toThrow();
        expect(() => assertOdometerNotBelowPrevious(99, 100)).toThrow('di bawah');
    });
    it('accepts a correction inside its neighbours', () => {
        expect(() => validateCorrectionChain({ odometerStart: 100, odometerEnd: 150, previousEnd: 100, nextStart: 150 })).not.toThrow();
        expect(() => validateCorrectionChain({ odometerStart: 100, odometerEnd: null, previousEnd: null, nextStart: null })).not.toThrow();
    });
    it('rejects start below previous end, end below start and end above next start', () => {
        expect(() => validateCorrectionChain({ odometerStart: 99, odometerEnd: 150, previousEnd: 100, nextStart: null })).toThrow('di bawah');
        expect(() => validateCorrectionChain({ odometerStart: 100, odometerEnd: 99, previousEnd: null, nextStart: null })).toThrow('lebih kecil');
        expect(() => validateCorrectionChain({ odometerStart: 100, odometerEnd: 151, previousEnd: null, nextStart: 150 })).toThrow('perjalanan berikutnya');
    });
    it('rejects reopening a record that has a later record', () => {
        expect(() => validateCorrectionChain({ odometerStart: 100, odometerEnd: null, previousEnd: null, nextStart: 150 })).toThrow('dibuka kembali');
    });
});

describe('Jakarta day boundaries and stale detection', () => {
    it('maps a UTC evening instant to the next Jakarta day', () => {
        const range = wibDayRange(new Date('2026-11-06T18:00:00Z'));
        expect(range.gte.toISOString()).toBe('2026-11-06T17:00:00.000Z');
        expect(range.lt.toISOString()).toBe('2026-11-07T17:00:00.000Z');
    });
    it('keeps an early-morning Jakarta instant on the same Jakarta day', () => {
        const range = wibDayRange(new Date('2026-11-07T16:59:59Z'));
        expect(range.gte.toISOString()).toBe('2026-11-06T17:00:00.000Z');
    });
    it('flags open records only after more than one day', () => {
        const startedAt = new Date('2026-11-06T00:00:00Z');
        expect(isOpenMileageStale(startedAt, new Date('2026-11-07T00:00:00Z'))).toBe(false);
        expect(isOpenMileageStale(startedAt, new Date('2026-11-07T00:00:01Z'))).toBe(true);
    });
});

describe('parseKmText', () => {
    it('accepts decimal point and comma, trims, and keeps a real zero', () => {
        expect(parseKmText(' 1234.5 ')).toBe(1234.5);
        expect(parseKmText('1234,5')).toBe(1234.5);
        expect(parseKmText('0')).toBe(0);
    });
    it('returns null for empty or non-numeric text instead of zero', () => {
        expect(parseKmText('')).toBeNull();
        expect(parseKmText('   ')).toBeNull();
        expect(parseKmText('12abc')).toBeNull();
    });
});
