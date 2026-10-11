import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    user: vi.fn(),
    grant: vi.fn(),
    features: vi.fn(),
    domain: vi.fn(),
    portal: vi.fn(),
    financeOverview: vi.fn(),
    financeDetail: vi.fn(),
    purchasingOverview: vi.fn(),
    purchasingDetail: vi.fn(),
    db: {},
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: m.user },
        rolePermission: { findFirst: m.grant, findMany: m.features },
    },
    getTenantDbFromContext: () => m.db,
    getTenantIdFromContext: () => 'synthetic-tenant',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: m.domain }));
vi.mock('@/lib/auth/purchasing-access', () => ({ requirePurchasingAccess: m.domain }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({ requireMobilePortalAccess: m.portal }));
vi.mock('@/services/finance/mobile-finance-service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/finance/mobile-finance-service')>()),
    readFinanceMobileOverview: m.financeOverview,
    readFinanceMobileInvoiceDetail: m.financeDetail,
}));
vi.mock('@/services/purchasing/mobile-purchasing-service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/purchasing/mobile-purchasing-service')>()),
    readPurchasingMobileOverview: m.purchasingOverview,
    readPurchasingMobileDetail: m.purchasingDetail,
}));

// Use the real canViewPrices/getMyExplicitFeaturePermissions implementations.
import { getFinanceMobileInvoiceDetail, getFinanceMobileOverview } from '../mobile-dashboard';
import {
    getPurchasingMobileOverview,
    getPurchasingMobileRequestDetail,
    getPurchasingMobileOrderDetail,
    getPurchasingMobileReceiptDetail,
} from '@/actions/purchasing/mobile-dashboard';

const readers = [
    { name: 'Finance overview', run: () => getFinanceMobileOverview(), spy: m.financeOverview, decision: (args: unknown[]) => (args[1] as { canViewAmounts: boolean }).canViewAmounts },
    { name: 'Finance AR detail', run: () => getFinanceMobileInvoiceDetail('AR', 'ar-1'), spy: m.financeDetail, decision: (args: unknown[]) => args[3] },
    { name: 'Finance AP detail', run: () => getFinanceMobileInvoiceDetail('AP', 'ap-1'), spy: m.financeDetail, decision: (args: unknown[]) => args[3] },
    { name: 'Purchasing overview', run: () => getPurchasingMobileOverview(), spy: m.purchasingOverview, decision: (args: unknown[]) => (args[0] as { canViewAmounts: boolean }).canViewAmounts },
    { name: 'Purchasing PR detail', run: () => getPurchasingMobileRequestDetail('pr-1'), spy: m.purchasingDetail, decision: (args: unknown[]) => (args[0] as { canViewAmounts: boolean }).canViewAmounts },
    { name: 'Purchasing PO detail', run: () => getPurchasingMobileOrderDetail('po-1'), spy: m.purchasingDetail, decision: (args: unknown[]) => (args[0] as { canViewAmounts: boolean }).canViewAmounts },
    { name: 'Purchasing receipt detail', run: () => getPurchasingMobileReceiptDetail('gr-1'), spy: m.purchasingDetail, decision: (args: unknown[]) => (args[0] as { canViewAmounts: boolean }).canViewAmounts },
];

beforeEach(() => {
    vi.resetAllMocks();
    const session = { user: { id: 'admin', role: 'ADMIN' } };
    m.auth.mockResolvedValue(session);
    m.domain.mockResolvedValue(session);
    m.portal.mockResolvedValue({});
    m.user.mockResolvedValue({ isActive: true });
    m.grant.mockResolvedValue(null);
    m.features.mockResolvedValue([]);
    for (const reader of readers) reader.spy.mockResolvedValue({});
});

describe.each(readers)('$name uses canonical nominal permission', ({ run, spy, decision }) => {
    it.each([
        { role: 'ADMIN' },
        { role: 'FINANCE', roles: ['FINANCE', 'ADMIN'] },
    ])('allows an active admin with no feature grant: %j', async (roles) => {
        m.auth.mockResolvedValue({ user: { id: 'admin', ...roles } });
        expect(await run()).toMatchObject({ success: true });
        expect(decision(spy.mock.calls[0])).toBe(true);
        expect(m.grant).not.toHaveBeenCalled();
        expect(m.features).not.toHaveBeenCalled();
    });

    it.each([false, true])('requires an explicit non-admin price grant: %s', async (allowed) => {
        m.auth.mockResolvedValue({ user: { id: 'finance', role: 'FINANCE' } });
        m.grant.mockResolvedValue(allowed ? { resource: 'feature:view-prices' } : null);
        expect(await run()).toMatchObject({ success: true });
        expect(decision(spy.mock.calls[0])).toBe(allowed);
        expect(m.grant).toHaveBeenCalledWith({
            where: { role: { in: ['FINANCE'] }, resource: 'feature:view-prices', canAccess: true },
        });
    });

    it.each(['inactive', 'missing-user', 'missing-session', 'missing-id', 'lookup-error', 'grant-error'])(
        'fails closed on %s without promoting ADMIN to all features', async (failure) => {
            if (failure === 'inactive') m.user.mockResolvedValue({ isActive: false });
            if (failure === 'missing-user') m.user.mockResolvedValue(null);
            if (failure === 'missing-session') m.auth.mockResolvedValue(null);
            if (failure === 'missing-id') m.auth.mockResolvedValue({ user: { role: 'ADMIN' } });
            if (failure === 'lookup-error') m.user.mockRejectedValue(new Error('Synthetic failure'));
            if (failure === 'grant-error') {
                m.auth.mockResolvedValue({ user: { id: 'finance', role: 'FINANCE' } });
                m.grant.mockRejectedValue(new Error('Synthetic failure'));
            }
            expect(await run()).toMatchObject({ success: true });
            expect(decision(spy.mock.calls[0])).toBe(false);
        },
    );

    it.each(['domain', 'portal'] as const)('never reads nominal after %s denial', async (guard) => {
        m[guard].mockRejectedValue(new Error('Denied'));
        expect(await run()).toMatchObject({ success: false });
        expect(spy).not.toHaveBeenCalled();
        expect(m.user).not.toHaveBeenCalled();
        expect(m.grant).not.toHaveBeenCalled();
    });
});
