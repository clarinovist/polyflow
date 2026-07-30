import { isValidCoordinate } from '@/lib/utils/geo';

export type PositionSample = {
    latitude: number;
    longitude: number;
    accuracy: number;
};

export type SampleBestResult = {
    sample: PositionSample | null;
    permissionDenied: boolean;
};

export const DEFAULT_TARGET_ACCURACY_METERS = 30;
export const DEFAULT_SAMPLE_TIMEOUT_MS = 12_000;

export function pickBestSample(samples: PositionSample[]): PositionSample | null {
    const valid = samples.filter((s) => {
        if (!Number.isFinite(s.accuracy)) return false;
        if (!isValidCoordinate(s.latitude, s.longitude)) return false;
        return true;
    });
    if (valid.length === 0) return null;
    let best = valid[0];
    for (let i = 1; i < valid.length; i++) {
        if (valid[i].accuracy < best.accuracy) {
            best = valid[i];
        }
    }
    return best;
}

export function sampleBestPosition(opts: {
    targetAccuracyMeters: number;
    timeoutMs: number;
}): Promise<SampleBestResult> {
    return new Promise((resolve) => {
        let settled = false;

        function finish(result: SampleBestResult) {
            if (settled) return;
            settled = true;
            resolve(result);
        }

        if (
            typeof navigator === 'undefined' ||
            !navigator.geolocation ||
            typeof navigator.geolocation.watchPosition !== 'function' ||
            typeof navigator.geolocation.clearWatch !== 'function'
        ) {
            finish({ sample: null, permissionDenied: false });
            return;
        }

        const collected: PositionSample[] = [];
        let watchId: number | null = null;
        let timerId: ReturnType<typeof setTimeout> | null = null;

        function cleanup() {
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (watchId !== null) {
                try {
                    navigator.geolocation.clearWatch(watchId);
                } catch {
                    // ignore
                }
                watchId = null;
            }
        }

        function resolveWithCollected() {
            const best = pickBestSample(collected);
            cleanup();
            finish({ sample: best, permissionDenied: false });
        }

        timerId = setTimeout(() => {
            if (settled) return;
            resolveWithCollected();
        }, opts.timeoutMs);

        try {
            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    if (settled) return;
                    const sample: PositionSample = {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                    };
                    collected.push(sample);

                    if (
                        Number.isFinite(sample.accuracy) &&
                        isValidCoordinate(sample.latitude, sample.longitude) &&
                        sample.accuracy <= opts.targetAccuracyMeters
                    ) {
                        const best = pickBestSample(collected);
                        cleanup();
                        finish({
                            sample: best ?? sample,
                            permissionDenied: false,
                        });
                    }
                },
                (err: GeolocationPositionError) => {
                    if (settled) return;
                    const permDenied =
                        (err as GeolocationPositionError).code ===
                        (err as GeolocationPositionError).PERMISSION_DENIED;
                    if (collected.length === 0) {
                        cleanup();
                        finish({
                            sample: null,
                            permissionDenied: permDenied,
                        });
                    } else {
                        // We have some samples; return best so far unless perm denied with no valid best
                        // Still must clear watch
                        resolveWithCollected();
                    }
                },
                { enableHighAccuracy: true, maximumAge: 0 },
            );
            if (settled) {
                // A synchronous callback already finished us; the id did not exist
                // yet when cleanup() ran, so clear it now.
                try {
                    navigator.geolocation.clearWatch(id);
                } catch {
                    // ignore
                }
            } else {
                watchId = id;
            }
        } catch {
            cleanup();
            finish({ sample: null, permissionDenied: false });
        }
    });
}
