import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    revalidatePath: vi.fn(),
    getTenantPrefix: vi.fn(),
    submitClaim: vi.fn(),
    cancelClaim: vi.fn(),
    approveClaim: vi.fn(),
    rejectClaim: vi.fn(),
    payClaim: vi.fn(),
    listMyClaims: vi.fn(),
    getMyClaim: vi.fn(),
    listClaimsForReview: vi.fn(),
    listClaimsForPayment: vi.fn(),
    getClaimsSummaryCounts: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
// Real role helpers (sales-access / finance-access) run on top of this session mock.
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/storage/r2', () => ({ getTenantPrefix: mocks.getTenantPrefix }));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (data: unknown) => data }));
vi.mock('@/services/sales/expense-claim-service', () => ({
    submitClaim: mocks.submitClaim,
    cancelClaim: mocks.cancelClaim,
    approveClaim: mocks.approveClaim,
    rejectClaim: mocks.rejectClaim,
}));
vi.mock('@/services/sales/expense-claim-payment', () => ({ payClaim: mocks.payClaim }));
vi.mock('@/services/sales/expense-claim-queries', () => ({
    listMyClaims: mocks.listMyClaims,
    getMyClaim: mocks.getMyClaim,
    listClaimsForReview: mocks.listClaimsForReview,
    listClaimsForPayment: mocks.listClaimsForPayment,
    getClaimsSummaryCounts: mocks.getClaimsSummaryCounts,
}));

import {
    approveExpenseClaim,
    cancelExpenseClaim,
    getExpenseClaimCounts,
    getMyExpenseClaim,
    listExpenseClaimsForPayment,
    listExpenseClaimsForReview,
    listMyExpenseClaims,
    payExpenseClaim,
    rejectExpenseClaim,
    submitExpenseClaim,
} from '../expense-claims';

const session = (role: string, roles: string[] = [role], id = 'user-1') => ({
    user: { id, role, roles },
});
const as = (role: string, roles?: string[], id?: string) =>
    mocks.requireAuth.mockResolvedValue(session(role, roles, id));

const validSubmit = {
    expenseDate: '2026-11-24',
    category: 'BBM',
    amount: 1000,
    description: 'x',
    receiptUrl: '/api/images/t/expense-receipt/user-1/1.jpg',
};
const validPay = { claimId: 'c1', expenseAccountId: 'e', paymentAccountId: 'p' };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTenantPrefix.mockResolvedValue('tenant');
    for (const name of ['submitClaim', 'cancelClaim', 'approveClaim', 'rejectClaim', 'payClaim', 'getMyClaim'] as const) {
        mocks[name].mockResolvedValue({ id: 'c1' });
    }
    for (const name of ['listMyClaims', 'listClaimsForReview', 'listClaimsForPayment'] as const) {
        mocks[name].mockResolvedValue([]);
    }
    mocks.getClaimsSummaryCounts.mockResolvedValue({ submitted: 1, approved: 2 });
});

describe('claim owner actions', () => {
    it('lets SALES submit using the session user id and the tenant key', async () => {
        as('SALES');
        const res = await submitExpenseClaim(validSubmit);
        expect(res).toEqual({ success: true, data: { id: 'c1' } });
        expect(mocks.submitClaim).toHaveBeenCalledWith('user-1', validSubmit, { tenant: 'tenant' });
        expect(mocks.revalidatePath).toHaveBeenCalledWith('/field/sales/claims');
        expect(mocks.revalidatePath).toHaveBeenCalledWith('/sales/claims');
        expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/reimbursements');
    });

    it('ignores a userId smuggled into the input', async () => {
        as('SALES');
        await submitExpenseClaim({ ...validSubmit, userId: 'victim' });
        expect(mocks.submitClaim.mock.calls[0][0]).toBe('user-1');
    });

    it.each(['FINANCE', 'WAREHOUSE', 'HRD'])('does not let %s submit, cancel or list own claims', async (role) => {
        as(role);
        for (const result of [
            await submitExpenseClaim(validSubmit),
            await cancelExpenseClaim('c1'),
            await listMyExpenseClaims(),
            await getMyExpenseClaim('c1'),
        ]) {
            expect(result).toMatchObject({ success: false });
        }
        expect(mocks.submitClaim).not.toHaveBeenCalled();
        expect(mocks.cancelClaim).not.toHaveBeenCalled();
        expect(mocks.listMyClaims).not.toHaveBeenCalled();
    });

    it('cancels and reads only through the session user id', async () => {
        as('SALES');
        await cancelExpenseClaim('c1');
        expect(mocks.cancelClaim).toHaveBeenCalledWith('c1', 'user-1');
        await getMyExpenseClaim('c1');
        expect(mocks.getMyClaim).toHaveBeenCalledWith('user-1', 'c1');
        await listMyExpenseClaims({ take: 5 });
        expect(mocks.listMyClaims).toHaveBeenCalledWith('user-1', { take: 5 });
    });

    it('rejects a blank claim id and bad list options with a validation error', async () => {
        as('SALES');
        expect(await cancelExpenseClaim('')).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await getMyExpenseClaim('  ')).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await listMyExpenseClaims({ take: -1 })).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(mocks.cancelClaim).not.toHaveBeenCalled();
    });
});

describe('approver actions', () => {
    it('lets MARKETING approve with a non-admin actor', async () => {
        as('MARKETING', ['MARKETING'], 'mkt-1');
        const res = await approveExpenseClaim('c1');
        expect(res).toMatchObject({ success: true });
        expect(mocks.approveClaim).toHaveBeenCalledWith('c1', { id: 'mkt-1', isAdmin: false });
    });

    it('marks the actor as admin when ADMIN is one of several roles', async () => {
        as('MARKETING', ['MARKETING', 'ADMIN'], 'both-1');
        await approveExpenseClaim('c1');
        expect(mocks.approveClaim).toHaveBeenCalledWith('c1', { id: 'both-1', isAdmin: true });
    });

    it('lets ADMIN approve as admin', async () => {
        as('ADMIN', ['ADMIN'], 'adm-1');
        await rejectExpenseClaim('c1', 'Nota buram');
        expect(mocks.rejectClaim).toHaveBeenCalledWith('c1', { id: 'adm-1', isAdmin: true }, 'Nota buram');
    });

    it.each(['SALES', 'FINANCE', 'WAREHOUSE'])('does not let %s approve, reject or list the review queue', async (role) => {
        as(role);
        expect(await approveExpenseClaim('c1')).toMatchObject({ success: false });
        expect(await rejectExpenseClaim('c1', 'alasan')).toMatchObject({ success: false });
        expect(await listExpenseClaimsForReview()).toMatchObject({ success: false });
        expect(mocks.approveClaim).not.toHaveBeenCalled();
        expect(mocks.rejectClaim).not.toHaveBeenCalled();
        expect(mocks.listClaimsForReview).not.toHaveBeenCalled();
    });

    it('requires a valid reason on reject', async () => {
        as('MARKETING');
        expect(await rejectExpenseClaim('c1', 'ab')).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await rejectExpenseClaim('c1', '   ')).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(mocks.rejectClaim).not.toHaveBeenCalled();
    });

    it('lists the review queue with validated options', async () => {
        as('MARKETING');
        await listExpenseClaimsForReview({ status: 'APPROVED', take: 10 });
        expect(mocks.listClaimsForReview).toHaveBeenCalledWith({ status: 'APPROVED', take: 10 });
        expect(await listExpenseClaimsForReview({ status: 'NOPE' })).toMatchObject({ success: false });
    });
});

describe('finance actions', () => {
    it('lets FINANCE pay using the session user as payer', async () => {
        as('FINANCE', ['FINANCE'], 'fin-1');
        const res = await payExpenseClaim({ ...validPay, paymentDate: '2026-11-20' });
        expect(res).toMatchObject({ success: true });
        expect(mocks.payClaim).toHaveBeenCalledWith(
            'c1',
            { id: 'fin-1' },
            { expenseAccountId: 'e', paymentAccountId: 'p', paymentDate: '2026-11-20' },
        );
        expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/reimbursements');
    });

    it.each(['SALES', 'MARKETING', 'WAREHOUSE'])('does not let %s pay or list payable claims', async (role) => {
        as(role);
        expect(await payExpenseClaim(validPay)).toMatchObject({ success: false });
        expect(await listExpenseClaimsForPayment()).toMatchObject({ success: false });
        expect(mocks.payClaim).not.toHaveBeenCalled();
        expect(mocks.listClaimsForPayment).not.toHaveBeenCalled();
    });

    it('rejects malformed pay input before calling the service', async () => {
        as('FINANCE');
        expect(await payExpenseClaim({ claimId: 'c1' })).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(await payExpenseClaim(null)).toMatchObject({ success: false });
        expect(mocks.payClaim).not.toHaveBeenCalled();
    });

    it('lists payable claims for FINANCE', async () => {
        as('FINANCE');
        expect(await listExpenseClaimsForPayment()).toEqual({ success: true, data: [] });
    });
});

describe('page counters', () => {
    it.each(['ADMIN', 'MARKETING', 'FINANCE'])('are visible to %s', async (role) => {
        as(role);
        expect(await getExpenseClaimCounts()).toEqual({ success: true, data: { submitted: 1, approved: 2 } });
    });

    it.each(['SALES', 'WAREHOUSE'])('are hidden from %s', async (role) => {
        as(role);
        expect(await getExpenseClaimCounts()).toMatchObject({ success: false });
        expect(mocks.getClaimsSummaryCounts).not.toHaveBeenCalled();
    });
});
