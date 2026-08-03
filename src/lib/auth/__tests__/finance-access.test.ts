import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    requireFinanceAccess,
    requireFinanceMutation,
    requireFinanceApprover,
    requireFinanceAdmin,
    requireFinanceReadCrossPortal,
} from '../finance-access';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/tools/auth-checks';

function mockSession(role: string) {
    return {
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as any;
}

describe('finance-access helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── requireFinanceAccess (ADMIN, FINANCE) ──────────────────────────
    describe('requireFinanceAccess', () => {
        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            await expect(requireFinanceAccess()).rejects.toThrow('No session');
        });

        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const session = await requireFinanceAccess();
            expect(session.user.role).toBe('ADMIN');
        });

        it('allows FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const session = await requireFinanceAccess();
            expect(session.user.role).toBe('FINANCE');
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            await expect(requireFinanceAccess()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects WAREHOUSE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
            await expect(requireFinanceAccess()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects PRODUCTION', async () => {
            vi.mocked(requireAuth).mockResolvedValue(
                mockSession('PRODUCTION'),
            );
            await expect(requireFinanceAccess()).rejects.toThrow(
                BusinessRuleError,
            );
        });
    });

    // ── requireFinanceMutation (ADMIN, FINANCE) ────────────────────────
    describe('requireFinanceMutation', () => {
        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            await expect(requireFinanceMutation()).rejects.toThrow('No session');
        });

        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const session = await requireFinanceMutation();
            expect(session.user.role).toBe('ADMIN');
        });

        it('allows FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const session = await requireFinanceMutation();
            expect(session.user.role).toBe('FINANCE');
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            await expect(requireFinanceMutation()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects PROCUREMENT', async () => {
            vi.mocked(requireAuth).mockResolvedValue(
                mockSession('PROCUREMENT'),
            );
            await expect(requireFinanceMutation()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects PRODUCTION', async () => {
            vi.mocked(requireAuth).mockResolvedValue(
                mockSession('PRODUCTION'),
            );
            await expect(requireFinanceMutation()).rejects.toThrow(
                BusinessRuleError,
            );
        });
    });

    // ── requireFinanceApprover (ADMIN, FINANCE) ────────────────────────
    describe('requireFinanceApprover', () => {
        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            await expect(requireFinanceApprover()).rejects.toThrow('No session');
        });

        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const session = await requireFinanceApprover();
            expect(session.user.role).toBe('ADMIN');
        });

        it('allows FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const session = await requireFinanceApprover();
            expect(session.user.role).toBe('FINANCE');
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            await expect(requireFinanceApprover()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects PLANNING', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
            await expect(requireFinanceApprover()).rejects.toThrow(
                BusinessRuleError,
            );
        });
    });

    // ── requireFinanceAdmin (ADMIN only) ───────────────────────────────
    describe('requireFinanceAdmin', () => {
        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            await expect(requireFinanceAdmin()).rejects.toThrow('No session');
        });

        it('allows ADMIN', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const session = await requireFinanceAdmin();
            expect(session.user.role).toBe('ADMIN');
        });

        it('rejects FINANCE', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            await expect(requireFinanceAdmin()).rejects.toThrow(
                BusinessRuleError,
            );
        });

        it('rejects SALES', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            await expect(requireFinanceAdmin()).rejects.toThrow(
                BusinessRuleError,
            );
        });
    });

    // ── requireFinanceReadCrossPortal ──────────────────────────────────
    describe('requireFinanceReadCrossPortal', () => {
        it('rejects when no session', async () => {
            vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
            await expect(
                requireFinanceReadCrossPortal(['SALES']),
            ).rejects.toThrow('No session');
        });

        it('allows ADMIN regardless of extra roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
            const session = await requireFinanceReadCrossPortal([
                'SALES',
                'WAREHOUSE',
            ]);
            expect(session.user.role).toBe('ADMIN');
        });

        it('allows FINANCE regardless of extra roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
            const session = await requireFinanceReadCrossPortal(['SALES']);
            expect(session.user.role).toBe('FINANCE');
        });

        it('allows SALES when listed in allowed roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            const session = await requireFinanceReadCrossPortal([
                'SALES',
                'WAREHOUSE',
            ]);
            expect(session.user.role).toBe('SALES');
        });

        it('allows WAREHOUSE when listed in allowed roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
            const session = await requireFinanceReadCrossPortal([
                'SALES',
                'WAREHOUSE',
            ]);
            expect(session.user.role).toBe('WAREHOUSE');
        });

        it('rejects PRODUCTION when not in allowed roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(
                mockSession('PRODUCTION'),
            );
            await expect(
                requireFinanceReadCrossPortal(['SALES', 'WAREHOUSE']),
            ).rejects.toThrow(BusinessRuleError);
        });

        it('rejects HRD when not in allowed roles', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('HRD'));
            await expect(
                requireFinanceReadCrossPortal(['SALES', 'WAREHOUSE']),
            ).rejects.toThrow(BusinessRuleError);
        });

        it('rejects SALES when not listed', async () => {
            vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
            await expect(
                requireFinanceReadCrossPortal(['WAREHOUSE', 'PRODUCTION']),
            ).rejects.toThrow(BusinessRuleError);
        });
    });
});
