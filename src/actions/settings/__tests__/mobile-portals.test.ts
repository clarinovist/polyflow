import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyMobilePortals } from '../mobile-portals';
const m = vi.hoisted(() => ({
    auth: vi.fn(),
    permissions: vi.fn(),
    features: vi.fn(),
    modules: vi.fn(),
    rollouts: vi.fn(),
    tenantDb: { appSetting: {} },
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: () => m.tenantDb,
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: m.auth }));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: m.permissions,
    getMyExplicitFeaturePermissions: m.features,
}));
vi.mock('@/lib/modules/tenant-entitlements', () => ({ getActiveModuleKeys: m.modules }));
vi.mock('@/services/settings/mobile-portal-rollout-service', () => ({
    readMobilePortalRollouts: m.rollouts,
}));
beforeEach(() => {
    vi.resetAllMocks(); m.auth.mockResolvedValue({ user: { role: 'FINANCE' } });
    m.permissions.mockResolvedValue({ success: true, data: ['/finance'] });
    m.features.mockResolvedValue({ success: true, data: [] });
    m.modules.mockResolvedValue(['CORE', 'FINANCE']);
    m.rollouts.mockResolvedValue({});
});
describe('verified mobile discovery action', () => {
    it('uses current permission and module lists', async () => {
        const res = await getMyMobilePortals(); expect(res.success).toBe(true);
        if (res.success) expect(res.data.map(p => p.id)).toEqual(['finance']);
    });
    it('does not grant a role candidate a revoked module or resource', async () => {
        m.modules.mockResolvedValue(['CORE']); expect(await getMyMobilePortals()).toMatchObject({ success: true, data: [] });
        m.modules.mockResolvedValue(['FINANCE']); m.permissions.mockResolvedValue({ success: true, data: [] });
        expect(await getMyMobilePortals()).toMatchObject({ success: true, data: [] });
    });
    it('does not fall back to JWT permissions on failed lookup', async () => {
        m.permissions.mockResolvedValue({ success: false }); expect(await getMyMobilePortals()).toMatchObject({ success: false });
    });
    it('keeps read discovery while capabilities fail closed', async () => {
        m.features.mockResolvedValue({ success: false });
        expect(await getMyMobilePortals()).toMatchObject({
            success: true,
            data: [expect.objectContaining({ id: 'finance', capabilities: [] })],
        });
    });
    it('reads only rollout keys declared by implemented beta portals', async () => {
        await getMyMobilePortals();
        expect(m.rollouts).toHaveBeenCalledTimes(1);
        expect(m.rollouts).toHaveBeenCalledWith(
            [
                'mobile.portal.admin.enabled',
                'mobile.portal.marketing.enabled',
            ],
            m.tenantDb.appSetting,
        );
    });
    it('shows Admin Mobile only to ADMIN with the tenant flag enabled', async () => {
        m.auth.mockResolvedValue({ user: { role: 'ADMIN' } });
        m.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        m.modules.mockResolvedValue(['CORE']);
        m.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': true });
        expect(await getMyMobilePortals()).toMatchObject({
            success: true, data: [expect.objectContaining({ id: 'admin' })],
        });
        m.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': false });
        expect(await getMyMobilePortals()).toMatchObject({ success: true, data: [] });
    });
    it('keeps Super Admin and impersonation sessions out of portal discovery', async () => {
        m.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        m.modules.mockResolvedValue(['CORE']);
        m.rollouts.mockResolvedValue({ 'mobile.portal.admin.enabled': true });
        m.auth.mockResolvedValue({ user: { role: 'ADMIN', isSuperAdmin: true } });
        expect(await getMyMobilePortals()).toMatchObject({ success: true, data: [] });
        m.auth.mockResolvedValue({ user: { role: 'ADMIN', impersonatedBy: 'super-admin' } });
        expect(await getMyMobilePortals()).toMatchObject({ success: true, data: [] });
    });

    it('discovers Marketing only when its tenant flag is enabled', async () => {
        m.auth.mockResolvedValue({ user: { role: 'MARKETING' } });
        m.permissions.mockResolvedValue({
            success: true,
            data: ['/field/marketing'],
        });
        m.modules.mockResolvedValue(['CORE', 'SALES']);
        m.rollouts.mockResolvedValue({
            'mobile.portal.marketing.enabled': true,
        });
        await expect(getMyMobilePortals()).resolves.toMatchObject({
            success: true,
            data: [expect.objectContaining({ id: 'marketing-supervisor' })],
        });

        m.rollouts.mockResolvedValue({
            'mobile.portal.marketing.enabled': false,
        });
        await expect(getMyMobilePortals()).resolves.toMatchObject({
            success: true,
            data: [],
        });
    });
    it('rejects no session before permission lookup', async () => {
        m.auth.mockRejectedValue(new Error('No session')); expect(await getMyMobilePortals()).toMatchObject({ success: false }); expect(m.permissions).not.toHaveBeenCalled();
    });
});
