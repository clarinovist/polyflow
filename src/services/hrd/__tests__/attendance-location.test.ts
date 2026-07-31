import { describe, it, expect } from 'vitest';
import {
    describeGeofenceProximity,
    parseGeofenceConfig,
    parseLocationEvidence,
    resolveGeofence,
    validateLocation,
    isSelfServiceEnabled,
    getLateGraceMinutes,
    validateSelfServicePrerequisites,
} from '../attendance-location';
import { serializeGeofenceForStorage } from '../attendance-location-storage';
import type { GeofenceConfig } from '../attendance-location';

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

    it('fails when self-service is enabled but geofence is disabled', () => {
        const result = validateSelfServicePrerequisites({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        });
        expect(result.ready).toBe(false);
        expect(result.reason).toContain('geofence aktif');
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

describe('describeGeofenceProximity', () => {
    const office: GeofenceConfig = {
        enabled: true,
        latitude: -6.2,
        longitude: 106.8,
        radiusMeters: 100,
        maxAccuracyMeters: 50,
    };

    it('returns no-geofence when config is null', () => {
        const result = describeGeofenceProximity(null, {
            latitude: -6.2,
            longitude: 106.8,
            accuracy: 10,
        });
        expect(result.kind).toBe('no-geofence');
    });

    it('returns waiting-gps when evidence is null', () => {
        const result = describeGeofenceProximity(office, null);
        expect(result.kind).toBe('waiting-gps');
    });

    it('returns waiting-gps when coordinates are invalid', () => {
        const result = describeGeofenceProximity(office, {
            latitude: NaN,
            longitude: 106.8,
            accuracy: 10,
        });
        expect(result.kind).toBe('waiting-gps');
    });

    it('returns waiting-gps when accuracy is not finite', () => {
        const result = describeGeofenceProximity(office, {
            latitude: -6.2,
            longitude: 106.8,
            accuracy: NaN,
        });
        expect(result.kind).toBe('waiting-gps');
    });

    it('returns waiting-gps when accuracy is negative', () => {
        const result = describeGeofenceProximity(office, {
            latitude: -6.2,
            longitude: 106.8,
            accuracy: -1,
        });
        expect(result.kind).toBe('waiting-gps');
    });

    it('returns accuracy-poor when accuracy exceeds limit', () => {
        const result = describeGeofenceProximity(office, {
            latitude: -6.2,
            longitude: 106.8,
            accuracy: 200,
        });
        expect(result.kind).toBe('accuracy-poor');
        if (result.kind === 'accuracy-poor') {
            expect(result.accuracy).toBe(200);
            expect(result.limit).toBe(50);
            expect(result.message).toContain('Akurasi GPS');
            expect(result.message).toContain('±200m');
            expect(result.message).toContain('±50m');
        }
    });

    it('returns outside when distance exceeds radius', () => {
        // ~1.5km away
        const result = describeGeofenceProximity(office, {
            latitude: -6.21,
            longitude: 106.81,
            accuracy: 10,
        });
        expect(result.kind).toBe('outside');
        if (result.kind === 'outside') {
            expect(result.distanceMeters).toBeGreaterThan(100);
            expect(result.radiusMeters).toBe(100);
            expect(result.message).toContain('di luar radius');
        }
    });

    it('returns inside when within radius and accurate', () => {
        const result = describeGeofenceProximity(office, {
            latitude: -6.2,
            longitude: 106.8,
            accuracy: 10,
        });
        expect(result.kind).toBe('inside');
        if (result.kind === 'inside') {
            expect(result.distanceMeters).toBeLessThan(1);
            expect(result.message).toContain('di dalam area absensi');
        }
    });

    it('returns inside when distance is just inside the radius (boundary)', () => {
        // Calculate point slightly inside radius: 99m north from office
        const metersPerDegreeLat = 111_000;
        const deltaLat = 99 / metersPerDegreeLat;
        const result = describeGeofenceProximity(office, {
            latitude: office.latitude + deltaLat,
            longitude: office.longitude,
            accuracy: 10,
        });
        expect(result.kind).toBe('inside');
        if (result.kind === 'inside') {
            expect(result.distanceMeters).toBeLessThanOrEqual(office.radiusMeters);
        }
    });

    it('returns outside when distance is just outside the radius (boundary)', () => {
        const metersPerDegreeLat = 111_000;
        const deltaLat = 101 / metersPerDegreeLat;
        const result = describeGeofenceProximity(office, {
            latitude: office.latitude + deltaLat,
            longitude: office.longitude,
            accuracy: 10,
        });
        expect(result.kind).toBe('outside');
        if (result.kind === 'outside') {
            expect(result.distanceMeters).toBeGreaterThan(office.radiusMeters);
        }
    });

    it('checks accuracy before distance (accuracy-poor even if also outside)', () => {
        const result = describeGeofenceProximity(office, {
            latitude: -7.0,
            longitude: 107.5,
            accuracy: 999,
        });
        expect(result.kind).toBe('accuracy-poor');
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

describe('parseLocationEvidence', () => {
    it('rejects null input', () => {
        const r = parseLocationEvidence(null);
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('wajib');
    });

    it('rejects non-object input', () => {
        expect(parseLocationEvidence('string').valid).toBe(false);
        expect(parseLocationEvidence(42).valid).toBe(false);
    });

    it('rejects non-finite latitude', () => {
        const r = parseLocationEvidence({ latitude: NaN, longitude: 106, accuracy: 10 });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('tidak valid');
    });

    it('rejects out-of-range latitude', () => {
        const r = parseLocationEvidence({ latitude: 999, longitude: 106, accuracy: 10 });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('range');
    });

    it('rejects negative accuracy', () => {
        const r = parseLocationEvidence({ latitude: -6, longitude: 106, accuracy: -5 });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('Akurasi');
    });

    it('rejects NaN accuracy', () => {
        const r = parseLocationEvidence({ latitude: -6, longitude: 106, accuracy: NaN });
        expect(r.valid).toBe(false);
    });

    it('rejects string latitude (no Number coercion)', () => {
        const r = parseLocationEvidence({ latitude: '-6.12', longitude: 106, accuracy: 10 });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('tidak valid');
    });

    it('rejects boolean latitude', () => {
        const r = parseLocationEvidence({ latitude: true, longitude: 106, accuracy: 10 });
        expect(r.valid).toBe(false);
    });

    it('rejects null latitude', () => {
        const r = parseLocationEvidence({ latitude: null, longitude: 106, accuracy: 10 });
        expect(r.valid).toBe(false);
    });

    it('rejects string accuracy', () => {
        const r = parseLocationEvidence({ latitude: -6, longitude: 106, accuracy: '10' });
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toContain('Akurasi');
    });

    it('accepts valid evidence', () => {
        const r = parseLocationEvidence({ latitude: -6.12, longitude: 106.12, accuracy: 10 });
        expect(r.valid).toBe(true);
        if (r.valid) {
            expect(r.evidence.latitude).toBe(-6.12);
            expect(r.evidence.longitude).toBe(106.12);
            expect(r.evidence.accuracy).toBe(10);
        }
    });

    it('accepts zero accuracy', () => {
        const r = parseLocationEvidence({ latitude: -6, longitude: 106, accuracy: 0 });
        expect(r.valid).toBe(true);
    });
});

describe('validateLocation - accuracy edge cases', () => {
    const config: GeofenceConfig = {
        enabled: true,
        latitude: -6.123456,
        longitude: 106.123456,
        radiusMeters: 100,
        maxAccuracyMeters: 50,
    };

    it('rejects negative accuracy', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: -1,
        });
        expect(result.withinFence).toBe(false);
        expect(result.accuracyOk).toBe(false);
        expect(result.reason).toContain('Akurasi');
    });

    it('rejects NaN accuracy', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: NaN,
        });
        expect(result.withinFence).toBe(false);
        expect(result.accuracyOk).toBe(false);
    });

    it('rejects Infinity accuracy', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: Infinity,
        });
        expect(result.withinFence).toBe(false);
        expect(result.accuracyOk).toBe(false);
    });

    it('accepts zero accuracy', () => {
        const result = validateLocation(config, {
            latitude: -6.123456,
            longitude: 106.123456,
            accuracy: 0,
        });
        expect(result.withinFence).toBe(true);
        expect(result.accuracyOk).toBe(true);
    });
});
