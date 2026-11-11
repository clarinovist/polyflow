import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/employee-session', () => ({
    requireEmployeeSession: vi.fn(),
}));
vi.mock('@/services/hrd/leave-self-service', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@/services/hrd/leave-self-service')
    >()),
    MyLeaveService: { create: vi.fn(), listMine: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { requireEmployeeSession } from '@/lib/auth/employee-session';
import { BusinessRuleError } from '@/lib/errors/errors';
import { MyLeaveService } from '@/services/hrd/leave-self-service';
import { createMyLeaveRequest, listMyLeaveRequests } from '../leave';

const session = { employeeId: 'emp-1', code: 'EMP-001', name: 'Budi' };
const validInput = {
    startDate: '2026-11-12',
    endDate: '2026-11-13',
    reasonCode: 'SICK' as const,
    note: 'Demam',
};

describe('createMyLeaveRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as never);
        vi.mocked(MyLeaveService.create).mockResolvedValue({
            id: 'lr-1',
        } as never);
    });

    it('returns Unauthorized without a session and skips the service', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await createMyLeaveRequest(validInput);

        expect(result).toEqual({ success: false, error: 'Unauthorized' });
        expect(MyLeaveService.create).not.toHaveBeenCalled();
    });

    it('creates the request for the session employee and revalidates', async () => {
        const result = await createMyLeaveRequest(validInput);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ id: 'lr-1' });
        expect(MyLeaveService.create).toHaveBeenCalledWith(
            expect.anything(),
            'emp-1',
            validInput,
        );
        expect(revalidatePath).toHaveBeenCalledWith('/my/absensi');
    });

    it('ignores extra fields such as employeeId, status and type (IDOR)', async () => {
        const tampered = {
            ...validInput,
            employeeId: 'emp-victim',
            status: 'APPROVED',
            type: 'ANNUAL',
            documentUrl: 'http://x',
            reviewedById: 'u-1',
        };

        await createMyLeaveRequest(tampered as never);

        const call = vi.mocked(MyLeaveService.create).mock.calls[0];
        expect(call[1]).toBe('emp-1');
        expect(call[2]).toEqual({
            startDate: '2026-11-12',
            endDate: '2026-11-13',
            reasonCode: 'SICK',
            note: 'Demam',
        });
        expect(Object.keys(call[2]).sort()).toEqual([
            'endDate',
            'note',
            'reasonCode',
            'startDate',
        ]);
    });

    it('omits note when the client does not send one', async () => {
        await createMyLeaveRequest({
            startDate: '2026-11-12',
            endDate: '2026-11-12',
            reasonCode: 'FAMILY',
        });

        expect(vi.mocked(MyLeaveService.create).mock.calls[0][2]).toEqual({
            startDate: '2026-11-12',
            endDate: '2026-11-12',
            reasonCode: 'FAMILY',
            note: undefined,
        });
    });

    it.each([
        ['unknown reasonCode', { ...validInput, reasonCode: 'VACATION' }],
        ['prototype reasonCode', { ...validInput, reasonCode: 'constructor' }],
        ['numeric startDate', { ...validInput, startDate: 20261112 }],
        ['missing endDate', { ...validInput, endDate: undefined }],
        ['non-string note', { ...validInput, note: { $ne: null } }],
    ])('rejects %s at the action boundary', async (_name, bad) => {
        const result = await createMyLeaveRequest(bad as never);

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(MyLeaveService.create).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it.each([null, 'text', 42, undefined])(
        'rejects a non-object input (%s)',
        async (bad) => {
            const result = await createMyLeaveRequest(bad as never);

            expect(result.success).toBe(false);
            expect(MyLeaveService.create).not.toHaveBeenCalled();
        },
    );

    it('passes business rule messages through to the user', async () => {
        vi.mocked(MyLeaveService.create).mockRejectedValue(
            new BusinessRuleError(
                'Sudah ada pengajuan izin pada tanggal tersebut',
            ),
        );

        const result = await createMyLeaveRequest(validInput);

        expect(result).toEqual({
            success: false,
            error: 'Sudah ada pengajuan izin pada tanggal tersebut',
        });
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('hides unexpected error details behind a friendly message', async () => {
        vi.mocked(MyLeaveService.create).mockRejectedValue(
            new Error('connect ECONNREFUSED 10.0.0.5:5432'),
        );

        const result = await createMyLeaveRequest(validInput);

        expect(result.success).toBe(false);
        expect(result.error).not.toContain('ECONNREFUSED');
        expect(result.error).toBe(
            'Gagal mengirim pengajuan izin. Silakan coba lagi.',
        );
    });
});

describe('listMyLeaveRequests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireEmployeeSession).mockResolvedValue(session as never);
        vi.mocked(MyLeaveService.listMine).mockResolvedValue([] as never);
    });

    it('returns Unauthorized without a session and skips the service', async () => {
        vi.mocked(requireEmployeeSession).mockResolvedValue(null);

        const result = await listMyLeaveRequests();

        expect(result).toEqual({ success: false, error: 'Unauthorized' });
        expect(MyLeaveService.listMine).not.toHaveBeenCalled();
    });

    it('lists for the session employee with the default limit', async () => {
        const rows = [{ id: 'lr-1' }];
        vi.mocked(MyLeaveService.listMine).mockResolvedValue(rows as never);

        const result = await listMyLeaveRequests();

        expect(result).toEqual({ success: true, data: rows });
        expect(MyLeaveService.listMine).toHaveBeenCalledWith(
            expect.anything(),
            'emp-1',
            10,
        );
    });

    it.each([
        [0, 1],
        [-5, 1],
        [3, 3],
        [50, 50],
        [500, 50],
        [2.7, 2],
        [Number.NaN, 10],
    ])('clamps limit %s to %s', async (input, expected) => {
        await listMyLeaveRequests(input);

        expect(vi.mocked(MyLeaveService.listMine).mock.calls[0][2]).toBe(
            expected,
        );
    });

    it('returns a friendly error when the service fails', async () => {
        vi.mocked(MyLeaveService.listMine).mockRejectedValue(
            new Error('db down'),
        );

        const result = await listMyLeaveRequests();

        expect(result).toEqual({
            success: false,
            error: 'Gagal memuat pengajuan izin',
        });
    });
});
