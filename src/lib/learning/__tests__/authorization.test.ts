import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({ user: { findUnique: mocks.user } }) }));
import { requireLearningOwner } from '../authorization';
beforeEach(() => vi.resetAllMocks());
describe('learning access', () => {
    it('rejects missing session and tenant admin even with broad resources', async () => {
        mocks.auth.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: 'tenant-admin', role: 'ADMIN', allowedResources: ['ALL'] } });
        await expect(requireLearningOwner()).rejects.toThrow();
        await expect(requireLearningOwner()).rejects.toThrow();
        expect(mocks.user).not.toHaveBeenCalled();
    });
    it('requires current active main-db superadmin, not just a stale JWT', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'owner', isSuperAdmin: true } });
        mocks.user.mockResolvedValueOnce({ isSuperAdmin: true, isActive: false });
        await expect(requireLearningOwner()).rejects.toThrow();
        mocks.user.mockResolvedValueOnce({ isSuperAdmin: true, isActive: true });
        expect(await requireLearningOwner()).toBe('owner');
    });
});
