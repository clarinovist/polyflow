import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique, mockFindManyRoles, mockFindManyPerms } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindManyRoles: vi.fn(),
  mockFindManyPerms: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
    userRole: { findMany: mockFindManyRoles },
    rolePermission: { findMany: mockFindManyPerms },
  },
}));

import { resolveAllowedResources } from '../permissions';

describe('resolveAllowedResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ALL for superadmin', async () => {
    mockFindUnique.mockResolvedValue({
      role: 'ADMIN',
      isSuperAdmin: true,
    });

    const result = await resolveAllowedResources('user-1');
    expect(result).toBe('ALL');
  });

  it('returns resource list for normal user', async () => {
    mockFindUnique.mockResolvedValue({
      role: 'STAFF',
      isSuperAdmin: false,
    });
    mockFindManyRoles.mockResolvedValue([{ role: 'SALES' }]);
    mockFindManyPerms.mockResolvedValue([
      { resource: '/sales/orders' },
      { resource: '/warehouse/inventory' },
    ]);

    const result = await resolveAllowedResources('user-1');
    expect(result).toEqual(['/sales/orders', '/warehouse/inventory']);
  });

  it('returns empty array when user not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await resolveAllowedResources('nonexistent');
    expect(result).toEqual([]);
  });

  it('returns empty array on DB error', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB down'));

    const result = await resolveAllowedResources('user-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when no roles/permissions', async () => {
    mockFindUnique.mockResolvedValue({
      role: 'STAFF',
      isSuperAdmin: false,
    });
    mockFindManyRoles.mockResolvedValue([]);
    mockFindManyPerms.mockResolvedValue([]);

    const result = await resolveAllowedResources('user-1');
    expect(result).toEqual([]);
  });
});
