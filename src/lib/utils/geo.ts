export type GeoPoint = { lat: number; lon: number };

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_SPEED_KMH = 30;
const DEFAULT_MINUTES_PER_STOP = 15;

export function isValidCoordinate(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
): boolean {
    if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
    ) {
        return false;
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return false;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return false;
    }
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;
    return true;
}

export function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineTotalDistance(points: GeoPoint[]): number {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineDistance(
            points[i - 1].lat,
            points[i - 1].lon,
            points[i].lat,
            points[i].lon,
        );
    }
    return total;
}

export function estimateRouteDurationMinutes(input: {
    distanceMeters: number;
    stopCount: number;
    averageSpeedKmh?: number;
    minutesPerStop?: number;
}): number {
    const speed = input.averageSpeedKmh ?? DEFAULT_SPEED_KMH;
    const minsPerStop = input.minutesPerStop ?? DEFAULT_MINUTES_PER_STOP;
    const travelMinutes = (input.distanceMeters / 1000 / speed) * 60;
    const visitMinutes = input.stopCount * minsPerStop;
    return travelMinutes + visitMinutes;
}

export function formatDistance(meters: number): string {
    if (!Number.isFinite(meters)) return '-';
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    const km = meters / 1000;
    return `${km.toFixed(1).replace(/\.0$/, '')} km`;
}

export function formatDuration(minutes: number): string {
    if (!Number.isFinite(minutes) || minutes < 0) return '-';
    if (minutes === 0) return '0 menit';
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours === 0) return `${mins} menit`;
    if (mins === 0) return `${hours} jam`;
    return `${hours}j ${mins}m`;
}
