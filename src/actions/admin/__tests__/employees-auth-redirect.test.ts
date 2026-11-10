import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createEmployee,
    updateEmployee,
    deleteEmployee,
} from '../employees';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        employee: {
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            delete: vi.fn(),
        },
    },
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/auth/hrd-access', () => ({
    hasHrdFinanceAccess: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/hrd/salary-history', () => ({
    SALARY_FIELDS: ['payType', 'dailyRate'],
    buildSalaryChanges: vi.fn().mockReturnValue(null),
    createSalaryHistory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

describe('employee actions — sesi habis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockRejectedValue(redirectError());
    });

    it('createEmployee melempar ulang redirect, tidak mengubahnya jadi BusinessRuleError', async () => {
        await expect(
            createEmployee({ name: 'Andi', code: 'E-1', role: 'OPERATOR' }),
        ).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('updateEmployee melempar ulang redirect, tidak mencatatnya sebagai error', async () => {
        await expect(
            updateEmployee('emp-1', { name: 'Andi' }),
        ).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('deleteEmployee melempar ulang redirect, tidak mencatatnya sebagai error', async () => {
        await expect(deleteEmployee('emp-1')).rejects.toThrow('NEXT_REDIRECT');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('error biasa tetap dicatat dan dikembalikan sebagai pesan bisnis', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('boom'));
        const res = await deleteEmployee('emp-1');
        expect(res).toEqual(
            expect.objectContaining({
                success: false,
                error: expect.stringContaining('Tidak dapat menghapus personil'),
            }),
        );
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
