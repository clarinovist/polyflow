import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickBestSample, sampleBestPosition, type PositionSample } from '../geolocation-sampler';

describe('pickBestSample', () => {
    it('returns null for empty array', () => {
        expect(pickBestSample([])).toBeNull();
    });

    it('returns the single sample', () => {
        const s: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: 50 };
        const result = pickBestSample([s]);
        expect(result).toEqual(s);
    });

    it('picks smallest accuracy', () => {
        const a: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: 100 };
        const b: PositionSample = { latitude: -6.21, longitude: 106.81, accuracy: 20 };
        const c: PositionSample = { latitude: -6.22, longitude: 106.82, accuracy: 50 };
        const result = pickBestSample([a, b, c]);
        expect(result).not.toBeNull();
        expect(result!.accuracy).toBe(20);
        expect(result!.latitude).toBe(-6.21);
    });

    it('drops invalid coordinates', () => {
        const invalid: PositionSample = { latitude: 91, longitude: 0, accuracy: 5 };
        const valid: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: 100 };
        const result = pickBestSample([invalid, valid]);
        expect(result).not.toBeNull();
        expect(result!.accuracy).toBe(100);
    });

    it('drops non-finite accuracy', () => {
        const bad: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: NaN };
        const good: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: 30 };
        const result = pickBestSample([bad, good]);
        expect(result).not.toBeNull();
        expect(result!.accuracy).toBe(30);
    });

    it('drops Infinity accuracy', () => {
        const bad: PositionSample = { latitude: -6.2, longitude: 106.8, accuracy: Infinity };
        const result = pickBestSample([bad]);
        expect(result).toBeNull();
    });

    it('returns null when all invalid', () => {
        const samples: PositionSample[] = [
            { latitude: 91, longitude: 0, accuracy: 10 },
            { latitude: -6.2, longitude: 106.8, accuracy: NaN },
        ];
        expect(pickBestSample(samples)).toBeNull();
    });

    it('drops NaN latitude', () => {
        const s: PositionSample = { latitude: NaN, longitude: 106.8, accuracy: 10 };
        expect(pickBestSample([s])).toBeNull();
    });
});

// --- sampleBestPosition ---

type WatchCb = (pos: GeolocationPosition) => void;
type ErrorCb = (err: GeolocationPositionError) => void;

function makePos(lat: number, lon: number, acc: number): GeolocationPosition {
    return {
        coords: {
            latitude: lat,
            longitude: lon,
            accuracy: acc,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
        },
        timestamp: Date.now(),
    } as unknown as GeolocationPosition;
}

function makeGeoError(code: number): GeolocationPositionError {
    const err = { code, message: 'error', PERMISSION_DENIED: 1 } as unknown as GeolocationPositionError;
    return err;
}

describe('sampleBestPosition', () => {
    let watchCb: WatchCb | null = null;
    let errorCb: ErrorCb | null = null;
    let watchIdCounter = 0;
    let lastWatchId = 0;
    let clearWatchCalls: number[] = [];

    function setupGeolocationMock() {
        watchCb = null;
        errorCb = null;
        watchIdCounter = 0;
        lastWatchId = 0;
        clearWatchCalls = [];

        const geo = {
            watchPosition: vi.fn((success: WatchCb, error: ErrorCb) => {
                watchCb = success;
                errorCb = error;
                watchIdCounter += 1;
                lastWatchId = watchIdCounter;
                return watchIdCounter;
            }),
            clearWatch: vi.fn((id: number) => {
                clearWatchCalls.push(id);
            }),
            getCurrentPosition: vi.fn(),
        };

        Object.defineProperty(globalThis, 'navigator', {
            value: { geolocation: geo },
            writable: true,
            configurable: true,
        });

        return geo;
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        // clean navigator mock
        delete (globalThis as unknown as { navigator?: unknown }).navigator;
    });

    it('resolves early when a sample meets target accuracy and calls clearWatch with correct id', async () => {
        const geo = setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        // first poor fix
        expect(watchCb).not.toBeNull();
        watchCb!(makePos(-6.2, 106.8, 100));
        // not yet resolved, now good fix
        watchCb!(makePos(-6.201, 106.801, 15));

        const result = await promise;

        expect(result.sample).not.toBeNull();
        expect(result.sample!.accuracy).toBe(15);
        expect(result.permissionDenied).toBe(false);
        expect(geo.clearWatch).toHaveBeenCalledWith(lastWatchId);
        expect(clearWatchCalls).toEqual([lastWatchId]);
    });

    it('on timeout returns best collected so far and clearWatch called', async () => {
        const geo = setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        watchCb!(makePos(-6.2, 106.8, 100));
        watchCb!(makePos(-6.21, 106.81, 60));

        vi.advanceTimersByTime(12_000);
        const result = await promise;

        expect(result.sample).not.toBeNull();
        expect(result.sample!.accuracy).toBe(60);
        expect(geo.clearWatch).toHaveBeenCalledWith(lastWatchId);
    });

    it('returns null when no samples arrive before timeout', async () => {
        const geo = setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        vi.advanceTimersByTime(12_000);
        const result = await promise;

        expect(result.sample).toBeNull();
        expect(result.permissionDenied).toBe(false);
        expect(geo.clearWatch).toHaveBeenCalledWith(lastWatchId);
    });

    it('returns null on geolocation error with no samples and calls clearWatch', async () => {
        const geo = setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        errorCb!(makeGeoError(2)); // POSITION_UNAVAILABLE

        const result = await promise;

        expect(result.sample).toBeNull();
        expect(geo.clearWatch).toHaveBeenCalledWith(lastWatchId);
    });

    it('reports permissionDenied when PERMISSION_DENIED error', async () => {
        setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        errorCb!(makeGeoError(1));

        const result = await promise;
        expect(result.sample).toBeNull();
        expect(result.permissionDenied).toBe(true);
    });

    it('returns null when navigator.geolocation unavailable', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {},
            writable: true,
            configurable: true,
        });
        const result = await sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 1000 });
        expect(result.sample).toBeNull();
    });

    it('clearWatch called on error path even after some samples collected', async () => {
        const geo = setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 10, timeoutMs: 12_000 });

        watchCb!(makePos(-6.2, 106.8, 80));
        errorCb!(makeGeoError(2));

        const result = await promise;

        expect(result.sample).not.toBeNull();
        expect(result.sample!.accuracy).toBe(80);
        expect(geo.clearWatch).toHaveBeenCalledWith(lastWatchId);
    });

    it('resolves exactly once even if multiple good fixes arrive after early resolve', async () => {
        setupGeolocationMock();

        const promise = sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        watchCb!(makePos(-6.2, 106.8, 10));
        const r1 = await promise;
        expect(r1.sample!.accuracy).toBe(10);

        // late arrival should not cause second resolve
        watchCb!(makePos(-6.2, 106.8, 5));
        vi.advanceTimersByTime(12_000);
        const r2 = await promise;
        // same object as first
        expect(r2.sample!.accuracy).toBe(10);
    });

    // --- synchronous callback edge cases (Fix 1 regression) ---

    it('handles synchronous success callback meeting target accuracy: resolves AND clearWatch called once with returned id', async () => {
        let syncCounter = 0;
        let syncLastId = 0;
        const syncClearCalls: number[] = [];

        const geo = {
            watchPosition: vi.fn((success: WatchCb) => {
                // Invoke synchronously BEFORE returning, like some WebViews / Capacitor plugins
                success(makePos(-6.2, 106.8, 10));
                syncCounter += 1;
                syncLastId = syncCounter;
                return syncCounter;
            }),
            clearWatch: vi.fn((id: number) => {
                syncClearCalls.push(id);
            }),
            getCurrentPosition: vi.fn(),
        };

        Object.defineProperty(globalThis, 'navigator', {
            value: { geolocation: geo },
            writable: true,
            configurable: true,
        });

        const result = await sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        expect(result.sample).not.toBeNull();
        expect(result.sample!.accuracy).toBe(10);
        expect(result.permissionDenied).toBe(false);
        // Must have cleared the watch even though callback was synchronous
        expect(syncClearCalls).toEqual([syncLastId]);
        expect(syncClearCalls).toHaveLength(1);
        expect(geo.clearWatch).toHaveBeenCalledTimes(1);
    });

    it('handles synchronous PERMISSION_DENIED error: resolves permDenied AND clearWatch called once', async () => {
        let syncCounter = 0;
        let syncLastId = 0;
        const syncClearCalls: number[] = [];

        const geo = {
            watchPosition: vi.fn((_success: WatchCb, error: ErrorCb) => {
                error(makeGeoError(1));
                syncCounter += 1;
                syncLastId = syncCounter;
                return syncCounter;
            }),
            clearWatch: vi.fn((id: number) => {
                syncClearCalls.push(id);
            }),
            getCurrentPosition: vi.fn(),
        };

        Object.defineProperty(globalThis, 'navigator', {
            value: { geolocation: geo },
            writable: true,
            configurable: true,
        });

        const result = await sampleBestPosition({ targetAccuracyMeters: 30, timeoutMs: 12_000 });

        expect(result.sample).toBeNull();
        expect(result.permissionDenied).toBe(true);
        expect(syncClearCalls).toEqual([syncLastId]);
        expect(syncClearCalls).toHaveLength(1);
        expect(geo.clearWatch).toHaveBeenCalledTimes(1);
    });
});
