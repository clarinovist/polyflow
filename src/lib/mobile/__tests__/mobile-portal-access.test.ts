import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    permissions: vi.fn(),
    features: vi.fn(),
    modules: vi.fn(),
    rollouts: vi.fn(),
    tenantDb: { appSetting: {} },
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: () => mocks.tenantDb,
    getEntitlementsFromContext: () => undefined,
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: mocks.permissions,
    getMyExplicitFeaturePermissions: mocks.features,
}));
vi.mock('@/lib/modules/tenant-entitlements', () => ({
    getActiveModuleKeys: mocks.modules,
}));
vi.mock('@/services/settings/mobile-portal-rollout-service', () => ({
    readMobilePortalRollouts: mocks.rollouts,
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));

import {
    resolveMobilePortalAccess,
    MobilePortalAccessError,
    requireMobilePortalAccess,
} from '../mobile-portal-access';

describe('mobile portal server guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.auth.mockResolvedValue({
            user: { id: 'user-1', role: 'FINANCE' },
        });
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/finance'],
        });
        mocks.features.mockResolvedValue({ success: true, data: [] });
        mocks.modules.mockResolvedValue(['CORE', 'FINANCE']);
        mocks.rollouts.mockResolvedValue({});
    });

    it('allows a direct route with fresh role, module, and resource', async () => {
        await expect(requireMobilePortalAccess('finance')).resolves.toMatchObject(
            { portal: { id: 'finance' }, capabilities: [] },
        );
    });

    it('denies a revoked direct route after the fresh permission read', async () => {
        mocks.permissions.mockResolvedValue({ success: true, data: [] });
        await expect(requireMobilePortalAccess('finance')).rejects.toMatchObject({
            reason: 'RESOURCE',
        });
    });

    it('denies when permission state cannot be refreshed', async () => {
        mocks.permissions.mockResolvedValue({ success: false });
        await expect(requireMobilePortalAccess('finance')).rejects.toMatchObject({
            reason: 'RESOURCE',
        });
    });

    it('reads only rollout keys declared by beta portals', async () => {
        await requireMobilePortalAccess('finance');
        expect(mocks.rollouts).toHaveBeenCalledWith(
            [
                'mobile.portal.marketing.enabled',
                'mobile.portal.admin.enabled',
            ],
            mocks.tenantDb.appSetting,
        );
    });

    it('enforces Admin Mobile rollout on direct access', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
        mocks.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        mocks.modules.mockResolvedValue(['CORE', 'FINANCE']);
        mocks.rollouts.mockResolvedValue({
            'mobile.portal.admin.enabled': true,
        });
        await expect(requireMobilePortalAccess('admin')).resolves.toMatchObject({
            portal: { id: 'admin' },
            activeModules: ['CORE', 'FINANCE'],
            permissions: 'ALL',
        });
        mocks.rollouts.mockResolvedValue({
            'mobile.portal.admin.enabled': false,
        });
        await expect(requireMobilePortalAccess('admin')).rejects.toMatchObject({ reason: 'ROLLOUT' });
    });

    it('denies a non-admin direct Admin Mobile request', async () => {
        mocks.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': true });
        await expect(requireMobilePortalAccess('admin')).rejects.toMatchObject({ reason: 'ROLE' });
    });

    it('allows Marketing only with the tenant rollout and denies Sales direct actions', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'marketing', role: 'MARKETING' },
        });
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/field/marketing'],
        });
        mocks.modules.mockResolvedValue(['CORE', 'SALES']);
        mocks.rollouts.mockResolvedValue({
            'mobile.portal.marketing.enabled': true,
        });
        await expect(
            requireMobilePortalAccess('marketing-supervisor'),
        ).resolves.toMatchObject({
            portal: { id: 'marketing-supervisor' },
        });

        mocks.auth.mockResolvedValue({ user: { id: 'sales', role: 'SALES' } });
        await expect(
            requireMobilePortalAccess('marketing-supervisor'),
        ).rejects.toMatchObject({ reason: 'ROLE' });
    });

    it('reports missing capability as false for server-rendered UI', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'manager', role: 'FACTORY_MANAGER' },
        });
        mocks.permissions.mockResolvedValue({
            success: true,
            data: [
                '/production/daily',
                '/warehouse/inventory',
                '/purchasing/requests',
                '/purchasing/orders',
            ],
        });
        mocks.modules.mockResolvedValue(['CORE', 'PRODUCTION']);
        await expect(
            resolveMobilePortalAccess(
                'production-supervisor',
                'feature:mobile-maintenance-approval',
            ),
        ).resolves.toEqual({ allowed: false, reason: 'FEATURE' });
    });

    it('denies direct risky action when capability is missing', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'manager', role: 'FACTORY_MANAGER' },
        });
        mocks.permissions.mockResolvedValue({
            success: true,
            data: [
                '/production/daily',
                '/warehouse/inventory',
                '/purchasing/requests',
                '/purchasing/orders',
            ],
        });
        mocks.modules.mockResolvedValue(['CORE', 'PRODUCTION']);
        await expect(
            requireMobilePortalAccess(
                'production-supervisor',
                'feature:mobile-maintenance-approval',
            ),
        ).rejects.toMatchObject({ reason: 'FEATURE' });
    });


    it('keeps impersonation sessions out of tenant mobile portals', async () => {
        mocks.auth.mockResolvedValue({
            user: {
                id: 'tenant-user',
                role: 'FINANCE',
                impersonatedBy: 'super-admin',
            },
        });
        await expect(requireMobilePortalAccess('finance')).rejects.toMatchObject({
            reason: 'DESKTOP_ONLY',
        });
    });

    it('keeps Super Admin desktop-only, including the Admin Mobile route', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'super', isSuperAdmin: true },
        });
        mocks.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': true });
        await expect(requireMobilePortalAccess('admin')).rejects.toEqual(
            expect.objectContaining({
                reason: 'DESKTOP_ONLY',
            } satisfies Partial<MobilePortalAccessError>),
        );
    });

    it('keeps impersonation out of the Admin Mobile route', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'tenant-admin', role: 'ADMIN', impersonatedBy: 'super-admin' },
        });
        mocks.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        mocks.modules.mockResolvedValue(['CORE']);
        mocks.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': true });
        await expect(requireMobilePortalAccess('admin')).rejects.toMatchObject({ reason: 'DESKTOP_ONLY' });
    });
});
