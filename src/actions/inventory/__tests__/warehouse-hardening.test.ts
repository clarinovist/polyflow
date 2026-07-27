import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import { AuthorizationError } from '@/lib/errors/errors';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

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
        deliveryOrder: {
            findUnique: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
        },
        goodsReceipt: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        location: {
            findUnique: vi.fn(),
        },
    },
}));

describe('Warehouse Hardening Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Auth Fail-Closed (requireWarehouseResourcePermission)', () => {
        it('denies access when user has no assigned roles', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'user-1', role: 'STAFF', email: 'staff@test.com' },
            } as never);

            vi.mocked(prisma.user.findUnique).mockResolvedValue({
                id: 'user-1',
                role: 'STAFF',
                isActive: true,
            } as never);

            vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

            await expect(
                requireWarehouseResourcePermission('/warehouse/incoming'),
            ).rejects.toThrow(AuthorizationError);
        });

        it('denies access when resourcePath is not in allowedResources list', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'user-1', role: 'STAFF', email: 'staff@test.com' },
            } as never);

            vi.mocked(prisma.user.findUnique).mockResolvedValue({
                id: 'user-1',
                role: 'STAFF',
                isActive: true,
            } as never);

            vi.mocked(prisma.userRole.findMany).mockResolvedValue([
                { role: 'STAFF' },
            ] as never);

            vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
                { resource: '/warehouse/inventory' },
            ] as never);

            await expect(
                requireWarehouseResourcePermission('/warehouse/incoming'),
            ).rejects.toThrow(AuthorizationError);
        });

        it('allows access when resourcePath is in allowedResources list', async () => {
            const mockSession = {
                user: { id: 'user-1', role: 'STAFF', email: 'staff@test.com' },
            };
            vi.mocked(auth).mockResolvedValue(mockSession as never);

            vi.mocked(prisma.user.findUnique).mockResolvedValue({
                id: 'user-1',
                role: 'STAFF',
                isActive: true,
            } as never);

            vi.mocked(prisma.userRole.findMany).mockResolvedValue([
                { role: 'STAFF' },
            ] as never);

            vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
                { resource: '/warehouse/incoming' },
            ] as never);

            const result = await requireWarehouseResourcePermission('/warehouse/incoming');
            expect(result).toEqual(mockSession);
        });

        it('always allows access for ADMIN role', async () => {
            const mockSession = {
                user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' },
            };
            vi.mocked(auth).mockResolvedValue(mockSession as never);

            const result = await requireWarehouseResourcePermission('/warehouse/incoming');
            expect(result).toEqual(mockSession);
        });
    });
});
