import { describe, expect, it } from 'vitest';
import { ownerLearningPolicy, ownerSnapshotSchema, ownerSuggestions, ownerWindow, type OwnerSnapshot } from '../owner-contracts';
export const emptyOwnerSnapshot = (): OwnerSnapshot => ({ schemaVersion: 1, usage: [], customers: [], prices: [], regions: [], movements: [], truncated: { usage: false, customers: false, prices: false, regions: false, movements: false }, commerceState: 'OBSERVED', suggestions: [] });
const env = { OWNER_LEARNING_ENABLED: 'true', OWNER_LEARNING_USER_ID: 'owner', OWNER_LEARNING_TENANT_IDS: 'a,b', OWNER_LEARNING_POLICY_VERSION: 'test-v1', OWNER_LEARNING_ACTIVE_FROM: '2026-10-18T00:00:00Z', OWNER_LEARNING_SCOPE: 'private-owner-usage-commerce' };
describe('owner learning contract', () => {
    it('fails closed for missing policy, duplicate tenants and wrong scope', () => {
        expect(ownerLearningPolicy({})).toEqual({ enabled: false, reason: 'DISABLED' });
        expect(ownerLearningPolicy(env).enabled).toBe(true);
        expect(ownerLearningPolicy({ ...env, OWNER_LEARNING_TENANT_IDS: 'a,a' }).enabled).toBe(false);
        expect(ownerLearningPolicy({ ...env, OWNER_LEARNING_SCOPE: 'all' }).enabled).toBe(false);
        expect(ownerLearningPolicy({ ...env, OWNER_LEARNING_USER_ID: '' }).enabled).toBe(false);
    });
    it('bounds windows to prospective start and at most 30 days', () => {
        const end = new Date('2026-12-01');
        expect(ownerWindow(new Date('2026-01-01'), end).start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
        expect(ownerWindow(new Date('2026-11-20'), end).start.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    });
    it('refuses arbitrary sensitive fields and derives only bounded investigation codes', () => {
        expect(ownerSnapshotSchema.safeParse({ ...emptyOwnerSnapshot(), transcript: 'private' }).success).toBe(false);
        const snapshot = emptyOwnerSnapshot();
        snapshot.usage = [{ userId: 'u', module: 'sales', views: 20, activeDays: 3, completed: 10, failed: 10, retries: 10 }];
        snapshot.regions = [{ province: null, city: null, orderCount: 1 }];
        snapshot.truncated.prices = true;
        expect(ownerSuggestions(snapshot)).toEqual(['CHECK_MOBILE_FRICTION', 'REVIEW_WORKFLOW_GUIDANCE', 'IMPROVE_REGION_DATA', 'REVIEW_SCOPE_VOLUME']);
        expect(ownerSuggestions(emptyOwnerSnapshot())).toEqual([]);
        expect(ownerSnapshotSchema.safeParse({ ...snapshot, usage: [{ ...snapshot.usage[0], email: 'private' }] }).success).toBe(false);
    });
});
