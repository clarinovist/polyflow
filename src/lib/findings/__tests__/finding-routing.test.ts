import { describe, it, expect, vi } from 'vitest';
import { resolveUsersForResources } from '../finding-routing';

type Permission = { role: string; resource: string };

function makeTenantDb(
  permissions: Permission[],
  users: Array<{ id: string }> = [],
) {
  return {
    rolePermission: { findMany: vi.fn().mockResolvedValue(permissions) },
    user: { findMany: vi.fn().mockResolvedValue(users) },
  };
}

function rolesQueried(tenantDb: ReturnType<typeof makeTenantDb>): string[] {
  const where = tenantDb.user.findMany.mock.calls[0][0].where;
  return [...where.OR[1].role.in].sort();
}

describe('resolveUsersForResources', () => {
  it('returns empty immediately when no resources are required', async () => {
    const tenantDb = makeTenantDb([]);
    const result = await resolveUsersForResources(tenantDb as never, []);
    expect(result).toEqual([]);
    expect(tenantDb.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('always routes to ADMIN even though ADMIN has no RolePermission rows', async () => {
    const tenantDb = makeTenantDb([], [{ id: 'admin-1' }]);

    const result = await resolveUsersForResources(tenantDb as never, [
      '/sales/invoices',
    ]);

    expect(result).toEqual(['admin-1']);
    expect(rolesQueried(tenantDb)).toEqual(['ADMIN']);
  });

  it('includes roles whose resource exactly matches', async () => {
    const tenantDb = makeTenantDb([
      { role: 'WAREHOUSE', resource: '/warehouse/inventory' },
      { role: 'SALES', resource: '/sales/orders' },
    ]);

    await resolveUsersForResources(tenantDb as never, ['/warehouse/inventory']);

    expect(rolesQueried(tenantDb)).toEqual(['ADMIN', 'WAREHOUSE']);
  });

  it('includes roles whose parent resource covers the required page', async () => {
    const tenantDb = makeTenantDb([
      { role: 'FINANCE', resource: '/finance' },
      { role: 'HRD', resource: '/finance/coa' },
    ]);

    await resolveUsersForResources(tenantDb as never, ['/finance/invoices']);

    // /finance covers /finance/invoices; the sibling /finance/coa does not.
    expect(rolesQueried(tenantDb)).toEqual(['ADMIN', 'FINANCE']);
  });

  it('includes a role holding the ALL resource', async () => {
    const tenantDb = makeTenantDb([{ role: 'PLANNING', resource: 'ALL' }]);

    await resolveUsersForResources(tenantDb as never, ['/production/orders']);

    expect(rolesQueried(tenantDb)).toEqual(['ADMIN', 'PLANNING']);
  });

  it('matches any of several required resources', async () => {
    const tenantDb = makeTenantDb([
      { role: 'SALES', resource: '/sales/invoices' },
      { role: 'FINANCE', resource: '/finance/invoices' },
    ]);

    await resolveUsersForResources(tenantDb as never, [
      '/sales/invoices',
      '/finance/invoices',
    ]);

    expect(rolesQueried(tenantDb)).toEqual(['ADMIN', 'FINANCE', 'SALES']);
  });

  it('queries only active users and covers superadmins plus secondary roles', async () => {
    const tenantDb = makeTenantDb([]);

    await resolveUsersForResources(tenantDb as never, ['/sales/orders']);

    const where = tenantDb.user.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.OR[0]).toEqual({ isSuperAdmin: true });
    expect(where.OR[2]).toEqual({ roles: { some: { role: { in: ['ADMIN'] } } } });
  });

  it('deduplicates user ids', async () => {
    const tenantDb = makeTenantDb([], [{ id: 'u-1' }, { id: 'u-1' }]);

    const result = await resolveUsersForResources(tenantDb as never, [
      '/sales/orders',
    ]);

    expect(result).toEqual(['u-1']);
  });
});
