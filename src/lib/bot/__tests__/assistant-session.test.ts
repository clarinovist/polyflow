import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUser = vi.fn();
const findRoles = vi.fn();
const findPermissions = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: (...args: unknown[]) => findUser(...args) },
        userRole: { findMany: (...args: unknown[]) => findRoles(...args) },
        rolePermission: {
            findMany: (...args: unknown[]) => findPermissions(...args),
        },
    },
}));

import { verifyAssistantSessionUser } from '../assistant-session';

describe('verifyAssistantSessionUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findUser.mockResolvedValue({
            id: 'user-1',
            name: 'User',
            role: 'FINANCE',
            isSuperAdmin: false,
            isActive: true,
        });
        findRoles.mockResolvedValue([{ role: 'FINANCE' }]);
        findPermissions.mockResolvedValue([
            { resource: '/finance' },
            { resource: '/finance' },
        ]);
    });

    it('uses current tenant DB permissions instead of the session snapshot', async () => {
        const result = await verifyAssistantSessionUser({
            id: 'user-1',
            role: 'ADMIN',
            allowedResources: 'ALL',
        });

        expect(result).toMatchObject({
            id: 'user-1',
            role: 'FINANCE',
            roles: ['FINANCE'],
            allowedResources: ['/finance'],
        });
    });

    it.each(['primary', 'assigned'])('applies existing tenant ADMIN policy from the current %s DB role', async source => {
        findUser.mockResolvedValue({ id: 'user-1', role: source === 'primary' ? 'ADMIN' : 'FINANCE', isSuperAdmin: false, isActive: true });
        findRoles.mockResolvedValue(source === 'assigned' ? [{ role: 'ADMIN' }] : []);
        findPermissions.mockResolvedValue([]);
        const result = await verifyAssistantSessionUser({ id: 'user-1', role: 'FINANCE', allowedResources: [] });
        expect(result).toMatchObject({ isSuperAdmin: false, allowedResources: 'ALL' });
        expect(result?.roles).toContain('ADMIN');
        expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
        expect(findRoles).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
    });

    it('does not grant tenant ADMIN access from stale session roles or wildcard arrays', async () => {
        findPermissions.mockResolvedValue([]);
        const result = await verifyAssistantSessionUser({ id: 'user-1', role: 'ADMIN', roles: ['ADMIN'], isSuperAdmin: true, allowedResources: ['ALL'] });
        expect(result).toMatchObject({ roles: ['FINANCE'], isSuperAdmin: false, allowedResources: [] });
    });

    it('fails closed for missing and inactive users', async () => {
        expect(await verifyAssistantSessionUser({})).toBeNull();
        findUser.mockResolvedValueOnce(null);
        expect(await verifyAssistantSessionUser({ id: 'missing' })).toBeNull();
        findUser.mockResolvedValueOnce({
            id: 'inactive',
            name: null,
            role: 'FINANCE',
            isSuperAdmin: false,
            isActive: false,
        });
        expect(await verifyAssistantSessionUser({ id: 'inactive' })).toBeNull();
    });

    it('fails closed when current permission lookup fails', async () => {
        findRoles.mockRejectedValueOnce(new Error('database unavailable'));
        expect(
            await verifyAssistantSessionUser({
                id: 'user-1',
                allowedResources: 'ALL',
            }),
        ).toBeNull();
    });

    it('retains current DB super-admin policy', async () => {
        findUser.mockResolvedValueOnce({
            id: 'admin',
            name: 'Admin',
            role: 'SUPER_ADMIN',
            isSuperAdmin: true,
            isActive: true,
        });

        const result = await verifyAssistantSessionUser({ id: 'admin' });
        expect(result?.allowedResources).toBe('ALL');
        expect(findPermissions).not.toHaveBeenCalled();
    });
});
