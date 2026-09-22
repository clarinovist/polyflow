import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    admin: vi.fn(), issue: vi.fn(), apply: vi.fn(), walletReverse: vi.fn(), noteReverse: vi.fn(), link: vi.fn(), revokeLink: vi.fn(),
    finance: vi.fn(), user: vi.fn(), permissions: vi.fn(), entitled: vi.fn(), quickPost: vi.fn(), quickPreview: vi.fn(), quickOrders: vi.fn(), quickItems: vi.fn(),
    summary: vi.fn(), page: vi.fn(), detail: vi.fn(), tenant: vi.fn(), approver: vi.fn(), db: vi.fn(), post: vi.fn(), proposed: vi.fn(), proposal: vi.fn(), transaction: vi.fn(), manual: vi.fn(), reverse: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => { mocks.tenant(); return fn(...args); } }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { user: { findUnique: mocks.user }, rolePermission: { findMany: mocks.permissions } }, getTenantDbFromContext: mocks.db }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: mocks.finance, requireFinanceApprover: mocks.approver, requireFinanceAdmin: mocks.admin }));
vi.mock('@/services/finance/sales-return-credit-service', () => ({ postReturnCredit: mocks.post }));
vi.mock('@/services/finance/quick-sales-return-service', () => ({ postQuickSalesReturn: mocks.quickPost, previewQuickSalesReturn: mocks.quickPreview, getQuickReturnOrders: mocks.quickOrders, getQuickReturnOrderItems: mocks.quickItems }));
vi.mock('@/services/finance/manual-return-credit-service', () => ({ postManualReturnCredit: mocks.manual }));
vi.mock('@/services/finance/return-credit-proposal-service', () => ({ postProposedReturnCredit: mocks.proposed, prepareReturnCreditProposal: mocks.proposal }));
vi.mock('@/services/finance/sales-return-credit-reversal-service', () => ({ reverseReturnCredit: mocks.reverse }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/services/finance/customer-credit-issue-service',()=>({issueCustomerCredit:mocks.issue}));
vi.mock('@/services/finance/customer-credit-application-service',()=>({applyCustomerCredit:mocks.apply,reverseCustomerCreditApplication:mocks.walletReverse,reverseCustomerCreditNote:mocks.noteReverse}));
vi.mock('@/services/finance/customer-credit-link-service',()=>({approveCustomerCreditLink:mocks.link,revokeCustomerCreditLink:mocks.revokeLink}));
import { issueFinanceCustomerCredit, applyFinanceCustomerCredit, reverseFinanceCustomerCreditApplication, reverseFinanceCustomerCreditNote, approveFinanceCustomerCreditLink, revokeFinanceCustomerCreditLink } from '../sales-returns';
vi.mock('@/lib/auth/access-policy', async (original) => ({ ...await original<object>(), hasWorkspaceEntitlement: mocks.entitled }));
vi.mock('@/services/finance/sales-return-query-service', () => ({ getFinanceReturnSummary: mocks.summary, getFinanceReturnPage: mocks.page, getFinanceReturnDetail: mocks.detail }));
import { getFinanceQuickReturnOrders, getFinanceQuickReturnItems, previewFinanceQuickReturn, postFinanceQuickReturn, getFinanceSalesReturnSummary, getFinanceSalesReturnPage, getFinanceSalesReturnDetail, postFinanceSalesReturnCredit, reverseFinanceSalesReturnCredit, postFinanceManualSalesReturnCredit, postFinanceProposedReturnCredit, getFinanceReturnCreditProposal } from '../sales-returns';

const calls = [() => getFinanceSalesReturnSummary(), () => getFinanceSalesReturnPage({ status: 'DRAFT' }), () => getFinanceSalesReturnDetail('return-1')];

describe('Finance return action authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.finance.mockResolvedValue({ user: { id: 'finance-1', role: 'FINANCE', roles: ['FINANCE'] } });
        mocks.approver.mockResolvedValue({ user: { id: 'finance-1', role: 'FINANCE', roles: ['FINANCE'] } });
        mocks.db.mockReturnValue({ $transaction: mocks.transaction });
        mocks.admin.mockResolvedValue({user:{id:'finance-1',role:'ADMIN'}});
        for(const fn of [mocks.issue,mocks.apply,mocks.walletReverse,mocks.noteReverse])fn.mockResolvedValue({id:'note',returnId:'return-1'});
        mocks.link.mockResolvedValue({id:'link'});mocks.revokeLink.mockResolvedValue({id:'link'});
        mocks.transaction.mockImplementation((callback: (tx: object) => unknown) => callback({}));
        mocks.proposal.mockResolvedValue({ ready: false, reason: 'Requires review' });
        mocks.post.mockResolvedValue({ salesReturnId: 'return-1', status: 'POSTED' });
        mocks.quickPost.mockResolvedValue({ id: 'return-1', returnNumber: 'SR-TEST' });
        mocks.manual.mockResolvedValue({ salesReturnId: 'return-1', status: 'POSTED' });
        mocks.proposed.mockResolvedValue({ salesReturnId: 'return-1', status: 'POSTED' });
        mocks.reverse.mockResolvedValue({ salesReturnId: 'return-1', status: 'REVERSED' });
        mocks.user.mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] });
        mocks.permissions.mockResolvedValue([{ resource: '/finance' }]);
        mocks.entitled.mockReturnValue(true);
        mocks.summary.mockResolvedValue({ count: 2 });
        mocks.page.mockResolvedValue({ rows: [] });
        mocks.detail.mockResolvedValue(null);
    });

    it('guards every quick-return entry and refreshes stock/invoice only after successful posting', async () => {
        expect((await postFinanceQuickReturn({ actor: 'untrusted' })).success).toBe(true);
        expect(mocks.quickPost).toHaveBeenCalledWith({ actor: 'untrusted' }, 'finance-1');
        expect(mocks.revalidate).toHaveBeenCalledWith('/warehouse/inventory');
        expect(mocks.revalidate).toHaveBeenCalledWith('/finance/rekap-piutang');
        mocks.quickPost.mockClear(); mocks.revalidate.mockClear();
        mocks.user.mockResolvedValue({ isActive: true, role: 'SALES', roles: [] });
        for (const action of [postFinanceQuickReturn, previewFinanceQuickReturn, getFinanceQuickReturnOrders, getFinanceQuickReturnItems]) {
            expect((await action('order')).success).toBe(false);
        }
        expect(mocks.quickPost).not.toHaveBeenCalled(); expect(mocks.quickPreview).not.toHaveBeenCalled();
        expect(mocks.quickOrders).not.toHaveBeenCalled(); expect(mocks.quickItems).not.toHaveBeenCalled();
        expect(mocks.revalidate).not.toHaveBeenCalled();
        mocks.user.mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] });
        mocks.quickPost.mockRejectedValue(new Error('Receipt rolled back'));
        expect((await postFinanceQuickReturn({})).success).toBe(false);
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it.each([postFinanceQuickReturn, postFinanceSalesReturnCredit, reverseFinanceSalesReturnCredit, postFinanceManualSalesReturnCredit, postFinanceProposedReturnCredit, issueFinanceCustomerCredit, applyFinanceCustomerCredit, reverseFinanceCustomerCreditApplication, reverseFinanceCustomerCreditNote])('requires approver, resource, active user, entitlement and tenant for direct mutations', async action => {
        expect((await action({ returnId: 'return-1' })).success).toBe(true);
        expect(mocks.revalidate).toHaveBeenCalledWith('/finance/returns/return-1');
        expect(mocks.revalidate).toHaveBeenCalledWith('/finance/invoices/sales/[id]', 'page');
        mocks.revalidate.mockClear(); mocks.post.mockClear(); mocks.reverse.mockClear(); mocks.manual.mockClear(); mocks.proposed.mockClear();
        mocks.db.mockReturnValue(undefined);
        expect((await action({})).success).toBe(false);
        mocks.db.mockReturnValue({}); mocks.entitled.mockReturnValue(false);
        expect((await action({})).success).toBe(false);
        mocks.entitled.mockReturnValue(true); mocks.user.mockResolvedValue({isActive:false});
        expect((await action({})).success).toBe(false);
        mocks.user.mockResolvedValue({isActive:true,role:'FINANCE',roles:[]}); mocks.permissions.mockResolvedValue([{resource:'/sales/returns'}]);
        expect((await action({})).success).toBe(false);
        mocks.permissions.mockResolvedValue([{resource:'/finance/returns'}]); mocks.approver.mockRejectedValue(new Error('Unauthorized'));
        expect((await action({})).success).toBe(false);
        expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.reverse).not.toHaveBeenCalled(); expect(mocks.manual).not.toHaveBeenCalled(); expect(mocks.proposed).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it.each([approveFinanceCustomerCreditLink,revokeFinanceCustomerCreditLink])('requires fresh ADMIN identity permission, not merely a stale ADMIN session',async action=>{
        expect((await action({})).success).toBe(false);
        expect(mocks.link).not.toHaveBeenCalled();expect(mocks.revokeLink).not.toHaveBeenCalled();
        mocks.user.mockResolvedValue({isActive:true,role:'ADMIN',roles:[]});
        expect((await action({})).success).toBe(true);
        expect(mocks.admin).toHaveBeenCalled();
    });
    it('rejects stale Finance JWT roles revoked in the tenant database', async () => {
        mocks.user.mockResolvedValue({isActive:true,role:'SALES',roles:[]});
        expect((await postFinanceSalesReturnCredit({})).success).toBe(false);
        expect((await postFinanceManualSalesReturnCredit({})).success).toBe(false);
        expect(mocks.post).not.toHaveBeenCalled();
        expect(mocks.manual).not.toHaveBeenCalled();
    });
    it('does not revalidate after a failed financial transaction', async () => {
        mocks.post.mockRejectedValue(new Error('transaction rolled back'));
        expect((await postFinanceSalesReturnCredit({})).success).toBe(false);
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('derives manual approver from session and never revalidates failed manual posting', async () => {
        const input = { returnId: 'return-1', approvedById: 'untrusted-client-actor' };
        expect((await postFinanceManualSalesReturnCredit(input)).success).toBe(true);
        expect(mocks.manual).toHaveBeenCalledWith(input, 'finance-1');
        mocks.revalidate.mockClear(); mocks.manual.mockRejectedValue(new Error('transaction rollback'));
        expect((await postFinanceManualSalesReturnCredit(input)).success).toBe(false);
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('requires fresh read access and tenant for proposal without allowing arbitrary mutation', async () => {
        expect((await getFinanceReturnCreditProposal('return-1')).success).toBe(true);
        expect(mocks.proposal).toHaveBeenCalledWith({}, 'return-1');
        mocks.proposal.mockClear(); mocks.db.mockReturnValue(undefined);
        expect((await getFinanceReturnCreditProposal('return-1')).success).toBe(false);
        expect(mocks.proposal).not.toHaveBeenCalled();
        mocks.db.mockReturnValue({ $transaction: mocks.transaction }); mocks.user.mockResolvedValue({ isActive: true, role: 'SALES', roles: [] });
        expect((await getFinanceReturnCreditProposal('return-1')).success).toBe(false);
        expect((await postFinanceProposedReturnCredit({})).success).toBe(false);
        expect(mocks.proposed).not.toHaveBeenCalled();
    });
    it('runs all queries inside the tenant boundary after authorization', async () => {
        expect((await calls[0]()).success).toBe(true);
        expect((await calls[1]()).success).toBe(true);
        expect(await calls[2]()).toMatchObject({ success: true, data: null });
        expect(mocks.tenant).toHaveBeenCalledTimes(3);
        expect(mocks.finance).toHaveBeenCalledTimes(3);
        expect(mocks.permissions).toHaveBeenCalledWith({ where: { role: { in: ['FINANCE'] }, canAccess: true }, select: { resource: true } });
        expect(mocks.page).toHaveBeenCalledWith({ status: 'DRAFT' });
        expect(mocks.detail).toHaveBeenCalledWith('return-1');
    });

    it.each(calls)('rejects a direct action caller without Finance role', async (call) => {
        mocks.finance.mockRejectedValue(new Error('Unauthorized'));
        expect((await call()).success).toBe(false);
        expect(mocks.summary).not.toHaveBeenCalled();
        expect(mocks.page).not.toHaveBeenCalled();
        expect(mocks.detail).not.toHaveBeenCalled();
    });

    it('allows explicit return permission without opening other Sales resources', async () => {
        mocks.permissions.mockResolvedValue([{ resource: '/finance/returns' }]);
        expect((await calls[0]()).success).toBe(true);
    });

    it.each([[], [{ resource: '/finance/invoices' }], [{ resource: '/sales/returns' }]])('denies sibling/ungranted resources', async (...resources) => {
        mocks.permissions.mockResolvedValue(resources);
        expect((await calls[0]()).success).toBe(false);
        expect(mocks.summary).not.toHaveBeenCalled();
    });

    it('rejects inactive users and missing entitlements before reading returns', async () => {
        mocks.user.mockResolvedValue({ isActive: false });
        expect((await calls[0]()).success).toBe(false);
        mocks.user.mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] });
        mocks.entitled.mockReturnValue(false);
        expect((await calls[0]()).success).toBe(false);
        expect(mocks.summary).not.toHaveBeenCalled();
    });

    it('allows active tenant ADMIN but never superadmin tenant access', async () => {
        mocks.finance.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });
        mocks.user.mockResolvedValue({ isActive: true, role: 'ADMIN', roles: [] });
        expect((await calls[0]()).success).toBe(true);
        expect(mocks.permissions).not.toHaveBeenCalled();
        mocks.finance.mockResolvedValue({ user: { id: 'super', role: 'SUPER_ADMIN', isSuperAdmin: true } });
        expect((await calls[0]()).success).toBe(false);
        expect(mocks.summary).toHaveBeenCalledTimes(1);
    });

    it('preserves read failure instead of returning an empty success', async () => {
        mocks.detail.mockRejectedValue(new Error('query failed'));
        expect((await calls[2]()).success).toBe(false);
    });
});
