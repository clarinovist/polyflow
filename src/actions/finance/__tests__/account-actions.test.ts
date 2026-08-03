import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccounts, upsertAccount, deleteAccount, getAccountLedger } from '../account-actions';
import { BusinessRuleError } from '@/lib/errors/errors';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        journalLine: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn(),
    requireFinanceMutation: vi.fn(),
    requireFinanceReadCrossPortal: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import {
    requireFinanceAccess,
    requireFinanceMutation,
    requireFinanceReadCrossPortal,
} from '@/lib/auth/finance-access';

function mockSession(role: string) {
    return {
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('account-actions authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── getAccounts (cross-portal read) ────────────────────────────────
    describe('getAccounts', () => {
        it('allows ADMIN via cross-portal read', async () => {
            vi.mocked(requireFinanceReadCrossPortal).mockResolvedValue(
                mockSession('ADMIN'),
            );
            vi.mocked(prisma.account.findMany).mockResolvedValue([]);
            const result = await getAccounts();
            expect(result.success).toBe(true);
            expect(requireFinanceReadCrossPortal).toHaveBeenCalled();
        });

        it('allows FINANCE via cross-portal read', async () => {
            vi.mocked(requireFinanceReadCrossPortal).mockResolvedValue(
                mockSession('FINANCE'),
            );
            vi.mocked(prisma.account.findMany).mockResolvedValue([]);
            const result = await getAccounts();
            expect(result.success).toBe(true);
        });

        it('allows SALES when listed in cross-portal roles', async () => {
            vi.mocked(requireFinanceReadCrossPortal).mockResolvedValue(
                mockSession('SALES'),
            );
            vi.mocked(prisma.account.findMany).mockResolvedValue([]);
            const result = await getAccounts();
            expect(result.success).toBe(true);
        });

        it('rejects unauthorized role via cross-portal guard', async () => {
            vi.mocked(requireFinanceReadCrossPortal).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Akses baca finance tidak diizinkan untuk role ini.',
                ),
            );
            const result = await getAccounts();
            expect(result.success).toBe(false);
            expect(prisma.account.findMany).not.toHaveBeenCalled();
        });


    });

    // ── getAccountLedger (Finance-only read) ───────────────────────────
    describe('getAccountLedger', () => {
        it('allows ADMIN via Finance read guard', async () => {
            vi.mocked(requireFinanceAccess).mockResolvedValue(
                mockSession('ADMIN'),
            );
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-1',
                code: '11100',
                name: 'Cash',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
                parent: null,
            } as any);
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
            const result = await getAccountLedger('acc-1');
            expect(result.success).toBe(true);
            expect(requireFinanceAccess).toHaveBeenCalled();
        });

        it('allows FINANCE via Finance read guard', async () => {
            vi.mocked(requireFinanceAccess).mockResolvedValue(
                mockSession('FINANCE'),
            );
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-1',
                code: '11100',
                name: 'Cash',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
                parent: null,
            } as any);
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
            const result = await getAccountLedger('acc-1');
            expect(result.success).toBe(true);
        });

        it('rejects unauthorized role via Finance read guard', async () => {
            vi.mocked(requireFinanceAccess).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Akses finance hanya untuk admin atau finance.',
                ),
            );
            const result = await getAccountLedger('acc-1');
            expect(result.success).toBe(false);
            expect(prisma.account.findUnique).not.toHaveBeenCalled();
        });
    });

    // ── upsertAccount (mutation guard) ─────────────────────────────────
    describe('upsertAccount', () => {
        it('allows ADMIN via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockResolvedValue(
                mockSession('ADMIN'),
            );
            vi.mocked(prisma.account.create).mockResolvedValue({
                id: 'acc-new',
            } as any);
            const result = await upsertAccount({
                code: '99999',
                name: 'Test',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            });
            expect(result.success).toBe(true);
            expect(requireFinanceMutation).toHaveBeenCalled();
        });

        it('allows FINANCE via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockResolvedValue(
                mockSession('FINANCE'),
            );
            vi.mocked(prisma.account.update).mockResolvedValue({
                id: 'acc-1',
            } as any);
            const result = await upsertAccount({
                id: 'acc-1',
                code: '11100',
                name: 'Cash Updated',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            });
            expect(result.success).toBe(true);
        });

        it('rejects SALES via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Mutasi finance hanya untuk admin atau finance.',
                ),
            );
            const result = await upsertAccount({
                code: '99999',
                name: 'Test',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            });
            expect(result.success).toBe(false);
        });

        it('rejects WAREHOUSE via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Mutasi finance hanya untuk admin atau finance.',
                ),
            );
            const result = await upsertAccount({
                code: '99999',
                name: 'Test',
                type: 'ASSET',
                category: 'CURRENT_ASSET',
            });
            expect(result.success).toBe(false);
        });


    });

    // ── deleteAccount (mutation guard) ─────────────────────────────────
    describe('deleteAccount', () => {
        it('allows ADMIN via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockResolvedValue(
                mockSession('ADMIN'),
            );
            vi.mocked(prisma.journalLine.count).mockResolvedValue(0);
            vi.mocked(prisma.account.count).mockResolvedValue(0);
            vi.mocked(prisma.account.delete).mockResolvedValue({
                id: 'acc-1',
            } as any);
            const result = await deleteAccount('acc-1');
            expect(result.success).toBe(true);
            expect(requireFinanceMutation).toHaveBeenCalled();
        });

        it('allows FINANCE via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockResolvedValue(
                mockSession('FINANCE'),
            );
            vi.mocked(prisma.journalLine.count).mockResolvedValue(0);
            vi.mocked(prisma.account.count).mockResolvedValue(0);
            vi.mocked(prisma.account.delete).mockResolvedValue({
                id: 'acc-1',
            } as any);
            const result = await deleteAccount('acc-1');
            expect(result.success).toBe(true);
        });

        it('rejects SALES via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Mutasi finance hanya untuk admin atau finance.',
                ),
            );
            const result = await deleteAccount('acc-1');
            expect(result.success).toBe(false);
        });

        it('rejects PRODUCTION via mutation guard', async () => {
            vi.mocked(requireFinanceMutation).mockRejectedValue(
                new BusinessRuleError(
                    'Unauthorized: Mutasi finance hanya untuk admin atau finance.',
                ),
            );
            const result = await deleteAccount('acc-1');
            expect(result.success).toBe(false);
        });


    });
});
