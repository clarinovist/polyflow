import { describe, it, expect, vi } from 'vitest';
import { resolveUsersForResources } from '../finding-routing';

function makeTenantDb(overrides: Record<string, unknown> = {}) {
  return {
    rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe('resolveUsersForResources', () => {
  it('returns empty immediately when no resources are required', async () => {
    const tenantDb = makeTenantDb();
    const result = await resolveUsersForResources(tenantDb as never, []);
    expect(result).toEqual([]);
    expect(tenantDb.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('resolves users whose primary role grants the resource', async () => {
    const tenantDb = makeTenantDb({
      rolePermission: {
        findMany: vi.fn().mockResolvedValue([{ role: 'WAREHOUSE' }]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]) // role match
          .mockResolvedValueOnce([]), // superadmins
      },
    });

    const result = await resolveUsersForResources(tenantDb as never, [
      '/warehouse/inventory',
    ]);
    expect(result.sort()).toEqual(['user-1', 'user-2']);
  });

  it('includes superadmins regardless of role permission match', async () => {
    const tenantDb = makeTenantDb({
      rolePermission: {
        findMany: vi.fn().mockResolvedValue([{ role: 'WAREHOUSE' }]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'user-1' }])
          .mockResolvedValueOnce([{ id: 'admin-1' }]),
      },
    });

    const result = await resolveUsersForResources(tenantDb as never, [
      '/warehouse/inventory',
    ]);
    expect(result.sort()).toEqual(['admin-1', 'user-1']);
  });

  it('returns only superadmins when no role grants the resource', async () => {
    const tenantDb = makeTenantDb({
      rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'admin-1' }]), // superadmin query
      },
    });

    const result = await resolveUsersForResources(tenantDb as never, [
      '/warehouse/inventory',
    ]);
    expect(result).toEqual(['admin-1']);
    // Must not have queried users-by-role when there were no roles to match.
    expect(tenantDb.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a user who is both role-matched and superadmin', async () => {
    const tenantDb = makeTenantDb({
      rolePermission: {
        findMany: vi.fn().mockResolvedValue([{ role: 'ADMIN' }]),
      },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'admin-1' }])
          .mockResolvedValueOnce([{ id: 'admin-1' }]),
      },
    });

    const result = await resolveUsersForResources(tenantDb as never, [
      '/production/orders',
    ]);
    expect(result).toEqual(['admin-1']);
  });
});
