import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireRole } from '../auth-checks';
import { Role } from '@prisma/client';

// Mock dependencies
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
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
        vi.mocked(auth).mockResolvedValue(null);

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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'ADMIN' });

        // Act
        const result = await requireAuth();

        // Assert
        expect(result).toEqual(mockSession);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 'user-123' },
            select: { id: true, role: true },
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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: null });

        // Act & Assert
        await expect(requireRole(Role.ADMIN)).rejects.toThrow('Unauthorized: User has no role');
    });

    it('should allow ADMIN to access any role', async () => {
        // Arrange
        const { auth } = await import('@/auth');
        const { prisma } = await import('@/lib/core/prisma');
        const mockSession = { user: { id: 'user-123', role: 'ADMIN' } };

        vi.mocked(auth).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'ADMIN' });

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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'WAREHOUSE' });

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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'FINANCE' });

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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'WAREHOUSE' });

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
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123', role: 'OPERATOR' });

        // Act & Assert
        await expect(requireRole([Role.ADMIN, Role.FINANCE])).rejects.toThrow(
            'Unauthorized: Insufficient permissions. Required: ADMIN or FINANCE'
        );
    });
});
