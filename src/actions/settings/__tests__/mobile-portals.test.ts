import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyMobilePortals } from '../mobile-portals';
const m = vi.hoisted(() => ({ auth: vi.fn(), permissions: vi.fn(), modules: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: m.auth }));
vi.mock('@/actions/admin/permissions', () => ({ getMyPermissions: m.permissions }));
vi.mock('@/lib/modules/tenant-entitlements', () => ({ getActiveModuleKeys: m.modules }));
beforeEach(() => {
    vi.resetAllMocks(); m.auth.mockResolvedValue({ user: { role: 'FINANCE' } });
    m.permissions.mockResolvedValue({ success: true, data: ['/finance'] }); m.modules.mockResolvedValue(['CORE', 'FINANCE']);
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
    it('rejects no session before permission lookup', async () => {
        m.auth.mockRejectedValue(new Error('No session')); expect(await getMyMobilePortals()).toMatchObject({ success: false }); expect(m.permissions).not.toHaveBeenCalled();
    });
});
