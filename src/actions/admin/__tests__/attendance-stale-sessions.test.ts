import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listStaleOpenSessions } from '../attendance';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';

const mocks = vi.hoisted(() => ({ recordFindMany: vi.fn() }));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { attendanceRecord: { findMany: mocks.recordFindMany } },
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

const DENIED_ERROR = 'Anda tidak memiliki akses untuk aksi ini';
const NOW = new Date('2026-11-11T03:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

const sessionFor = (role: string) =>
    ({ user: { id: 'user-1', role, tenantId: 'acme' } }) as never;

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

const staleRow = (id: string, hoursOpen: number) => ({
    id,
    employeeId: `emp-${id}`,
    workDate: new Date('2026-11-09T00:00:00.000Z'),
    clockInAt: new Date(NOW.getTime() - hoursOpen * HOUR_MS),
    clockOutAt: null,
    employee: { name: 'Budi Contoh', code: 'E001' },
    workShift: {
        id: 's1',
        name: 'Pagi',
        startTime: '07:00',
        endTime: '15:00',
    },
});

describe('listStaleOpenSessions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        mocks.recordFindMany.mockResolvedValue([]);
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'menolak peran %s tanpa menyentuh data',
        async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await listStaleOpenSessions();

            expect(res).toEqual({ success: false, error: DENIED_ERROR });
            expect(mocks.recordFindMany).not.toHaveBeenCalled();
        },
    );

    it('melempar ulang redirect login saat tanpa sesi', async () => {
        vi.mocked(requireAuth).mockRejectedValue(redirectError());

        await expect(listStaleOpenSessions()).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
        expect(mocks.recordFindMany).not.toHaveBeenCalled();
    });

    it.each(['ADMIN', 'FINANCE', 'HRD'])('menerima peran %s', async (role) => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

        const res = await listStaleOpenSessions();

        expect(res.success).toBe(true);
    });

    it('mengembalikan hanya sesi basi dengan satu query', async () => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
        mocks.recordFindMany.mockResolvedValue([
            staleRow('a', 30),
            staleRow('fresh', 5),
        ]);

        const res = await listStaleOpenSessions();

        expect(mocks.recordFindMany).toHaveBeenCalledTimes(1);
        expect(res).toMatchObject({ success: true });
        if (!res.success || !('data' in res) || !res.data) {
            throw new Error('expected data');
        }
        expect(res.data.truncated).toBe(false);
        expect(res.data.sessions).toHaveLength(1);
        expect(res.data.sessions[0]).toMatchObject({
            id: 'a',
            employeeName: 'Budi Contoh',
            workDate: '2026-11-09',
            openHours: 30,
        });
    });

    it('memakai ambang 20 jam dan urutan workDate/clockIn menurun', async () => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('ADMIN'));

        await listStaleOpenSessions();

        const args = mocks.recordFindMany.mock.calls[0][0];
        expect(args.where.clockInAt).toEqual({
            lt: new Date(NOW.getTime() - 20 * HOUR_MS),
        });
        expect(args.orderBy).toEqual([
            { workDate: 'desc' },
            { clockInAt: 'desc' },
        ]);
    });

    it('menandai terpotong bila melebihi batas', async () => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
        mocks.recordFindMany.mockResolvedValue(
            Array.from({ length: 501 }, (_, i) => staleRow(`r${i}`, 30)),
        );

        const res = await listStaleOpenSessions();

        if (!res.success || !('data' in res) || !res.data) {
            throw new Error('expected data');
        }
        expect(res.data.truncated).toBe(true);
        expect(res.data.sessions).toHaveLength(500);
    });

    it('gagal membaca menjadi success:false (bukan daftar kosong) dan dicatat', async () => {
        vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
        mocks.recordFindMany.mockRejectedValue(new Error('db down'));

        const res = await listStaleOpenSessions();

        expect(res).toEqual({
            success: false,
            error: 'Gagal memuat sesi belum pulang',
        });
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
