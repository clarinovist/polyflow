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

    it('keeps rollout lookup empty for existing ACTIVE portals', async () => {
        await requireMobilePortalAccess('finance');
        expect(mocks.rollouts).toHaveBeenCalledWith(
            [],
            mocks.tenantDb.appSetting,
        );
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
            reason: 'ROLE',
        });
    });

    it('keeps Super Admin desktop-only', async () => {
        mocks.auth.mockResolvedValue({
            user: { id: 'super', isSuperAdmin: true },
        });
        await expect(requireMobilePortalAccess('finance')).rejects.toEqual(
            expect.objectContaining({
                reason: 'ROLE',
            } satisfies Partial<MobilePortalAccessError>),
        );
    });
});
