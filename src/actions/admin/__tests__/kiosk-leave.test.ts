import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/services/hrd/kiosk-leave-service', () => ({
    KioskLeaveService: { create: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: { clockIn: vi.fn(), clockOut: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-settings-reader', () => ({
    readAttendanceSettings: vi.fn().mockResolvedValue({}),
}));

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/api/rate-limit';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { KioskLeaveService } from '@/services/hrd/kiosk-leave-service';
import { kioskClockOut } from '../attendance';
import { kioskRequestLeave } from '../kiosk-leave';

const RATE_MESSAGE = 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.';
const validInput = {
    startDate: '2026-11-12',
    endDate: '2026-11-13',
    reasonCode: 'SICK' as const,
    note: 'Demam',
};

describe('kioskRequestLeave', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(headers).mockResolvedValue({
            get: (name: string) => (name === 'x-real-ip' ? '10.0.0.7' : null),
        } as never);
        vi.mocked(rateLimit).mockReturnValue({ success: true } as never);
        vi.mocked(KioskLeaveService.create).mockResolvedValue({
            id: 'lr-1',
            days: 2,
        });
    });

    it('creates the request, revalidates /hrd/leave and returns only id and days', async () => {
        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(result).toEqual({ success: true, data: { id: 'lr-1', days: 2 } });
        expect(KioskLeaveService.create).toHaveBeenCalledWith(expect.anything(), {
            employeeCode: 'EMP-001',
            pin: '123456',
            input: validInput,
        });
        expect(revalidatePath).toHaveBeenCalledWith('/hrd/leave');
    });

    it('never returns the LeaveRequest row, even if the service leaks extra fields', async () => {
        vi.mocked(KioskLeaveService.create).mockResolvedValue({
            id: 'lr-1',
            days: 1,
            employeeId: 'emp-1',
            status: 'PENDING',
        } as never);

        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(Object.keys(result.data ?? {}).sort()).toEqual(['days', 'id']);
    });

    it('stops at the rate limit without calling the service', async () => {
        vi.mocked(rateLimit).mockReturnValue({ success: false } as never);

        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(result).toEqual({ success: false, error: RATE_MESSAGE });
        expect(KioskLeaveService.create).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('shares one rate limit bucket with kiosk clock-out', async () => {
        vi.mocked(AttendanceService.clockOut).mockResolvedValue({} as never);

        await kioskRequestLeave('EMP-001', '123456', validInput);
        await kioskClockOut('EMP-001', '123456');

        const [leaveCall, clockCall] = vi.mocked(rateLimit).mock.calls;
        expect(leaveCall).toEqual(clockCall);
        expect(leaveCall[0]).toBe('kiosk:10.0.0.7:EMP-001');
    });

    it.each([
        ['PIN salah', 'PIN yang Anda masukkan salah'],
        ['Karyawan tidak aktif', 'Akun karyawan sedang tidak aktif'],
        ['Karyawan tidak ditemukan', 'Data karyawan tidak ditemukan'],
    ])('maps %s like kiosk attendance', async (raw, mapped) => {
        vi.mocked(KioskLeaveService.create).mockRejectedValue(
            new BusinessRuleError(raw),
        );

        const result = await kioskRequestLeave('EMP-001', '000000', validInput);

        expect(result).toEqual({ success: false, error: mapped });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('maps a NotFoundError for the employee', async () => {
        vi.mocked(KioskLeaveService.create).mockRejectedValue(
            new NotFoundError('Karyawan'),
        );

        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(result).toEqual({
            success: false,
            error: 'Data karyawan tidak ditemukan',
        });
    });

    it('passes other business rule messages through', async () => {
        vi.mocked(KioskLeaveService.create).mockRejectedValue(
            new BusinessRuleError(
                'Sudah ada pengajuan izin pada tanggal tersebut',
            ),
        );

        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(result.error).toBe(
            'Sudah ada pengajuan izin pada tanggal tersebut',
        );
    });

    it('ignores smuggled fields (employeeId, status, type, documentUrl)', async () => {
        await kioskRequestLeave('EMP-001', '123456', {
            ...validInput,
            employeeId: 'emp-victim',
            status: 'APPROVED',
            type: 'ANNUAL',
            documentUrl: 'http://x',
        } as never);

        const arg = vi.mocked(KioskLeaveService.create).mock.calls[0][1];
        expect(Object.keys(arg.input).sort()).toEqual([
            'endDate',
            'note',
            'reasonCode',
            'startDate',
        ]);
        expect(arg.input).toEqual(validInput);
    });

    it.each([
        ['unknown reasonCode', { ...validInput, reasonCode: 'VACATION' }],
        ['numeric startDate', { ...validInput, startDate: 20261112 }],
        ['null input', null],
    ])('rejects %s before the service', async (_name, bad) => {
        const result = await kioskRequestLeave('EMP-001', '123456', bad as never);

        expect(result).toEqual({
            success: false,
            error: 'Data pengajuan izin tidak valid',
        });
        expect(KioskLeaveService.create).not.toHaveBeenCalled();
    });

    it.each([
        ['numeric code', 42, '123456'],
        ['numeric pin', 'EMP-001', 123456],
    ])('rejects a %s before the service', async (_name, code, pin) => {
        const result = await kioskRequestLeave(
            code as never,
            pin as never,
            validInput,
        );

        expect(result.success).toBe(false);
        expect(KioskLeaveService.create).not.toHaveBeenCalled();
    });

    it('does not leak non-business error details', async () => {
        vi.mocked(KioskLeaveService.create).mockRejectedValue(
            new Error('connect ECONNREFUSED 10.0.0.5:5432'),
        );

        const result = await kioskRequestLeave('EMP-001', '123456', validInput);

        expect(result).toEqual({
            success: false,
            error: 'Gagal mengirim pengajuan izin. Silakan coba lagi.',
        });
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
