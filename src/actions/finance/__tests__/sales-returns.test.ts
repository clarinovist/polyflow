import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    finance: vi.fn(), user: vi.fn(), permissions: vi.fn(), entitled: vi.fn(),
    summary: vi.fn(), page: vi.fn(), detail: vi.fn(), tenant: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => { mocks.tenant(); return fn(...args); } }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { user: { findUnique: mocks.user }, rolePermission: { findMany: mocks.permissions } } }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: mocks.finance }));
vi.mock('@/lib/auth/access-policy', async (original) => ({ ...await original<object>(), hasWorkspaceEntitlement: mocks.entitled }));
vi.mock('@/services/finance/sales-return-query-service', () => ({ getFinanceReturnSummary: mocks.summary, getFinanceReturnPage: mocks.page, getFinanceReturnDetail: mocks.detail }));
import { getFinanceSalesReturnSummary, getFinanceSalesReturnPage, getFinanceSalesReturnDetail } from '../sales-returns';

const calls = [() => getFinanceSalesReturnSummary(), () => getFinanceSalesReturnPage({ status: 'DRAFT' }), () => getFinanceSalesReturnDetail('return-1')];

describe('Finance return action authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.finance.mockResolvedValue({ user: { id: 'finance-1', role: 'FINANCE', roles: ['FINANCE'] } });
        mocks.user.mockResolvedValue({ isActive: true });
        mocks.permissions.mockResolvedValue([{ resource: '/finance' }]);
        mocks.entitled.mockReturnValue(true);
        mocks.summary.mockResolvedValue({ count: 2 });
        mocks.page.mockResolvedValue({ rows: [] });
        mocks.detail.mockResolvedValue(null);
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
        mocks.user.mockResolvedValue({ isActive: true });
        mocks.entitled.mockReturnValue(false);
        expect((await calls[0]()).success).toBe(false);
        expect(mocks.summary).not.toHaveBeenCalled();
    });

    it('allows active tenant ADMIN but never superadmin tenant access', async () => {
        mocks.finance.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });
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
