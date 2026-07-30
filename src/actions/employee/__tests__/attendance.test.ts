import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));
vi.mock('@/lib/auth/employee-session', () => ({
    getEmployeeSession: vi.fn(),
}));
vi.mock('@/services/hrd/attendance-settings-reader', () => ({
    readAttendanceSettings: vi.fn(),
}));
vi.mock('@/lib/api/rate-limit', () => ({
    rateLimit: vi.fn(() => ({ success: true, count: 1, remaining: 9 })),
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: {
        clockInSelfService: vi.fn(),
        clockOutSelfService: vi.fn(),
        getMyTodayStatus: vi.fn(),
    },
}));
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(() => Promise.resolve(new Map([['x-forwarded-for', '127.0.0.1']]))),
}));

import { getEmployeeSession } from '@/lib/auth/employee-session';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { rateLimit } from '@/lib/api/rate-limit';
import {
    selfServiceClockIn,
    selfServiceClockOut,
    getMyTodayAttendance,
    getMyGeofenceInfo,
} from '../attendance';

describe('selfServiceClockIn', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue(null);

        const result = await selfServiceClockIn('photo-url', {
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns error when rate limited', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(rateLimit).mockReturnValue({ success: false, count: 11, remaining: 0 });

        const result = await selfServiceClockIn('photo-url', {
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terlalu banyak');
    });

    it('returns error when self-service is disabled', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(rateLimit).mockReturnValue({ success: true, count: 1, remaining: 9 });
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'false',
        } as any);

        const result = await selfServiceClockIn('photo-url', {
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('belum diaktifkan');
    });

    it('returns success when clock-in succeeds', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(rateLimit).mockReturnValue({ success: true, count: 1, remaining: 9 });
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        } as any);
        vi.mocked(AttendanceService.clockInSelfService).mockResolvedValue({
            id: 'rec-1',
            employeeId: 'emp-1',
            employeeName: 'Budi',
        } as any);

        const result = await selfServiceClockIn('photo-url', {
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(true);
        expect(AttendanceService.clockInSelfService).toHaveBeenCalled();
    });

    it('maps business errors to user-friendly messages', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(rateLimit).mockReturnValue({ success: true, count: 1, remaining: 9 });
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        } as any);
        vi.mocked(AttendanceService.clockInSelfService).mockRejectedValue(
            new Error('Lokasi 500m dari kantor (batas 100m)'),
        );

        const result = await selfServiceClockIn('photo-url', {
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Lokasi');
    });
});

describe('selfServiceClockOut', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue(null);

        const result = await selfServiceClockOut({
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns success when clock-out succeeds', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(rateLimit).mockReturnValue({ success: true, count: 1, remaining: 9 });
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        } as any);
        vi.mocked(AttendanceService.clockOutSelfService).mockResolvedValue({
            id: 'rec-1',
            employeeId: 'emp-1',
        } as any);

        const result = await selfServiceClockOut({
            latitude: -6.12,
            longitude: 106.12,
            accuracy: 10,
        });

        expect(result.success).toBe(true);
    });
});

describe('getMyTodayAttendance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue(null);

        const result = await getMyTodayAttendance();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns today status', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(AttendanceService.getMyTodayStatus).mockResolvedValue({
            status: 'NOT_CLOCKED_IN',
            record: null,
            shiftName: 'Pagi',
        });

        const result = await getMyTodayAttendance();

        expect(result.success).toBe(true);
        expect(result.data!.status).toBe('NOT_CLOCKED_IN');
    });
});

describe('getMyGeofenceInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when session is missing', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue(null);

        const result = await getMyGeofenceInfo();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
    });

    it('returns null geofence and configInvalid=false when geofence disabled', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'false',
        } as any);

        const result = await getMyGeofenceInfo();

        expect(result.success).toBe(true);
        expect(result.data!.geofence).toBeNull();
        expect(result.data!.configInvalid).toBe(false);
        expect(result.data!.selfServiceEnabled).toBe(true);
    });

    it('returns configInvalid=true when geofenceEnabled but latitude empty', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '',
            'attendance.longitude': '106.12',
            'attendance.radiusMeters': '100',
            'attendance.maxAccuracyMeters': '50',
        } as any);

        const result = await getMyGeofenceInfo();

        expect(result.success).toBe(true);
        expect(result.data!.geofence).toBeNull();
        expect(result.data!.configInvalid).toBe(true);
    });

    it('returns valid geofence config when all values present', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'true',
            'attendance.geofenceEnabled': 'true',
            'attendance.latitude': '-6.123456',
            'attendance.longitude': '106.654321',
            'attendance.radiusMeters': '150',
            'attendance.maxAccuracyMeters': '75',
        } as any);

        const result = await getMyGeofenceInfo();

        expect(result.success).toBe(true);
        expect(result.data!.geofence).not.toBeNull();
        expect(result.data!.geofence!.latitude).toBeCloseTo(-6.123456, 4);
        expect(result.data!.geofence!.longitude).toBeCloseTo(106.654321, 4);
        expect(result.data!.geofence!.radiusMeters).toBe(150);
        expect(result.data!.configInvalid).toBe(false);
        expect(result.data!.selfServiceEnabled).toBe(true);
    });

    it('returns only selfServiceEnabled, geofence, configInvalid fields on success', async () => {
        vi.mocked(getEmployeeSession).mockResolvedValue({
            employeeId: 'emp-1',
            code: 'EMP-001',
            name: 'Budi',
        } as any);
        vi.mocked(readAttendanceSettings).mockResolvedValue({
            'attendance.selfServiceEnabled': 'false',
            'attendance.geofenceEnabled': 'false',
        } as any);

        const result = await getMyGeofenceInfo();

        expect(result.success).toBe(true);
        const keys = Object.keys(result.data!).sort();
        expect(keys).toEqual(['configInvalid', 'geofence', 'selfServiceEnabled']);
    });
});
