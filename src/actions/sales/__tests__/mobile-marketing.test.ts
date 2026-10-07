import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    portal: vi.fn(),
    manager: vi.fn(),
    prices: vi.fn(),
    read: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: m.portal,
}));
vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesManager: m.manager,
}));
vi.mock('@/actions/admin/permissions', () => ({ canViewPrices: m.prices }));
vi.mock('@/services/sales/mobile-marketing-service', () => ({
    readMarketingMobileOverview: m.read,
}));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));

import { getMarketingMobileOverview } from '../mobile-marketing';

beforeEach(() => {
    vi.resetAllMocks();
    m.portal.mockResolvedValue({ portal: { id: 'marketing-supervisor' } });
    m.manager.mockResolvedValue({ user: { id: 'marketing-1', role: 'MARKETING' } });
    m.prices.mockResolvedValue({ success: true, data: false });
    m.read.mockResolvedValue({ generatedAt: '2026-10-07T00:00:00.000Z' });
});

describe('marketing mobile action', () => {
    it('requires portal rollout/direct access and manager role before reading', async () => {
        await expect(getMarketingMobileOverview()).resolves.toMatchObject({
            success: true,
        });
        expect(m.portal).toHaveBeenCalledWith('marketing-supervisor');
        expect(m.manager).toHaveBeenCalledOnce();
        expect(m.read).toHaveBeenCalledWith({ canViewPrices: false });
        expect(m.portal.mock.invocationCallOrder[0]).toBeLessThan(
            m.read.mock.invocationCallOrder[0],
        );
        expect(m.manager.mock.invocationCallOrder[0]).toBeLessThan(
            m.read.mock.invocationCallOrder[0],
        );
    });

    it('denies SALES and does not read data', async () => {
        m.manager.mockRejectedValue(new Error('Unauthorized'));
        await expect(getMarketingMobileOverview()).resolves.toMatchObject({
            success: false,
        });
        expect(m.read).not.toHaveBeenCalled();
    });

    it('denies when the tenant rollout/direct portal guard fails', async () => {
        m.portal.mockRejectedValue(new Error('Rollout disabled'));
        await expect(getMarketingMobileOverview()).resolves.toMatchObject({
            success: false,
        });
        expect(m.manager).not.toHaveBeenCalled();
        expect(m.read).not.toHaveBeenCalled();
    });

    it('forwards the canonical price decision and fails closed on read failure', async () => {
        m.prices.mockResolvedValue({ success: false });
        await getMarketingMobileOverview();
        expect(m.read).toHaveBeenCalledWith({ canViewPrices: false });

        m.prices.mockResolvedValue({ success: true, data: true });
        m.read.mockRejectedValue(new Error('Synthetic read failure'));
        await expect(getMarketingMobileOverview()).resolves.toMatchObject({
            success: false,
        });
        expect(m.read).toHaveBeenLastCalledWith({ canViewPrices: true });
    });

    it('exports no marketing mutation surface', async () => {
        const exported = await import('../mobile-marketing');
        expect(Object.keys(exported)).toEqual(['getMarketingMobileOverview']);
    });
});
