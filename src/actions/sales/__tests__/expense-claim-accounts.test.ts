import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ requireAuth: vi.fn(), listAccounts: vi.fn() }));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
// Real finance-access runs on top of this session mock.
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: m.requireAuth }));
vi.mock('@/services/sales/expense-claim-account-queries', () => ({
    listPayableClaimAccounts: m.listAccounts,
}));

import { listClaimPaymentAccounts } from '../expense-claim-accounts';

const ACCOUNTS = {
    expenseAccounts: [{ id: 'e1', code: '61100', name: 'Biaya' }],
    paymentAccounts: [{ id: 'p1', code: '11110', name: 'Kas Kecil' }],
};

function sessionWith(role: string) {
    return { user: { id: 'user-1', role, roles: [role] } };
}

describe('listClaimPaymentAccounts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.listAccounts.mockResolvedValue(ACCOUNTS);
    });

    it.each(['FINANCE', 'ADMIN'])('returns the account lists for %s', async (role) => {
        m.requireAuth.mockResolvedValue(sessionWith(role));

        const result = await listClaimPaymentAccounts();

        expect(result).toEqual({ success: true, data: ACCOUNTS });
    });

    it.each(['MARKETING', 'SALES'])(
        'rejects %s without reading any account',
        async (role) => {
            m.requireAuth.mockResolvedValue(sessionWith(role));

            const result = await listClaimPaymentAccounts();

            expect(result.success).toBe(false);
            expect(m.listAccounts).not.toHaveBeenCalled();
        },
    );
});
