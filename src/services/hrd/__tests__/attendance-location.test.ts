import { describe, it, expect } from 'vitest';
import {
    parseGeofenceConfig,
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
