import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Kontrak invalidasi cache permission untuk action superadmin.
 *
 * Latar: `permissions-cache` di-key `${tenantId}:${userId}`, tapi tenantId
 * berasal dari AsyncLocalStorage saat user BROWSING. Action di file ini
 * berjalan di luar tenantContext (superadmin, tenant hanya diketahui lewat
 * parameter), jadi invalidasi WAJIB by-userId — menyapu entri user tsb di
 * semua tenant. Test ini mengunci pemanggilannya, bukan mekanika cache-nya
 * (itu sudah diuji di `src/lib/auth/__tests__/permissions-cache.test.ts`).
 */

const mockUser = {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
};
const mockUserRole = { create: vi.fn() };

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        tenant: {
            findUnique: vi.fn().mockResolvedValue({
                id: 'tenant-1',
                name: 'Tenant Satu',
                dbUrl: 'postgres://tenant-1',
            }),
        },
    },
    getTenantDb: () => ({ user: mockUser, userRole: mockUserRole }),
}));

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({
        user: { id: 'superadmin-1', isSuperAdmin: true },
    }),
}));

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

vi.mock('@/lib/auth/permissions-cache', () => ({
    invalidatePermissionsCache: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn().mockResolvedValue('hashed') },
}));

import {
    setTenantUserStatus,
    deleteTenantUser,
} from '../tenant-users';
import { invalidatePermissionsCache } from '@/lib/auth/permissions-cache';

const invalidateMock = vi.mocked(invalidatePermissionsCache);

describe('tenant-users — invalidasi cache permission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUser.findUnique.mockResolvedValue({
            id: 'user-9',
            email: 'user9@example.com',
            isActive: true,
        });
        mockUser.update.mockResolvedValue({ id: 'user-9' });
        mockUser.delete.mockResolvedValue({ id: 'user-9' });
    });

    it('suspend user membuang cache permission user tersebut', async () => {
        await setTenantUserStatus('tenant-1', 'user-9', false);

        expect(mockUser.update).toHaveBeenCalledWith({
            where: { id: 'user-9' },
            data: { isActive: false },
        });
        expect(invalidateMock).toHaveBeenCalledWith({ userId: 'user-9' });
    });

    it('reactivate user juga membuang cache permission', async () => {
        await setTenantUserStatus('tenant-1', 'user-9', true);

        expect(invalidateMock).toHaveBeenCalledWith({ userId: 'user-9' });
    });

    it('invalidasi memakai userId (lintas tenant), bukan key per-tenant', async () => {
        await setTenantUserStatus('tenant-1', 'user-9', false);

        // Kalau kelak diganti jadi by-key `${tenantId}:${userId}`, entri milik
        // tenant lain untuk user yang sama akan lolos dan tetap stale.
        const arg = invalidateMock.mock.calls[0]?.[0];
        expect(arg).toEqual({ userId: 'user-9' });
        expect(JSON.stringify(arg)).not.toContain('tenant-1');
    });

    it('delete user membuang cache permission user tersebut', async () => {
        await deleteTenantUser('tenant-1', 'user-9');

        expect(mockUser.delete).toHaveBeenCalledWith({
            where: { id: 'user-9' },
        });
        expect(invalidateMock).toHaveBeenCalledWith({ userId: 'user-9' });
    });
});
