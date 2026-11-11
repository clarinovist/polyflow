import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setEmployeePin,
    clearEmployeePin,
    listAttendance,
    getAttendanceSummary,
    getAttendanceWeeklySummary,
    getAttendanceMonthlySummary,
    listKioskEmployees,
} from '../attendance';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { logger } from '@/lib/config/logger';

const mocks = vi.hoisted(() => ({
    employeeUpdate: vi.fn(),
    employeeFindMany: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        employee: {
            update: mocks.employeeUpdate,
            findMany: mocks.employeeFindMany,
        },
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
vi.mock('@/services/hrd/pin-helpers', () => ({
    hashPin: vi.fn(async () => 'HASHED-SECRET'),
    isValidPin: (pin: string) => /^\d{4,6}$/.test(pin),
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: {
        listByDate: vi.fn(),
        getSummary: vi.fn(),
        getWeeklySummary: vi.fn(),
        getMonthlySummary: vi.fn(),
    },
}));

const VALID_PIN = '482913';
const DENIED_ERROR = 'Anda tidak memiliki akses untuk aksi ini';
const DENIED_ROLES = ['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'];
const LISTING_ROLES = ['ADMIN', 'FINANCE', 'HRD'];
const APPROVER_ROLES = ['ADMIN', 'HRD'];

const sessionFor = (role: string) =>
    ({ user: { id: 'user-1', role, tenantId: 'acme' } }) as never;

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

type ActionCall = { name: string; call: () => Promise<unknown> };

const listingActions: ActionCall[] = [
    { name: 'listAttendance', call: () => listAttendance('2026-11-10') },
    {
        name: 'getAttendanceSummary',
        call: () => getAttendanceSummary('2026-11-10'),
    },
    {
        name: 'getAttendanceWeeklySummary',
        call: () => getAttendanceWeeklySummary('2026-11-09', '2026-11-15'),
    },
    {
        name: 'getAttendanceMonthlySummary',
        call: () => getAttendanceMonthlySummary(2026, 11),
    },
];

const pinActions: ActionCall[] = [
    { name: 'setEmployeePin', call: () => setEmployeePin('emp-1', VALID_PIN) },
    { name: 'clearEmployeePin', call: () => clearEmployeePin('emp-1') },
];

function expectNoDataTouched() {
    expect(AttendanceService.listByDate).not.toHaveBeenCalled();
    expect(AttendanceService.getSummary).not.toHaveBeenCalled();
    expect(AttendanceService.getWeeklySummary).not.toHaveBeenCalled();
    expect(AttendanceService.getMonthlySummary).not.toHaveBeenCalled();
    expect(mocks.employeeUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
}

describe('attendance actions — akses HRD', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(AttendanceService.listByDate).mockResolvedValue([] as never);
        vi.mocked(AttendanceService.getSummary).mockResolvedValue({} as never);
        vi.mocked(AttendanceService.getWeeklySummary).mockResolvedValue(
            [] as never,
        );
        vi.mocked(AttendanceService.getMonthlySummary).mockResolvedValue(
            [] as never,
        );
        mocks.employeeUpdate.mockResolvedValue({ id: 'emp-1' });
    });

    describe.each([...listingActions, ...pinActions])(
        '$name — penolakan',
        ({ call }) => {
            it.each(DENIED_ROLES)('menolak peran %s', async (role) => {
                vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

                const res = await call();

                expect(res).toEqual({ success: false, error: DENIED_ERROR });
                expectNoDataTouched();
            });

            it('melempar ulang redirect login saat tanpa sesi', async () => {
                vi.mocked(requireAuth).mockRejectedValue(redirectError());

                await expect(call()).rejects.toThrow('NEXT_REDIRECT');
                expect(logger.error).not.toHaveBeenCalled();
                expectNoDataTouched();
            });
        },
    );

    describe.each(listingActions)('$name — penerimaan', ({ call }) => {
        it.each(LISTING_ROLES)('menerima peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = (await call()) as { success: boolean };

            expect(res.success).toBe(true);
        });
    });

    describe.each(pinActions)('$name — penerimaan', ({ call }) => {
        it.each(APPROVER_ROLES)('menerima peran %s', async (role) => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor(role));

            const res = await call();

            expect(res).toEqual({ success: true });
            expect(mocks.employeeUpdate).toHaveBeenCalledTimes(1);
        });

        it('menolak FINANCE (bukan approver)', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('FINANCE'));

            const res = await call();

            expect(res).toEqual({ success: false, error: DENIED_ERROR });
            expect(mocks.employeeUpdate).not.toHaveBeenCalled();
        });
    });

    describe('audit PIN', () => {
        it('setEmployeePin mencatat audit tanpa PIN atau hash', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));

            await setEmployeePin('emp-1', VALID_PIN);

            expect(logActivity).toHaveBeenCalledTimes(1);
            const params = vi.mocked(logActivity).mock.calls[0][0];
            expect(params).toMatchObject({
                userId: 'user-1',
                action: 'EMPLOYEE_PIN_SET',
                entityType: 'Employee',
                entityId: 'emp-1',
            });
            const serialized = JSON.stringify(params);
            expect(serialized).not.toContain(VALID_PIN);
            expect(serialized).not.toContain('HASHED-SECRET');
        });

        it('clearEmployeePin mencatat audit', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('ADMIN'));

            await clearEmployeePin('emp-1');

            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(vi.mocked(logActivity).mock.calls[0][0]).toMatchObject({
                userId: 'user-1',
                action: 'EMPLOYEE_PIN_CLEARED',
                entityType: 'Employee',
                entityId: 'emp-1',
            });
        });

        it('PIN tidak valid ditolak tanpa audit dan tanpa update', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));

            const res = await setEmployeePin('emp-1', '12');

            expect(res).toEqual({
                success: false,
                error: 'PIN harus 4-6 digit angka',
            });
            expect(mocks.employeeUpdate).not.toHaveBeenCalled();
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('log error gagal-simpan tidak memuat PIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(sessionFor('HRD'));
            mocks.employeeUpdate.mockRejectedValue(new Error('db down'));

            const res = await setEmployeePin('emp-1', VALID_PIN);

            expect(res).toEqual({ success: false, error: 'Gagal menyimpan PIN' });
            expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
                VALID_PIN,
            );
            expect(logActivity).not.toHaveBeenCalled();
        });
    });

    describe('aksi kiosk anonim', () => {
        it('listKioskEmployees tetap berfungsi tanpa sesi', async () => {
            vi.mocked(requireAuth).mockRejectedValue(redirectError());
            mocks.employeeFindMany.mockResolvedValue([
                { id: 'emp-1', name: 'Budi Contoh', code: 'E001' },
            ]);

            const res = await listKioskEmployees();

            expect(res).toEqual({
                success: true,
                data: [{ id: 'emp-1', name: 'Budi Contoh', code: 'E001' }],
            });
            expect(requireAuth).not.toHaveBeenCalled();
        });
    });
});
