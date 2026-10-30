import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ read: vi.fn(), approve: vi.fn(), db: vi.fn(), user: vi.fn(), grants: vi.fn(), entitled: vi.fn(), context: vi.fn(), preview: vi.fn(), post: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.read, requireFinanceApprover: m.approve }));
vi.mock('@/lib/auth/access-policy', async original => ({ ...await original<object>(), hasWorkspaceEntitlement: m.entitled }));
vi.mock('@/services/purchasing/price-correction-service', () => ({ getPurchasePriceCorrectionContext: m.context, previewPurchasePriceCorrection: m.preview, postPurchasePriceCorrection: m.post }));
vi.mock('next/cache', () => ({ revalidatePath: m.refresh }));
import { getFinancePurchasePriceCorrectionContext, previewFinancePurchasePriceCorrection, postFinancePurchasePriceCorrection } from '../purchase-price-correction';

beforeEach(() => {
    vi.clearAllMocks();
    m.read.mockResolvedValue({ user: { id: 'actor' } });
    m.approve.mockResolvedValue({ user: { id: 'actor' } });
    m.db.mockReturnValue({ user: { findUnique: m.user }, rolePermission: { findMany: m.grants } });
    m.user.mockResolvedValue({ isActive: true, role: 'FINANCE', roles: [] });
    m.grants.mockResolvedValue([{ resource: '/finance/invoices/purchase' }]);
    m.entitled.mockReturnValue(true);
    m.context.mockResolvedValue({ invoiceId: 'bill', items: [], history: [] });
    m.preview.mockResolvedValue({ receiptAmount: '20.00' });
    m.post.mockResolvedValue({ invoiceId: 'bill', purchaseOrderId: 'po' });
});

describe('purchase price correction authorization', () => {
    it('uses read guards for context and preview without refresh', async () => {
        expect((await getFinancePurchasePriceCorrectionContext('bill')).success).toBe(true);
        expect((await previewFinancePurchasePriceCorrection({})).success).toBe(true);
        expect(m.read).toHaveBeenCalledTimes(2);
        expect(m.approve).not.toHaveBeenCalled();
        expect(m.refresh).not.toHaveBeenCalled();
    });
    it('uses approver and session actor, refreshing only success', async () => {
        expect((await postFinancePurchasePriceCorrection({ createdById: 'forged' })).success).toBe(true);
        expect(m.approve).toHaveBeenCalledOnce();
        expect(m.read).not.toHaveBeenCalled();
        expect(m.post).toHaveBeenCalledWith({ createdById: 'forged' }, 'actor');
        expect(m.refresh).toHaveBeenCalledWith('/finance/invoices/purchase/bill');
    });
    it.each(['tenant', 'inactive', 'role', 'permission', 'entitlement', 'superadmin', 'guard'])('rejects %s before any service access', async kind => {
        if (kind === 'tenant') m.db.mockReturnValue(undefined);
        if (kind === 'inactive') m.user.mockResolvedValue({ isActive: false });
        if (kind === 'role') m.user.mockResolvedValue({ isActive: true, role: 'PROCUREMENT', roles: [] });
        if (kind === 'permission') m.grants.mockResolvedValue([{ resource: '/finance/invoices/sales' }]);
        if (kind === 'entitlement') m.entitled.mockReturnValue(false);
        if (kind === 'superadmin') { m.read.mockResolvedValue({ user: { id: 'actor', isSuperAdmin: true } }); m.approve.mockResolvedValue({ user: { id: 'actor', isSuperAdmin: true } }); }
        if (kind === 'guard') { m.read.mockRejectedValue(new Error('Ditolak')); m.approve.mockRejectedValue(new Error('Ditolak')); }
        expect((await getFinancePurchasePriceCorrectionContext('bill')).success).toBe(false);
        expect((await previewFinancePurchasePriceCorrection({})).success).toBe(false);
        expect((await postFinancePurchasePriceCorrection({})).success).toBe(false);
        expect(m.context).not.toHaveBeenCalled();
        expect(m.preview).not.toHaveBeenCalled();
        expect(m.post).not.toHaveBeenCalled();
        expect(m.refresh).not.toHaveBeenCalled();
    });
    it('allows active tenant ADMIN without granular grants', async () => {
        m.user.mockResolvedValue({ isActive: true, role: 'ADMIN', roles: [] });
        m.grants.mockResolvedValue([]);
        expect((await postFinancePurchasePriceCorrection({})).success).toBe(true);
        expect(m.grants).not.toHaveBeenCalled();
    });
    it('does not refresh a failed transaction', async () => {
        m.post.mockRejectedValue(new Error('Transaksi dibatalkan'));
        expect((await postFinancePurchasePriceCorrection({})).success).toBe(false);
        expect(m.refresh).not.toHaveBeenCalled();
    });
});
