import {
    formatDistance,
    haversineDistance,
    isValidCoordinate,
} from '@/lib/utils/geo';

export interface GeofenceConfig {
    enabled: boolean;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    maxAccuracyMeters: number;
}

export interface LocationEvidence {
    latitude: number;
    longitude: number;
    accuracy: number;
}

export interface GeofenceResult {
    withinFence: boolean;
    distanceMeters: number;
    accuracyOk: boolean;
    reason?: string;
}

export type GeofenceResolution =
    | { kind: 'disabled' }
    | { kind: 'invalid'; reason: string }
    | { kind: 'active'; config: GeofenceConfig };

export function resolveGeofence(
    settings: Record<string, string | null | undefined>,
): GeofenceResolution {
    if (settings['attendance.geofenceEnabled'] !== 'true') {
        return { kind: 'disabled' };
    }

    const lat = parseFloat(settings['attendance.latitude'] ?? '');
    const lon = parseFloat(settings['attendance.longitude'] ?? '');
    const radius = parseFloat(settings['attendance.radiusMeters'] ?? '');
    const accuracy = parseFloat(settings['attendance.maxAccuracyMeters'] ?? '');

    if (!isValidCoordinate(lat, lon)) {
        return {
            kind: 'invalid',
            reason: 'Koordinat kantor belum diisi atau tidak valid',
        };
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        return {
            kind: 'invalid',
            reason: 'Radius geofence belum diisi atau tidak valid',
        };
    }
    if (!Number.isFinite(accuracy) || accuracy <= 0) {
        return {
            kind: 'invalid',
            reason: 'Batas akurasi GPS belum diisi atau tidak valid',
        };
    }

    return {
        kind: 'active',
        config: {
            enabled: true,
            latitude: lat,
            longitude: lon,
            radiusMeters: radius,
            maxAccuracyMeters: accuracy,
        },
    };
}

export function parseGeofenceConfig(
    settings: Record<string, string | null | undefined>,
): GeofenceConfig | null {
    const resolution = resolveGeofence(settings);
    if (resolution.kind === 'active') {
        return resolution.config;
    }
    return null;
}

export function validateLocation(
    config: GeofenceConfig,
    evidence: LocationEvidence,
): GeofenceResult {
    if (!isValidCoordinate(evidence.latitude, evidence.longitude)) {
        return {
            withinFence: false,
            distanceMeters: Infinity,
            accuracyOk: false,
            reason: 'Koordinat tidak valid',
        };
    }

    const accuracyOk = evidence.accuracy <= config.maxAccuracyMeters;

    const distance = haversineDistance(
        config.latitude,
        config.longitude,
        evidence.latitude,
        evidence.longitude,
    );

    const withinFence = distance <= config.radiusMeters && accuracyOk;

    let reason: string | undefined;
    if (!accuracyOk) {
        reason = `Akurasi GPS ${Math.round(evidence.accuracy)}m melebihi batas ${config.maxAccuracyMeters}m`;
    } else if (!withinFence) {
        reason = `Lokasi ${Math.round(distance)}m dari kantor (batas ${config.radiusMeters}m)`;
    }

    return {
        withinFence,
        distanceMeters: distance,
        accuracyOk,
        reason,
    };
}

export function isSelfServiceEnabled(
    settings: Record<string, string | null | undefined>,
): boolean {
    return settings['attendance.selfServiceEnabled'] === 'true';
}

export function getLateGraceMinutes(
    settings: Record<string, string | null | undefined>,
): number {
    const val = parseInt(settings['attendance.lateGraceMinutes'] ?? '0', 10);
    return Number.isFinite(val) && val >= 0 ? val : 0;
}

export function validateSelfServicePrerequisites(
    settings: Record<string, string | null | undefined>,
): { ready: boolean; reason?: string } {
    if (!isSelfServiceEnabled(settings)) {
        return { ready: false, reason: 'Self-service absensi belum diaktifkan oleh HRD' };
    }

    const resolution = resolveGeofence(settings);
    if (resolution.kind === 'invalid') {
        return { ready: false, reason: 'Konfigurasi geofence belum lengkap' };
    }

    return { ready: true };
}

export type ProximityState =
    | { kind: 'no-geofence' }
    | { kind: 'waiting-gps' }
    | { kind: 'accuracy-poor'; accuracy: number; limit: number; message: string }
    | { kind: 'outside'; distanceMeters: number; radiusMeters: number; message: string }
    | { kind: 'inside'; distanceMeters: number; radiusMeters: number; message: string };

export function describeGeofenceProximity(
    config: GeofenceConfig | null,
    evidence: LocationEvidence | null,
): ProximityState {
    if (config === null) {
        return { kind: 'no-geofence' };
    }

    if (
        evidence === null ||
        !isValidCoordinate(evidence.latitude, evidence.longitude) ||
        !Number.isFinite(evidence.accuracy)
    ) {
        return { kind: 'waiting-gps' };
    }

    if (evidence.accuracy > config.maxAccuracyMeters) {
        const limit = config.maxAccuracyMeters;
        return {
            kind: 'accuracy-poor',
            accuracy: evidence.accuracy,
            limit,
            message: `Akurasi GPS ±${Math.round(evidence.accuracy)}m, dibutuhkan ±${limit}m atau lebih baik`,
        };
    }

    const distance = haversineDistance(
        config.latitude,
        config.longitude,
        evidence.latitude,
        evidence.longitude,
    );

    if (distance > config.radiusMeters) {
        return {
            kind: 'outside',
            distanceMeters: distance,
            radiusMeters: config.radiusMeters,
            message: `Anda ${formatDistance(distance)} dari kantor — di luar radius ${formatDistance(config.radiusMeters)}`,
        };
    }

    return {
        kind: 'inside',
        distanceMeters: distance,
        radiusMeters: config.radiusMeters,
        message: `Anda ${formatDistance(distance)} dari kantor — di dalam area absensi`,
    };
}
