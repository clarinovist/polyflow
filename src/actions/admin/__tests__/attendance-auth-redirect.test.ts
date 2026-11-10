import { describe, it, expect, vi, beforeEach } from 'vitest';
import { correctAttendance, setAbsent } from '../attendance';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/api/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

describe('attendance actions — sesi habis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockRejectedValue(redirectError());
    });

    it('correctAttendance melempar ulang redirect, tidak mencatatnya sebagai error', async () => {
        await expect(
            correctAttendance('rec-1', { notes: 'x' }),
        ).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('setAbsent melempar ulang redirect, tidak mencatatnya sebagai error', async () => {
        await expect(
            setAbsent('emp-1', '2026-11-10', 'shift-1'),
        ).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('error biasa tetap dikembalikan sebagai gagal dan dicatat', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('boom'));
        const res = await correctAttendance('rec-1', { notes: 'x' });
        expect(res).toEqual({ success: false, error: 'boom' });
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
