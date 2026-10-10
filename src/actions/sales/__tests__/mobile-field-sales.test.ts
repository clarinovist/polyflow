import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    portal: vi.fn(),
    sales: vi.fn(),
    prices: vi.fn(),
    read: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: m.portal,
}));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: m.sales }));
vi.mock('@/actions/admin/permissions', () => ({ canViewPrices: m.prices }));
vi.mock('@/services/sales/mobile-field-sales-service', () => ({
    readFieldSalesMobileOverview: m.read,
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));

import { getFieldSalesMobileOverview } from '../mobile-field-sales';

beforeEach(() => {
    vi.resetAllMocks();
    m.portal.mockResolvedValue({ portal: { id: 'sales-field' } });
    m.sales.mockResolvedValue({
        user: { id: 'sales-1', role: 'SALES', roles: ['SALES'] },
    });
    m.prices.mockResolvedValue({ success: true, data: false });
    m.read.mockResolvedValue({ generatedAt: '2026-10-10T00:00:00.000Z' });
});

describe('Field Sales mobile action', () => {
    it('guards portal then sales access then price decision before one read', async () => {
        await expect(getFieldSalesMobileOverview()).resolves.toMatchObject({
            success: true,
        });
        expect(m.portal).toHaveBeenCalledWith('sales-field');
        expect(m.read).toHaveBeenCalledWith({
            actor: {
                user: { id: 'sales-1', role: 'SALES', roles: ['SALES'] },
            },
            canViewPrices: false,
        });
        expect(m.portal.mock.invocationCallOrder[0]).toBeLessThan(
            m.sales.mock.invocationCallOrder[0],
        );
        expect(m.sales.mock.invocationCallOrder[0]).toBeLessThan(
            m.prices.mock.invocationCallOrder[0],
        );
        expect(m.prices.mock.invocationCallOrder[0]).toBeLessThan(
            m.read.mock.invocationCallOrder[0],
        );
    });

    it('stops before the read when portal or sales guard denies access', async () => {
        m.portal.mockRejectedValue(new Error('Portal denied'));
        await expect(getFieldSalesMobileOverview()).resolves.toMatchObject({
            success: false,
        });
        expect(m.sales).not.toHaveBeenCalled();
        expect(m.read).not.toHaveBeenCalled();

        m.portal.mockResolvedValue({ portal: { id: 'sales-field' } });
        m.sales.mockRejectedValue(new Error('Sales denied'));
        await expect(getFieldSalesMobileOverview()).resolves.toMatchObject({
            success: false,
        });
        expect(m.read).not.toHaveBeenCalled();
    });

    it('fails closed on price capability errors and exports no mutation', async () => {
        m.prices.mockResolvedValue({ success: false });
        await getFieldSalesMobileOverview();
        expect(m.read).toHaveBeenCalledWith(
            expect.objectContaining({ canViewPrices: false }),
        );

        const exported = await import('../mobile-field-sales');
        expect(Object.keys(exported)).toEqual(['getFieldSalesMobileOverview']);
    });
});
