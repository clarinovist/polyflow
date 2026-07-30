import { describe, it, expect } from 'vitest';
import {
    parseGeofenceConfig,
    resolveGeofence,
    validateLocation,
    isSelfServiceEnabled,
    getLateGraceMinutes,
    validateSelfServicePrerequisites,
    serializeGeofenceForStorage,
} from '../attendance-location';

describe('parseGeofenceConfig', () => {
    it('returns null when geofence is disabled', () => {
        const result = parseGeofenceConfig({
            'attendance.geofenceEnabled': 'false',
        });
        expect(result).toBeNull();
    });

    it('returns null when latitude is missing', () => {
        const result = parseGeofenceConfig({
            'attendance.geofenceEnabled': 'true',
            'attendance.longitude': '106.0',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result).toBeNull();
    });

    it('returns null when latitude is invalid', () => {
        const result = parseGeofenceConfig({
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': 'invalid',
            'attendance.longitude': '106.0',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result).toBeNull();
    });

    it('returns null when radius is 0', () => {
        const result = parseGeofenceConfig({
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '-6.12',
            'attendance.longitude': '106.0',
            'attendance.radiusMeters': '0',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result).toBeNull();
    });

    it('returns config when all values are valid', () => {
        const result = parseGeofenceConfig({
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '-6.123456',
            'attendance.longitude': '106.123456',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result).toEqual({
            enabled: true,
            latitude: -6.123456,
            longitude: 106.123456,
            radiusMeters: 100,
            maxAccuracyMeters: 50,
        });
    });
});

describe('validateLocation', () => {
    const config = {
        enabled: true,
        latitude: -6.123456,
        longitude: 106.123456,
        radiusMeters: 100,
        maxAccuracyMeters: 50,
    };

    it('rejects invalid coordinates', () => {
        const result = validateLocation(config, {
            latitude: NaN,
            longitude: 106,
            accuracy: 10,
        });
        expect(result.withinFence).toBe(false);
        expect(result.reason).toContain('tidak valid');
    });

    it('rejects when accuracy is too poor', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: 100,
        });
        expect(result.withinFence).toBe(false);
        expect(result.accuracyOk).toBe(false);
        expect(result.reason).toContain('Akurasi');
    });

    it('rejects when location is outside radius', () => {
        const result = validateLocation(config, {
            latitude: -6.2,
            longitude: 106.2,
            accuracy: 10,
        });
        expect(result.withinFence).toBe(false);
        expect(result.accuracyOk).toBe(true);
        expect(result.reason).toContain('dari kantor');
    });

    it('accepts location within radius and accuracy', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: 10,
        });
        expect(result.withinFence).toBe(true);
        expect(result.accuracyOk).toBe(true);
        expect(result.distanceMeters).toBeLessThan(1);
        expect(result.reason).toBeUndefined();
    });

    it('accepts location slightly offset but within radius', () => {
        // ~50m offset from center
        const result = validateLocation(config, {
            latitude: -6.123,
            longitude: 106.123,
            accuracy: 20,
        });
        expect(result.withinFence).toBe(true);
    });
});

describe('isSelfServiceEnabled', () => {
    it('returns false when not set', () => {
        expect(isSelfServiceEnabled({})).toBe(false);
    });

    it('returns false when set to false', () => {
        expect(
            isSelfServiceEnabled({ 'attendance.selfServiceEnabled': 'false' }),
        ).toBe(false);
    });

    it('returns true when set to true', () => {
        expect(
            isSelfServiceEnabled({ 'attendance.selfServiceEnabled': 'true' }),
        ).toBe(true);
    });
});

describe('getLateGraceMinutes', () => {
    it('returns 0 when not set', () => {
        expect(getLateGraceMinutes({})).toBe(0);
    });

    it('returns parsed value', () => {
        expect(
            getLateGraceMinutes({ 'attendance.lateGraceMinutes': '10' }),
        ).toBe(10);
    });

    it('returns 0 for invalid value', () => {
        expect(
            getLateGraceMinutes({ 'attendance.lateGraceMinutes': 'abc' }),
        ).toBe(0);
    });
});

describe('validateSelfServicePrerequisites', () => {
    it('fails when self-service is disabled', () => {
        const result = validateSelfServicePrerequisites({
            'attendance.selfServiceEnabled': 'false',
        });
        expect(result.ready).toBe(false);
        expect(result.reason).toContain('belum diaktifkan');
    });

    it('fails when geofence config is incomplete', () => {
        const result = validateSelfServicePrerequisites({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'true',
        });
        expect(result.ready).toBe(false);
        expect(result.reason).toContain('belum lengkap');
    });

    it('succeeds when self-service is enabled and geofence is disabled', () => {
        const result = validateSelfServicePrerequisites({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        });
        expect(result.ready).toBe(true);
    });

    it('succeeds when all prerequisites are met', () => {
        const result = validateSelfServicePrerequisites({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '-6.12',
            'attendance.longitude': '106.12',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result.ready).toBe(true);
    });
});

describe('resolveGeofence', () => {
    it('returns disabled when geofence flag is not true', () => {
        expect(resolveGeofence({})).toEqual({ kind: 'disabled' });
        expect(
            resolveGeofence({ 'attendance.geofenceEnabled': 'false' }),
        ).toEqual({ kind: 'disabled' });
        expect(
            resolveGeofence({ 'attendance.geofenceEnabled': '' }),
        ).toEqual({ kind: 'disabled' });
    });

    it('returns invalid when latitude is missing or invalid', () => {
        const base = {
            'attendance.geofenceEnabled': 'true',
            'attendance.longitude': '106.0',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        };
        // missing latitude
        const r1 = resolveGeofence(base);
        expect(r1.kind).toBe('invalid');
        if (r1.kind === 'invalid') {
            expect(r1.reason).toContain('Koordinat');
        }

        // invalid latitude string
        const r2 = resolveGeofence({
            ...base,
            'attendance.latitude': 'invalid',
        });
        expect(r2.kind).toBe('invalid');

        // out-of-range latitude
        const r3 = resolveGeofence({
            ...base,
            'attendance.latitude': '999',
        });
        expect(r3.kind).toBe('invalid');
    });

    it('returns invalid when radius is 0 or negative', () => {
        const make = (radius: string) =>
            resolveGeofence({
                'attendance.geofenceEnabled': 'true',
                'attendance.latitude': '-6.12',
                'attendance.longitude': '106.0',
                'attendance.radiusMeters': radius,
                'attendance.maxAccuracyMeters': '50',
            });

        const r0 = make('0');
        expect(r0.kind).toBe('invalid');
        if (r0.kind === 'invalid') {
            expect(r0.reason).toContain('Radius');
        }

        const rNeg = make('-10');
        expect(rNeg.kind).toBe('invalid');

        const rNaN = make('abc');
        expect(rNaN.kind).toBe('invalid');
    });

    it('returns invalid when maxAccuracyMeters is invalid', () => {
        const make = (acc: string) =>
            resolveGeofence({
                'attendance.geofenceEnabled': 'true',
                'attendance.latitude': '-6.12',
                'attendance.longitude': '106.0',
                'attendance.radiusMeters': '100',
                'attendance.maxAccuracyMeters': acc,
            });

        const r0 = make('0');
        expect(r0.kind).toBe('invalid');
        if (r0.kind === 'invalid') {
            expect(r0.reason).toContain('akurasi');
        }

        const rNeg = make('-5');
        expect(rNeg.kind).toBe('invalid');

        const rMissing = make('');
        expect(rMissing.kind).toBe('invalid');
    });

    it('returns active with correct config when all values valid', () => {
        const result = resolveGeofence({
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '-6.123456',
            'attendance.longitude': '106.123456',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        });
        expect(result.kind).toBe('active');
        if (result.kind === 'active') {
            expect(result.config.latitude).toBeCloseTo(-6.123456, 5);
            expect(result.config.longitude).toBeCloseTo(106.123456, 5);
            expect(result.config.radiusMeters).toBe(100);
            expect(result.config.maxAccuracyMeters).toBe(50);
            expect(result.config.enabled).toBe(true);
        }
    });
});

describe('serializeGeofenceForStorage', () => {
    it('serializes coordinates to Decimal-compatible format', () => {
        const result = serializeGeofenceForStorage({
            latitude: -6.123456789,
            longitude: 106.123456789,
            accuracy: 12.345,
        });
        expect(Number(result.latitude)).toBeCloseTo(-6.123457, 5);
        expect(Number(result.longitude)).toBeCloseTo(106.123457, 5);
        expect(Number(result.accuracy)).toBeCloseTo(12.35, 1);
    });
});
