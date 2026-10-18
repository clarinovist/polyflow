import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ main: { user: { findUnique: vi.fn() }, tenant: { findMany: vi.fn(), count: vi.fn() }, ownerLearningRun: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), count: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn() }, tenant: { $transaction: vi.fn(), $executeRaw: vi.fn() }, usage: vi.fn(), commerce: vi.fn(), entitled: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getMainPrisma: () => mocks.main, getTenantDb: () => mocks.tenant, tenantContext: { run: (_db: unknown, fn: () => unknown) => fn() }, tenantIdContext: { run: (_id: string, fn: () => unknown) => fn() } }));
vi.mock('@/lib/modules/tenant-entitlements', () => ({ hasTenantModuleDirect: mocks.entitled }));
vi.mock('../owner-usage-source', () => ({ collectOwnerUsage: mocks.usage }));
vi.mock('../owner-commerce-source', () => ({ collectOwnerCommerce: mocks.commerce }));
import { ownerPolicyKey, runOwnerLearning } from '../owner-learning.service';
import type { OwnerLearningPolicy } from '@/lib/learning/owner-contracts';
const now = new Date('2026-10-20T08:00:00+07:00');
beforeEach(() => {
    vi.resetAllMocks(); vi.unstubAllEnvs();
    for (const [key, value] of Object.entries({ OWNER_LEARNING_ENABLED: 'true', OWNER_LEARNING_USER_ID: 'owner', OWNER_LEARNING_TENANT_IDS: 'a,b', OWNER_LEARNING_POLICY_VERSION: 'test-v1', OWNER_LEARNING_ACTIVE_FROM: '2026-10-18T00:00:00Z', OWNER_LEARNING_SCOPE: 'private-owner-usage-commerce' })) vi.stubEnv(key, value);
    mocks.main.user.findUnique.mockResolvedValue({ isActive: true, isSuperAdmin: true });
    mocks.main.tenant.findMany.mockResolvedValue([{ id: 'a', dbUrl: 'synthetic-a' }, { id: 'b', dbUrl: 'synthetic-b' }]);
    mocks.main.tenant.count.mockResolvedValue(1);
    mocks.main.ownerLearningRun.findMany.mockResolvedValue([]);
    mocks.main.ownerLearningRun.count.mockResolvedValue(0);
    mocks.main.ownerLearningRun.findUniqueOrThrow.mockResolvedValue({ id: 'run', state: 'PENDING' });
    mocks.main.ownerLearningRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.main.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.main));
    mocks.tenant.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tenant));
    mocks.usage.mockResolvedValue({ rows: [], truncated: false });
    mocks.commerce.mockResolvedValue({ customers: [], prices: [], regions: [], movements: [], truncated: { customers: false, prices: false, regions: false, movements: false } });
    mocks.entitled.mockResolvedValue(true);
});
describe('owner learning job', () => {
    it('does no source reads when disabled, invalid, unauthorized, or before first full day', async () => {
        vi.stubEnv('OWNER_LEARNING_ENABLED', 'false'); expect((await runOwnerLearning(now)).state).toBe('DISABLED');
        vi.stubEnv('OWNER_LEARNING_ENABLED', 'true'); vi.stubEnv('OWNER_LEARNING_SCOPE', 'wrong'); expect((await runOwnerLearning(now)).state).toBe('POLICY_REQUIRED');
        vi.stubEnv('OWNER_LEARNING_SCOPE', 'private-owner-usage-commerce'); mocks.main.user.findUnique.mockResolvedValueOnce(null); expect((await runOwnerLearning(now)).state).toBe('OWNER_UNAVAILABLE');
        vi.stubEnv('OWNER_LEARNING_ACTIVE_FROM', now.toISOString()); expect((await runOwnerLearning(now)).state).toBe('AWAITING_COMPLETE_DAY');
        expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.commerce).not.toHaveBeenCalled();
    });
    it('stores only validated per-tenant snapshots and enforces read-only source transactions', async () => {
        expect(await runOwnerLearning(now)).toEqual({ state: 'COMPLETE', processed: 2 });
        expect(mocks.usage.mock.calls.map(call => call[1])).toEqual(['a', 'b']);
        expect(mocks.main.$executeRaw).toHaveBeenCalled(); expect(mocks.tenant.$executeRaw).toHaveBeenCalled();
        expect(mocks.main.tenant.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] }, status: 'ACTIVE' });
        const summaries = mocks.main.ownerLearningRun.updateMany.mock.calls.filter(call => call[0].data.summary);
        expect(summaries).toHaveLength(2); expect(summaries[0][0].where.leaseToken).toBeTruthy();
    });
    it('handles busy/complete claims and keeps one tenant failure independent', async () => {
        mocks.main.ownerLearningRun.count.mockResolvedValueOnce(1);
        expect((await runOwnerLearning(now)).processed).toBe(1);
        mocks.main.ownerLearningRun.updateMany.mockResolvedValueOnce({ count: 0 });
        expect((await runOwnerLearning(now)).state).toBe('PARTIAL_FAILED');
        mocks.usage.mockRejectedValueOnce(new Error('private tenant query'));
        expect(await runOwnerLearning(now)).toEqual({ state: 'PARTIAL_FAILED', processed: 1 });
        expect(JSON.stringify(mocks.main.ownerLearningRun.updateMany.mock.calls)).not.toContain('private tenant query');
    });
    it('skips commerce without Sales entitlement and refuses results after revocation', async () => {
        mocks.entitled.mockResolvedValue(false); await runOwnerLearning(now); expect(mocks.commerce).not.toHaveBeenCalled();
        mocks.main.tenant.count.mockResolvedValue(0); expect((await runOwnerLearning(now)).state).toBe('PARTIAL_FAILED');
    });
    it('bounds work and deletes only still-expired records', async () => {
        vi.stubEnv('OWNER_LEARNING_TENANT_IDS', 'a,b,c,d');
        mocks.main.tenant.findMany.mockResolvedValue(['a', 'b', 'c', 'd'].map(id => ({ id, dbUrl: id })));
        mocks.main.ownerLearningRun.findMany.mockResolvedValue([{ id: 'expired' }]);
        expect(await runOwnerLearning(now)).toEqual({ state: 'PENDING', processed: 3 });
        expect(mocks.main.ownerLearningRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['expired'] }, expiresAt: { lte: now } } });
    });
    it('scope keys change with reader, tenants and activation, never array order', () => {
        const policy: OwnerLearningPolicy = { enabled: true, ownerId: 'o', tenantIds: ['a', 'b'], activeFrom: now, version: 'v1' };
        expect(ownerPolicyKey(policy)).toBe(ownerPolicyKey({ ...policy, tenantIds: ['b', 'a'] }));
        expect(ownerPolicyKey(policy)).not.toBe(ownerPolicyKey({ ...policy, ownerId: 'other' }));
        expect(ownerPolicyKey(policy)).not.toBe(ownerPolicyKey({ ...policy, tenantIds: ['a'] }));
    });
});
