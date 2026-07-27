import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    requireAuth,
    requireRole,
    requirePlanningRole,
    requireProductionLeaderRole,
    requireWarehouseStockRole,
    requireMaterialPathRole,
    requireWarehouseResourcePermission,
} from '../auth-checks';
import { Role } from '@prisma/client';
import { AuthorizationError, BusinessRuleError } from '@/lib/errors/errors';

// Mock dependencies
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        userRole: {
            findMany: vi.fn(),
        },
        rolePermission: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn(() => {
        throw new Error('REDIRECT');
    }),
}));

describe('requireAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should redirect to login when session is null', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        vi.mocked(auth).mockResolvedValue(null as any);

        // Act & Assert
        await expect(requireAuth()).rejects.toThrow('REDIRECT');
    });

    it('should redirect to login when session has no user', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        vi.mocked(auth).mockResolvedValue({ user: null } as any);

        // Act & Assert
        await expect(requireAuth()).rejects.toThrow('REDIRECT');
    });

    it('should redirect to login when user has no id', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        vi.mocked(auth).mockResolvedValue({ user: { id: null } } as any);

        // Act & Assert
        await expect(requireAuth()).rejects.toThrow('REDIRECT');
    });

    it('should redirect to logout when user not found in DB', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');

        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        // Act & Assert
        await expect(requireAuth()).rejects.toThrow('REDIRECT');
    });

    it('should return session when user is valid', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-123', role: 'ADMIN' } };

        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'ADMIN' } as any);

        // Act
        const result = await requireAuth();

        // Assert
        expect(result).toEqual(mockSession);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 'user-123' },
            select: { id: true },
        });
    });
});

describe('requireRole', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should throw error when user has no role', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');

        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: null } as any);

        // Act & Assert
        await expect(requireRole(Role.ADMIN)).rejects.toThrow('Unauthorized: User has no role');
    });

    it('should allow ADMIN to access any role', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-123', role: 'ADMIN' } };

        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'ADMIN' } as any);

        // Act
        const result = await requireRole(Role.WAREHOUSE);

        // Assert
        expect(result).toEqual(mockSession);
    });

    it('should allow user with matching single role', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-123', role: 'WAREHOUSE' } };

        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'WAREHOUSE' } as any);

        // Act
        const result = await requireRole(Role.WAREHOUSE);

        // Assert
        expect(result).toEqual(mockSession);
    });

    it('should allow user with matching role from array', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-123', role: 'FINANCE' } };

        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'FINANCE' } as any);

        // Act
        const result = await requireRole([Role.ADMIN, Role.FINANCE]);

        // Assert
        expect(result).toEqual(mockSession);
    });

    it('should throw error when user role does not match', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');

        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123', role: 'WAREHOUSE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'WAREHOUSE' } as any);

        // Act & Assert
        await expect(requireRole(Role.FINANCE)).rejects.toThrow(
            'Unauthorized: Insufficient permissions. Required: FINANCE'
        );
    });

    it('should throw error when user role not in array', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123', role: 'OPERATOR' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'OPERATOR' } as any);

        // Act & Assert
        await expect(requireRole([Role.ADMIN, Role.FINANCE])).rejects.toThrow(
            'Unauthorized: Insufficient permissions. Required: ADMIN or FINANCE'
        );
    });
});

describe('requireWarehouseStockRole', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows WAREHOUSE', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'WAREHOUSE' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireWarehouseStockRole()).resolves.toEqual(mockSession);
    });

    it('allows ADMIN', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'ADMIN' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireWarehouseStockRole()).resolves.toEqual(mockSession);
    });

    it('rejects PRODUCTION', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'PRODUCTION' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireWarehouseStockRole()).rejects.toThrow(/gudang atau admin/i);
    });
});

describe('requireMaterialPathRole', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('floor_wip allows PRODUCTION', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'PRODUCTION' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).resolves.toEqual(mockSession);
    });

    it('warehouse_rm rejects PRODUCTION', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'PRODUCTION' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('warehouse_rm')).rejects.toThrow(/gudang atau admin/i);
    });

    it('warehouse_rm rejects PLANNING', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'PLANNING' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('warehouse_rm')).rejects.toThrow(/gudang atau admin/i);
    });

    it('warehouse_rm rejects FINANCE', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'FINANCE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('warehouse_rm')).rejects.toThrow(/gudang atau admin/i);
    });

    it('floor_wip allows PLANNING', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'PLANNING' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).resolves.toEqual(mockSession);
    });

    it('floor_wip allows WAREHOUSE', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'WAREHOUSE' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).resolves.toEqual(mockSession);
    });

    it('floor_wip allows ADMIN', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'ADMIN' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).resolves.toEqual(mockSession);
    });

    it('floor_wip rejects FINANCE', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'FINANCE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).rejects.toThrow(/WIP/i);
    });

    it('floor_wip rejects SALES', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'SALES' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireMaterialPathRole('floor_wip')).rejects.toThrow(/WIP/i);
    });
});

describe('requirePlanningRole', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows PLANNING role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'PLANNING' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requirePlanningRole()).resolves.toEqual(mockSession);
    });

    it('allows ADMIN role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'ADMIN' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requirePlanningRole()).resolves.toEqual(mockSession);
    });

    it('rejects WAREHOUSE role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'WAREHOUSE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requirePlanningRole()).rejects.toThrow(BusinessRuleError);
    });

    it('rejects PRODUCTION role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'PRODUCTION' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requirePlanningRole()).rejects.toThrow(/Only Planning/i);
    });

    it('rejects FINANCE role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'FINANCE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requirePlanningRole()).rejects.toThrow(BusinessRuleError);
    });
});

describe('requireProductionLeaderRole', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows ADMIN role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'ADMIN' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).resolves.toEqual(mockSession);
    });

    it('allows PRODUCTION role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'PRODUCTION' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).resolves.toEqual(mockSession);
    });

    it('allows PLANNING role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'PLANNING' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).resolves.toEqual(mockSession);
    });

    it('rejects WAREHOUSE role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'WAREHOUSE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).rejects.toThrow(BusinessRuleError);
    });

    it('rejects FINANCE role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'FINANCE' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).rejects.toThrow(/production leaders/i);
    });

    it('rejects SALES role', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'SALES' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);

        await expect(requireProductionLeaderRole()).rejects.toThrow(BusinessRuleError);
    });
});

describe('requireWarehouseResourcePermission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows ADMIN without querying roles', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'admin-1', role: 'ADMIN' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'admin-1' } as any);

        const result = await requireWarehouseResourcePermission('/warehouse/incoming');
        expect(result).toEqual(mockSession);
        expect(prisma.userRole.findMany).not.toHaveBeenCalled();
        expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('allows access for DB-level ADMIN (role changed after login)', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'STAFF' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1',
            role: 'ADMIN',
            isActive: true,
        } as any);

        const result = await requireWarehouseResourcePermission('/warehouse/incoming');
        expect(result).toEqual(mockSession);
    });

    it('denies when user has no assigned roles', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

        await expect(
            requireWarehouseResourcePermission('/warehouse/incoming'),
        ).rejects.toThrow(AuthorizationError);
    });

    it('denies when user is inactive', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: false,
        } as any);

        await expect(
            requireWarehouseResourcePermission('/warehouse/incoming'),
        ).rejects.toThrow(AuthorizationError);
    });

    it('redirects when user not found in DB (stale session)', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        await expect(
            requireWarehouseResourcePermission('/warehouse/incoming'),
        ).rejects.toThrow('REDIRECT');
    });

    it('denies when rolePermission returns empty', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([]);

        await expect(
            requireWarehouseResourcePermission('/warehouse/incoming'),
        ).rejects.toThrow(AuthorizationError);
    });

    it('denies when resourcePath not in allowed list', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: '/warehouse/inventory' },
        ] as any);

        await expect(
            requireWarehouseResourcePermission('/warehouse/incoming'),
        ).rejects.toThrow(AuthorizationError);
    });

    it('allows exact resource match', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'STAFF' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: '/warehouse/incoming' },
        ] as any);

        const result = await requireWarehouseResourcePermission('/warehouse/incoming');
        expect(result).toEqual(mockSession);
    });

    it('allows hierarchical path (parent covers child)', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'STAFF' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: '/warehouse' },
        ] as any);

        const result = await requireWarehouseResourcePermission('/warehouse/incoming');
        expect(result).toEqual(mockSession);
    });

    it('rejects sibling path (no hierarchical match)', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'STAFF' } } as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: '/warehouse' },
        ] as any);

        await expect(
            requireWarehouseResourcePermission('/sales/orders'),
        ).rejects.toThrow(AuthorizationError);
    });

    it('allows when resource is ALL', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'STAFF' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([{ role: 'STAFF' }] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: 'ALL' },
        ] as any);

        const result = await requireWarehouseResourcePermission('/anything/goes');
        expect(result).toEqual(mockSession);
    });

    it('deduplicates resources from multiple roles', async () => {
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-1', role: 'STAFF' } };
        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'user-1', role: 'STAFF', isActive: true,
        } as any);
        vi.mocked(prisma.userRole.findMany).mockResolvedValue([
            { role: 'WAREHOUSE' },
            { role: 'PRODUCTION' },
        ] as any);
        vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
            { resource: '/warehouse' },
            { resource: '/warehouse' },
            { resource: '/production' },
        ] as any);

        const result = await requireWarehouseResourcePermission('/warehouse/incoming');
        expect(result).toEqual(mockSession);
    });
});
