import { describe, it, expect } from 'vitest';
import {
    isValidCoordinate,
    haversineDistance,
    haversineTotalDistance,
    estimateRouteDurationMinutes,
    formatDistance,
    formatDuration,
} from '../geo';

describe('isValidCoordinate', () => {
    it('returns true for valid coordinates', () => {
        expect(isValidCoordinate(0, 0)).toBe(true);
        expect(isValidCoordinate(-6.2088, 106.8456)).toBe(true);
        expect(isValidCoordinate(90, 180)).toBe(true);
        expect(isValidCoordinate(-90, -180)).toBe(true);
    });

    it('returns false for null/undefined', () => {
        expect(isValidCoordinate(null, null)).toBe(false);
        expect(isValidCoordinate(undefined, undefined)).toBe(false);
        expect(isValidCoordinate(0, null)).toBe(false);
        expect(isValidCoordinate(null, 0)).toBe(false);
    });

    it('returns false for NaN', () => {
        expect(isValidCoordinate(NaN, 0)).toBe(false);
        expect(isValidCoordinate(0, NaN)).toBe(false);
    });

    it('returns false for Infinity', () => {
        expect(isValidCoordinate(Infinity, 0)).toBe(false);
        expect(isValidCoordinate(0, Infinity)).toBe(false);
    });

    it('returns false for out-of-range', () => {
        expect(isValidCoordinate(91, 0)).toBe(false);
        expect(isValidCoordinate(-91, 0)).toBe(false);
        expect(isValidCoordinate(0, 181)).toBe(false);
        expect(isValidCoordinate(0, -181)).toBe(false);
    });

    it('returns false for non-number types', () => {
        expect(isValidCoordinate('abc' as unknown as number, 0)).toBe(false);
        expect(isValidCoordinate(0, 'abc' as unknown as number)).toBe(false);
    });
});

describe('haversineDistance', () => {
    it('returns 0 for same point', () => {
        expect(haversineDistance(-6.2088, 106.8456, -6.2088, 106.8456)).toBe(0);
    });

    it('approximates 1° longitude at equator (~111.195 km)', () => {
        const d = haversineDistance(0, 0, 0, 1);
        expect(d).toBeGreaterThan(110_000);
        expect(d).toBeLessThan(112_000);
    });

    it('approximates Jakarta to Bandung (~120 km)', () => {
        const d = haversineDistance(-6.2088, 106.8456, -6.9175, 107.6191);
        expect(d).toBeGreaterThan(100_000);
        expect(d).toBeLessThan(150_000);
    });
});

describe('haversineTotalDistance', () => {
    it('returns 0 for empty array', () => {
        expect(haversineTotalDistance([])).toBe(0);
    });

    it('returns 0 for single point', () => {
        expect(haversineTotalDistance([{ lat: -6.2, lon: 106.8 }])).toBe(0);
    });

    it('sums distances for multiple points', () => {
        const points = [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 1 },
            { lat: 0, lon: 2 },
        ];
        const total = haversineTotalDistance(points);
        const single = haversineDistance(0, 0, 0, 1);
        expect(total).toBeCloseTo(single * 2, -2);
    });
});

describe('estimateRouteDurationMinutes', () => {
    it('calculates travel + visit time with defaults', () => {
        const result = estimateRouteDurationMinutes({
            distanceMeters: 23_000,
            stopCount: 12,
        });
        // 23 km / 30 km/h * 60 = 46 min travel
        // 12 * 15 = 180 min visit
        expect(result).toBeCloseTo(226, 0);
    });

    it('uses custom speed and minutes per stop', () => {
        const result = estimateRouteDurationMinutes({
            distanceMeters: 10_000,
            stopCount: 5,
            averageSpeedKmh: 40,
            minutesPerStop: 10,
        });
        // 10 km / 40 km/h * 60 = 15 min travel
        // 5 * 10 = 50 min visit
        expect(result).toBeCloseTo(65, 0);
    });

    it('handles 0 distance', () => {
        const result = estimateRouteDurationMinutes({
            distanceMeters: 0,
            stopCount: 3,
        });
        expect(result).toBe(45);
    });

    it('handles fewer than 2 GPS points (distance 0) but still counts stops', () => {
        const result = estimateRouteDurationMinutes({
            distanceMeters: 0,
            stopCount: 1,
        });
        expect(result).toBe(15);
    });
});

describe('formatDistance', () => {
    it('formats meters under 1000', () => {
        expect(formatDistance(850)).toBe('850 m');
    });

    it('formats kilometers', () => {
        expect(formatDistance(1500)).toBe('1.5 km');
    });

    it('formats whole km without decimal', () => {
        expect(formatDistance(3000)).toBe('3 km');
    });

    it('returns dash for non-finite', () => {
        expect(formatDistance(NaN)).toBe('-');
        expect(formatDistance(Infinity)).toBe('-');
    });
});

describe('formatDuration', () => {
    it('formats hours and minutes', () => {
        expect(formatDuration(226)).toBe('3j 46m');
    });

    it('formats minutes only', () => {
        expect(formatDuration(45)).toBe('45 menit');
    });

    it('formats exact hours', () => {
        expect(formatDuration(120)).toBe('2 jam');
    });

    it('rounds 119.9 to 2j 0m not 1j 60m', () => {
        expect(formatDuration(119.9)).toBe('2 jam');
    });

    it('rounds 59.6 to 1j 0m', () => {
        expect(formatDuration(59.6)).toBe('1 jam');
    });

    it('returns 0 menit for 0', () => {
        expect(formatDuration(0)).toBe('0 menit');
    });

    it('returns dash for negative', () => {
        expect(formatDuration(-5)).toBe('-');
    });
});
