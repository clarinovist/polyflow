import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    auditCreate: vi.fn(),
    getProductInsights: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { auditLog: { create: mocks.auditCreate } },
}));
vi.mock('@/services/admin/usage-insights.service', () => ({
    UsageInsightsService: { getProductInsights: mocks.getProductInsights },
}));
vi.mock('@/services/admin/usage-analytics.service', () => ({
    UsageAnalyticsService: { getAnalytics: vi.fn() },
}));

import { fetchProductInsights } from '../usage-analytics';

describe('fetchProductInsights', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auditCreate.mockResolvedValue({});
        mocks.getProductInsights.mockResolvedValue({ modules: [] });
    });

    it('rejects a non-super-admin tenant user', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'u1', role: 'ADMIN', isSuperAdmin: false },
        });

        await expect(fetchProductInsights({ range: '7d' })).rejects.toThrow(
            /unauthorized/i,
        );
        expect(mocks.getProductInsights).not.toHaveBeenCalled();
    });

    it('rejects when there is no session', async () => {
        mocks.auth.mockResolvedValue(null);

        await expect(fetchProductInsights({})).rejects.toThrow(/unauthorized/i);
        expect(mocks.getProductInsights).not.toHaveBeenCalled();
    });

    it('audits and returns insights for a super admin', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'u1', isSuperAdmin: true },
        });

        const result = await fetchProductInsights({ range: '30d' });

        expect(result).toEqual({ modules: [] });
        expect(mocks.auditCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: 'u1',
                action: 'VIEW_PRODUCT_INSIGHTS',
            }),
        });
        expect(mocks.getProductInsights).toHaveBeenCalledWith({ range: '30d' });
    });

    it('still returns insights when the audit write fails', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });
        mocks.auditCreate.mockRejectedValue(new Error('db down'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(fetchProductInsights({})).resolves.toEqual({ modules: [] });
    });
});
