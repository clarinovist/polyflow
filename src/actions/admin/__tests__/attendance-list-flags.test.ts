import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listAttendance, listNoRecordAttendance } from '../attendance';
import { requireAuth } from '@/lib/tools/auth-checks';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { AttendanceRosterService } from '@/services/hrd/attendance-roster-service';
import { logger } from '@/lib/config/logger';

const mocks = vi.hoisted(() => ({
    settingFindMany: vi.fn(),
    shiftFindMany: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: { findMany: mocks.settingFindMany },
        workShift: { findMany: mocks.shiftFindMany },
    },
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: { listByDate: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-roster-service', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@/services/hrd/attendance-roster-service')
    >()),
    AttendanceRosterService: { listNoRecord: vi.fn() },
}));

const DENIED_ERROR = 'Anda tidak memiliki akses untuk aksi ini';
const VALID_PHOTO = '/api/images/acme/attendance/emp-1/in-1.jpg';
const sessionFor = (role: string) =>
    ({ user: { id: 'user-1', role, tenantId: 'acme' } }) as never;

const baseRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'r-1',
    employeeId: 'emp-1',
    workShiftId: 'shift-1',
    status: 'PRESENT',
    clockInAt: new Date('2026-11-10T00:00:00.000Z'),
    clockInPhotoUrl: VALID_PHOTO,
    clockInDistance: 10,
    ...overrides,
});

function settingsRows(entries: Record<string, string>) {
    return Object.entries(entries).map(([key, value]) => ({ key, value }));
}

describe('listAttendance — penanda turunan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
        mocks.shiftFindMany.mockResolvedValue([
            { id: 'shift-1', startTime: '07:00' },
        ]);
        mocks.settingFindMany.mockResolvedValue(
            settingsRows({
                'attendance.lateGraceMinutes': '10',
                'attendance.radiusMeters': '100',
            }),
        );
    });

    it('adds isLate, isOutsideRadius and hasValidSelfie per record', async () => {
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([
            baseRecord(),
            baseRecord({
                id: 'r-2',
                employeeId: 'emp-2',
                clockInAt: new Date('2026-11-10T00:30:00.000Z'),
                clockInDistance: 450,
                clockInPhotoUrl: null,
            }),
        ] as never);

        const res = (await listAttendance('2026-11-10')) as unknown as {
            success: boolean;
            data: Array<Record<string, unknown>>;
        };

        expect(res.success).toBe(true);
        expect(res.data[0]).toMatchObject({
            id: 'r-1',
            isLate: false,
            isOutsideRadius: false,
            hasValidSelfie: true,
        });
        expect(res.data[1]).toMatchObject({
            id: 'r-2',
            isLate: true,
            isOutsideRadius: true,
            hasValidSelfie: false,
        });
    });

    it('reads settings and shift start times once, not per record', async () => {
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([
            baseRecord(),
            baseRecord({ id: 'r-2', employeeId: 'emp-2' }),
            baseRecord({ id: 'r-3', employeeId: 'emp-3' }),
        ] as never);

        await listAttendance('2026-11-10');

        expect(mocks.settingFindMany).toHaveBeenCalledTimes(1);
        expect(mocks.shiftFindMany).toHaveBeenCalledTimes(1);
    });

    it('never flags outside radius when no radius is configured', async () => {
        mocks.settingFindMany.mockResolvedValue([]);
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([
            baseRecord({ clockInDistance: 9000 }),
        ] as never);

        const res = (await listAttendance('2026-11-10')) as unknown as {
            data: Array<{ isOutsideRadius: boolean }>;
        };

        expect(res.data[0].isOutsideRadius).toBe(false);
    });

    it('skips the extra queries for an empty day', async () => {
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([] as never);

        const res = await listAttendance('2026-11-10');

        expect(res).toEqual({ success: true, data: [] });
        expect(mocks.shiftFindMany).not.toHaveBeenCalled();
    });

    it('returns a failure (not an empty list) when settings cannot be read', async () => {
        mocks.settingFindMany.mockRejectedValue(new Error('db down'));
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([
            baseRecord(),
        ] as never);

        const res = await listAttendance('2026-11-10');

        expect(res).toEqual({
            success: false,
            error: 'Gagal memuat data absensi',
        });
        expect(logger.error).toHaveBeenCalled();
    });
});

describe('listNoRecordAttendance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'menolak peran %s tanpa menyentuh data',
        async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await listNoRecordAttendance('2026-11-10');

            expect(res).toEqual({ success: false, error: DENIED_ERROR });
            expect(AttendanceRosterService.listNoRecord).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('menerima peran %s', async (role) => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));
        vi.mocked(AttendanceRosterService.listNoRecord).mockResolvedValue({
            isNonWorkingDay: false,
            employees: [],
        });

        const res = await listNoRecordAttendance('2026-11-10');

        expect(res).toEqual({
            success: true,
            data: { isNonWorkingDay: false, employees: [] },
        });
    });

    it('passes the parsed UTC date to the roster service', async () => {
        vi.mocked(AttendanceRosterService.listNoRecord).mockResolvedValue({
            isNonWorkingDay: false,
            employees: [],
        });

        await listNoRecordAttendance('2026-11-10');

        expect(AttendanceRosterService.listNoRecord).toHaveBeenCalledWith(
            expect.anything(),
            new Date('2026-11-10T00:00:00.000Z'),
        );
    });

    it('rejects a malformed date without querying', async () => {
        const res = await listNoRecordAttendance('besok');

        expect(res).toEqual({ success: false, error: 'Tanggal tidak valid' });
        expect(AttendanceRosterService.listNoRecord).not.toHaveBeenCalled();
    });

    it('rethrows the login redirect', async () => {
        vi.mocked(requireAuth).mockRejectedValue(
            Object.assign(new Error('NEXT_REDIRECT'), {
                digest: 'NEXT_REDIRECT;replace;/login;307;',
            }),
        );

        await expect(listNoRecordAttendance('2026-11-10')).rejects.toThrow(
            'NEXT_REDIRECT',
        );
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs and returns a generic failure when the roster query fails', async () => {
        vi.mocked(AttendanceRosterService.listNoRecord).mockRejectedValue(
            new Error('db down'),
        );

        const res = await listNoRecordAttendance('2026-11-10');

        expect(res).toEqual({
            success: false,
            error: 'Gagal memuat daftar belum absen',
        });
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
