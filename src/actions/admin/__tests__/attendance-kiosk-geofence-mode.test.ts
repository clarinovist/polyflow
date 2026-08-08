import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getKioskGeofenceMode } from '../attendance';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    withTenantRoute: (fn: any) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map()),
}));

/**
 * The kiosk uses this mode to decide whether a missing GPS fix blocks the form.
 * Reporting `enforce` when the tenant is only observing would recreate the
 * outage client-side, so the mapping is worth pinning down.
 */
describe('getKioskGeofenceMode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function armSettings(rows: { key: string; value: string }[]) {
        vi.mocked(prisma.appSetting.findMany).mockResolvedValue(rows as any);
    }

    it('reports the explicit mode', async () => {
        armSettings([{ key: 'attendance.geofenceMode', value: 'observe' }]);
        const res = await getKioskGeofenceMode();
        expect(res).toEqual({ success: true, data: 'observe' });
    });

    it('falls back to the legacy boolean when the mode key is absent', async () => {
        armSettings([{ key: 'attendance.geofenceEnabled', value: 'true' }]);
        const res = await getKioskGeofenceMode();
        expect(res.data).toBe('enforce');
    });

    it('reports off when nothing is configured', async () => {
        armSettings([]);
        const res = await getKioskGeofenceMode();
        expect(res.data).toBe('off');
    });

    it('degrades to off rather than failing when settings cannot be read', async () => {
        vi.mocked(prisma.appSetting.findMany).mockRejectedValue(
            new Error('db down'),
        );
        const res = await getKioskGeofenceMode();
        // The kiosk gate is a convenience; the server enforces independently,
        // so an unreadable setting must not take the attendance form down.
        expect(res).toEqual({ success: true, data: 'off' });
    });
});
