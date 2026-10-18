import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({ user: { findUnique: mocks.user } }) }));
import { requirePrivateLearningOwner } from '../owner-authorization';
beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    for (const [key, value] of Object.entries({ OWNER_LEARNING_ENABLED: 'true', OWNER_LEARNING_USER_ID: 'owner', OWNER_LEARNING_TENANT_IDS: 'tenant-a', OWNER_LEARNING_POLICY_VERSION: 'test-v1', OWNER_LEARNING_ACTIVE_FROM: '2026-10-18T00:00:00Z', OWNER_LEARNING_SCOPE: 'private-owner-usage-commerce' })) vi.stubEnv(key, value);
});
describe('private-owner boundary', () => {
    it('denies other superadmins and tenant admin', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'other-admin', isSuperAdmin: true } });
        await expect(requirePrivateLearningOwner()).rejects.toThrow(); expect(mocks.user).not.toHaveBeenCalled();
        mocks.auth.mockResolvedValue({ user: { id: 'owner', isSuperAdmin: false } });
        await expect(requirePrivateLearningOwner()).rejects.toThrow();
    });
    it.each(['tenantId', 'tenantSubdomain', 'globalAccountId', 'membershipId', 'impersonatedBy', 'impersonationExpiresAt'])(
        'rejects colliding owner ID with foreign session provenance %s', async claim => {
            mocks.auth.mockResolvedValue({ user: { id: 'owner', isSuperAdmin: true, [claim]: claim === 'impersonationExpiresAt' ? Date.now() : 'foreign' } });
            await expect(requirePrivateLearningOwner()).rejects.toThrow();
            expect(mocks.user).not.toHaveBeenCalled();
        },
    );
    it('requires configured and currently active owner', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'owner', isSuperAdmin: true } });
        mocks.user.mockResolvedValue({ isActive: false, isSuperAdmin: true });
        await expect(requirePrivateLearningOwner()).rejects.toThrow();
        mocks.user.mockResolvedValue({ isActive: true, isSuperAdmin: true });
        expect((await requirePrivateLearningOwner()).ownerId).toBe('owner');
        vi.stubEnv('OWNER_LEARNING_ENABLED', 'false'); await expect(requirePrivateLearningOwner()).rejects.toThrow();
    });
});
