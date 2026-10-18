import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), tenantFind: vi.fn(), tenantFirst: vi.fn(), tenantCount: vi.fn(), runs: vi.fn(), audit: vi.fn(), tenantDb: vi.fn() }));
vi.mock('@/lib/learning/owner-authorization', () => ({ requirePrivateLearningOwner: mocks.guard }));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => ({ tenant: { findMany: mocks.tenantFind, findFirst: mocks.tenantFirst, count: mocks.tenantCount }, ownerLearningRun: { findMany: mocks.runs } }), getTenantDb: mocks.tenantDb }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
vi.mock('@/services/admin/owner-learning.service', () => ({ ownerPolicyKey: () => 'scope-key' }));
import { fetchOwnerLearning } from '../owner-learning';
const snapshot = { schemaVersion: 1, usage: [], customers: [], prices: [], regions: [], movements: [], truncated: { usage: false, customers: false, prices: false, regions: false, movements: false }, commerceState: 'OBSERVED', suggestions: [] };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.guard.mockResolvedValue({ enabled: true, ownerId: 'owner', tenantIds: ['a'], activeFrom: new Date('2026-01-01'), version: 'v1' });
    mocks.tenantFind.mockResolvedValue([{ id: 'a', name: 'Synthetic company' }]);
    mocks.tenantFirst.mockResolvedValue({ dbUrl: 'private-connection' });
    mocks.tenantCount.mockResolvedValue(1);
    mocks.runs.mockResolvedValue([]);
});
describe('owner learning reads', () => {
    it('denies direct tenant enumeration and other owners before querying snapshots', async () => {
        await expect(fetchOwnerLearning('b')).rejects.toThrow(); expect(mocks.runs).not.toHaveBeenCalled();
        mocks.guard.mockRejectedValueOnce(new Error('denied')); await expect(fetchOwnerLearning('a')).rejects.toThrow();
    });
    it('uses scope/reader/tenant and expiration filters and does not return credentials', async () => {
        const result = await fetchOwnerLearning('a');
        expect(mocks.runs.mock.calls[0][0].where).toMatchObject({ tenantId: 'a', ownerId: 'owner', policyVersion: 'scope-key', expiresAt: expect.anything() });
        expect(result.snapshot).toBeNull(); expect(result.health).toBe('STALE'); expect(JSON.stringify(result)).not.toContain('private-connection');
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', action: 'OWNER_LEARNING_VIEW' }));
    });
    it('fails closed on audit errors and invalid stored payloads', async () => {
        mocks.audit.mockRejectedValueOnce(new Error('audit failure')); await expect(fetchOwnerLearning()).rejects.toThrow('audit failure');
        mocks.runs.mockResolvedValueOnce([{ state: 'COMPLETE', summary: { ...snapshot, raw: 'forbidden' } }]);
        await expect(fetchOwnerLearning()).rejects.toThrow();
    });
    it('keeps IDs and a visible missing-label state when tenant master is unavailable', async () => {
        mocks.runs.mockResolvedValue([{ id: 'r', state: 'COMPLETE', day: new Date(), summary: snapshot, windowStart: new Date(), windowEnd: new Date(), completedAt: new Date() }]);
        mocks.tenantDb.mockReturnValue({ $transaction: vi.fn().mockRejectedValue(new Error('offline')) });
        const result = await fetchOwnerLearning(); expect(result.labelsAvailable).toBe(false); expect(result.runs[0]).not.toHaveProperty('summary');
    });
});
