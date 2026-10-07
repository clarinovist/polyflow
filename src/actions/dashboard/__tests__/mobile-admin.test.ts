import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), overview: vi.fn(), section: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({ requireMobilePortalAccess: mocks.guard }));
vi.mock('@/services/dashboard/mobile-admin-service', () => ({ MobileAdminService: { getOverview: mocks.overview, getModuleSections: mocks.section } }));

import { getAdminMobileOverview, getAdminMobileSection } from '../mobile-admin';

describe('Admin Mobile action', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({
            portal: { id: 'admin' },
            dataDependencies: [
                { moduleKey: 'FINANCE', permissionRoots: ['/finance'], match: 'ANY' },
            ],
            activeModules: ['CORE', 'FINANCE'], permissions: 'ALL', availablePortals: [],
        });
        mocks.overview.mockResolvedValue({ generatedAt: '2026-10-07T00:00:00.000Z' });
        mocks.section.mockResolvedValue({ generatedAt: '2026-10-07T00:00:00.000Z' });
    });

    it('guards the direct action before calling the read service', async () => {
        await expect(getAdminMobileOverview()).resolves.toMatchObject({ success: true });
        expect(mocks.guard).toHaveBeenCalledWith('admin');
        expect(mocks.overview).toHaveBeenCalledWith({
            activeModules: ['CORE', 'FINANCE'],
            permissions: 'ALL',
            availablePortals: [],
            dataDependencies: [
                { moduleKey: 'FINANCE', permissionRoots: ['/finance'], match: 'ANY' },
            ],
        });
    });

    it('guards module section reads and passes a bounded module selector', async () => {
        await expect(getAdminMobileSection('FINANCE')).resolves.toMatchObject({ success: true });
        expect(mocks.guard).toHaveBeenCalledWith('admin');
        expect(mocks.section).toHaveBeenCalledWith(
            expect.objectContaining({ onlyModules: ['FINANCE'] }),
        );
        expect(mocks.overview).not.toHaveBeenCalled();
    });

    it.each(['non-admin', 'super-admin', 'impersonation', 'rollout-disabled'])('does not query after %s denial', async () => {
        mocks.guard.mockRejectedValueOnce(new Error('denied'));
        await expect(getAdminMobileOverview()).resolves.toMatchObject({ success: false });
        expect(mocks.overview).not.toHaveBeenCalled();
    });
});
