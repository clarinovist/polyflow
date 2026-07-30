/**
 * Server-only companion to `attendance-location.ts`.
 *
 * This is the ONLY geofence helper that needs Prisma at runtime (`new Decimal`).
 * It lives in its own module so `attendance-location.ts` stays free of Prisma and
 * can be imported by client components such as `MyAttendanceClock.tsx`. Inlining
 * this back into `attendance-location.ts` pulls the Prisma runtime into the
 * browser bundle and breaks the build with unresolved Node built-ins
 * (`async_hooks`, `fs`, `child_process`).
 */
import { Decimal } from '@prisma/client/runtime/library';
import type { LocationEvidence } from './attendance-location';

export function serializeGeofenceForStorage(evidence: LocationEvidence): {
    latitude: Decimal;
    longitude: Decimal;
    accuracy: Decimal;
} {
    return {
        latitude: new Decimal(evidence.latitude.toFixed(6)),
        longitude: new Decimal(evidence.longitude.toFixed(6)),
        accuracy: new Decimal(evidence.accuracy.toFixed(2)),
    };
}
