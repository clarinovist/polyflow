import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    access: vi.fn(),
    portal: vi.fn(),
    prices: vi.fn(),
    overview: vi.fn(),
    detail: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingAccess: m.access,
}));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: m.portal,
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyExplicitFeaturePermissions: m.prices,
}));
vi.mock('@/services/purchasing/mobile-purchasing-service', async (importOriginal) => {
    const actual = await importOriginal<
        typeof import('@/services/purchasing/mobile-purchasing-service')
    >();
    return {
        ...actual,
        readPurchasingMobileOverview: m.overview,
        readPurchasingMobileDetail: m.detail,
    };
});
vi.mock('@/lib/utils/utils', () => ({ serializeData: (value: unknown) => value }));

import {
    getPurchasingMobileOrderDetail,
    getPurchasingMobileOverview,
    getPurchasingMobileRequestDetail,
} from '../mobile-dashboard';

beforeEach(() => {
    vi.resetAllMocks();
    m.access.mockResolvedValue({
        user: { id: 'planning-1', role: 'PLANNING', roles: ['PLANNING'] },
    });
    m.portal.mockResolvedValue({ portal: { id: 'purchasing' } });
    m.prices.mockResolvedValue({ success: true, data: [] });
    m.overview.mockResolvedValue({ generatedAt: '2026-10-07T00:00:00.000Z' });
    m.detail.mockResolvedValue({ kind: 'ORDER', id: 'po-1' });
});

describe('purchasing mobile read actions', () => {
    it('guards before overview and keeps PLANNING PR scope actor-owned', async () => {
        await expect(getPurchasingMobileOverview('ETA')).resolves.toMatchObject({
            success: true,
        });
        expect(m.portal).toHaveBeenCalledWith('purchasing');
        expect(m.overview).toHaveBeenCalledWith({
            filter: 'ETA',
            prOwnerId: 'planning-1',
            canViewAmounts: false,
        });
        expect(m.portal.mock.invocationCallOrder[0]).toBeLessThan(
            m.overview.mock.invocationCallOrder[0],
        );
    });

    it('gives PROCUREMENT the global PR queue and defaults invalid filters', async () => {
        m.access.mockResolvedValue({
            user: { id: 'procurement-1', role: 'PROCUREMENT' },
        });
        await getPurchasingMobileOverview('DROP_TABLE');
        expect(m.overview).toHaveBeenCalledWith({
            filter: 'ALL',
            prOwnerId: undefined,
            canViewAmounts: false,
        });
    });

    it('also gives tenant ADMIN the global PR queue', async () => {
        m.access.mockResolvedValue({
            user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
        });
        await getPurchasingMobileOverview();
        expect(m.overview).toHaveBeenCalledWith(
            expect.objectContaining({ prOwnerId: undefined }),
        );
    });

    it('forwards canonical amount permission and fails closed on its read failure', async () => {
        m.prices.mockResolvedValue({
            success: true,
            data: ['feature:view-prices'],
        });
        await getPurchasingMobileOverview();
        expect(m.overview).toHaveBeenCalledWith(
            expect.objectContaining({ canViewAmounts: true }),
        );

        m.prices.mockResolvedValue({ success: false });
        await getPurchasingMobileOverview();
        expect(m.overview).toHaveBeenLastCalledWith(
            expect.objectContaining({ canViewAmounts: false }),
        );
    });

    it('repeats direct portal/domain guards for compact detail actions', async () => {
        await getPurchasingMobileOrderDetail('po-1');
        expect(m.detail).toHaveBeenCalledWith({
            kind: 'ORDER',
            id: 'po-1',
            prOwnerId: 'planning-1',
            canViewAmounts: false,
        });
        expect(m.portal).toHaveBeenCalledWith('purchasing');
    });

    it('does not read detail data after a direct portal denial', async () => {
        m.portal.mockRejectedValue(new Error('Portal denied'));
        await expect(
            getPurchasingMobileOrderDetail('po-1'),
        ).resolves.toMatchObject({ success: false });
        expect(m.detail).not.toHaveBeenCalled();
    });

    it('rejects malformed IDs before auth and service reads', async () => {
        await expect(
            getPurchasingMobileRequestDetail('../tenant-other'),
        ).resolves.toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.access).not.toHaveBeenCalled();
        expect(m.portal).not.toHaveBeenCalled();
        expect(m.detail).not.toHaveBeenCalled();
    });

    it('exports no Purchasing Mobile mutation surface', async () => {
        const exported = await import('../mobile-dashboard');
        expect(Object.keys(exported).sort()).toEqual([
            'getPurchasingMobileOrderDetail',
            'getPurchasingMobileOverview',
            'getPurchasingMobileReceiptDetail',
            'getPurchasingMobileRequestDetail',
        ]);
    });
});
