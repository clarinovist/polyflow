import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    user: vi.fn(),
    features: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: mocks.user },
        rolePermission: {
            findMany: mocks.features,
            findFirst: vi.fn(),
            count: vi.fn(),
            createMany: vi.fn(),
            upsert: vi.fn(),
            updateMany: vi.fn(),
        },
    },
    getTenantIdFromContext: () => 'synthetic-tenant',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/permissions-cache', () => ({
    getCachedPermissions: vi.fn(),
    invalidatePermissionsCache: vi.fn(),
    permissionsCacheKey: vi.fn(),
}));

import { getMyExplicitFeaturePermissions } from '../permissions';

describe('explicit mobile feature permissions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.auth.mockResolvedValue({
            user: { id: 'admin-1', role: 'ADMIN' },
        });
        mocks.user.mockResolvedValue({ isActive: true });
        mocks.features.mockResolvedValue([]);
    });

    it('does not translate ADMIN into every feature capability', async () => {
        await expect(getMyExplicitFeaturePermissions()).resolves.toEqual({
            success: true,
            data: [],
        });
        expect(mocks.features).toHaveBeenCalledWith({
            where: {
                role: { in: ['ADMIN'] },
                resource: { startsWith: 'feature:' },
                canAccess: true,
            },
            select: { resource: true },
        });
    });

    it('returns only explicitly stored, deduplicated feature grants', async () => {
        mocks.features.mockResolvedValue([
            { resource: 'feature:mobile-maintenance-approval' },
            { resource: 'feature:mobile-maintenance-approval' },
            { resource: 'feature:view-prices' },
        ]);
        await expect(getMyExplicitFeaturePermissions()).resolves.toEqual({
            success: true,
            data: [
                'feature:mobile-maintenance-approval',
                'feature:view-prices',
            ],
        });
    });

    it('fails closed for inactive users', async () => {
        mocks.user.mockResolvedValue({ isActive: false });
        await expect(getMyExplicitFeaturePermissions()).resolves.toEqual({
            success: true,
            data: [],
        });
        expect(mocks.features).not.toHaveBeenCalled();
    });
});
