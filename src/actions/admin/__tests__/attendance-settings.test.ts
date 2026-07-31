import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAttendanceSettings, saveAttendanceSettings } from '../attendance-settings';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { isTenantAdmin } from '@/lib/auth/roles';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
    isTenantAdmin: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

describe('attendance-settings action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getAttendanceSettings', () => {
        it('returns authorization error if user is not tenant admin', async () => {
            vi.mocked(auth).mockResolvedValue(null as any);
            vi.mocked(isTenantAdmin).mockReturnValue(false);

            const res = await getAttendanceSettings();
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).toBe('Hanya admin yang dapat mengubah pengaturan absensi.');
            }
        });

        it('returns attendance settings with defaults when db rows are missing', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'admin-1', role: 'TENANT_ADMIN' },
            } as any);
            vi.mocked(isTenantAdmin).mockReturnValue(true);
            vi.mocked(prisma.appSetting.findMany).mockResolvedValue([]);

            const res = await getAttendanceSettings();
            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data).toEqual({
                    selfServiceEnabled: false,
                    geofenceEnabled: false,
                    latitude: '',
                    longitude: '',
                    radiusMeters: '100',
                    maxAccuracyMeters: '50',
                    lateGraceMinutes: '0',
                });
            }
        });

        it('returns attendance settings from db rows when present', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'admin-1', role: 'TENANT_ADMIN' },
            } as any);
            vi.mocked(isTenantAdmin).mockReturnValue(true);
            vi.mocked(prisma.appSetting.findMany).mockResolvedValue([
                { key: 'attendance.selfServiceEnabled', value: 'true' },
                { key: 'attendance.geofenceEnabled', value: 'true' },
                { key: 'attendance.latitude', value: '-6.123' },
                { key: 'attendance.longitude', value: '106.123' },
                { key: 'attendance.radiusMeters', value: '200' },
                { key: 'attendance.maxAccuracyMeters', value: '30' },
                { key: 'attendance.lateGraceMinutes', value: '15' },
            ] as any);

            const res = await getAttendanceSettings();
            expect(res.success).toBe(true);
            if (res.success) {
                expect(res.data).toEqual({
                    selfServiceEnabled: true,
                    geofenceEnabled: true,
                    latitude: '-6.123',
                    longitude: '106.123',
                    radiusMeters: '200',
                    maxAccuracyMeters: '30',
                    lateGraceMinutes: '15',
                });
            }
        });
    });

    describe('saveAttendanceSettings', () => {
        beforeEach(() => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'admin-1', role: 'TENANT_ADMIN' },
            } as any);
            vi.mocked(isTenantAdmin).mockReturnValue(true);
        });

        it('saves settings successfully when geofence is disabled and lat/lng are empty', async () => {
            vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

            const res = await saveAttendanceSettings({
                selfServiceEnabled: false,
                geofenceEnabled: false,
                latitude: '',
                longitude: '',
                radiusMeters: '',
                maxAccuracyMeters: '',
                lateGraceMinutes: '',
            });

            expect(res.success).toBe(true);
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('fails validation when geofence is enabled but latitude/longitude are empty', async () => {
            const res = await saveAttendanceSettings({
                selfServiceEnabled: true,
                geofenceEnabled: true,
                latitude: '',
                longitude: '',
                radiusMeters: '100',
                maxAccuracyMeters: '50',
                lateGraceMinutes: '0',
            });

            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).toBeDefined();
            }
        });

        it('saves settings successfully when geofence is enabled and lat/lng are valid', async () => {
            vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

            const res = await saveAttendanceSettings({
                selfServiceEnabled: true,
                geofenceEnabled: true,
                latitude: '-6.12345',
                longitude: '106.12345',
                radiusMeters: '150',
                maxAccuracyMeters: '40',
                lateGraceMinutes: '10',
            });

            expect(res.success).toBe(true);
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('fails validation when radius is invalid', async () => {
            const res = await saveAttendanceSettings({
                selfServiceEnabled: false,
                geofenceEnabled: false,
                latitude: '',
                longitude: '',
                radiusMeters: '-10',
                maxAccuracyMeters: '50',
                lateGraceMinutes: '0',
            });

            expect(res.success).toBe(false);
        });

        it('fails when self-service is ON but geofence is OFF', async () => {
            const res = await saveAttendanceSettings({
                selfServiceEnabled: true,
                geofenceEnabled: false,
                latitude: '',
                longitude: '',
                radiusMeters: '100',
                maxAccuracyMeters: '50',
                lateGraceMinutes: '0',
            });

            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).toContain('Self-service');
                expect(res.error).toContain('geofence aktif');
            }
        });

        it('succeeds when both self-service and geofence are ON', async () => {
            vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

            const res = await saveAttendanceSettings({
                selfServiceEnabled: true,
                geofenceEnabled: true,
                latitude: '-6.12345',
                longitude: '106.12345',
                radiusMeters: '150',
                maxAccuracyMeters: '40',
                lateGraceMinutes: '10',
            });

            expect(res.success).toBe(true);
        });
    });
});
