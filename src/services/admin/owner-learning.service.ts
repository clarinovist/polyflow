import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getMainPrisma, getTenantDb, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import { hasTenantModuleDirect } from '@/lib/modules/tenant-entitlements';
import { DAY_MS, dayKey, firstCompleteDay, jakartaDayStart } from '@/lib/learning/contracts';
import { OWNER_LEARNING_VERSION, OWNER_RETENTION_DAYS, ownerLearningPolicy, ownerSnapshotSchema, ownerSuggestions, ownerWindow, type OwnerLearningPolicy } from '@/lib/learning/owner-contracts';
import { collectOwnerUsage } from './owner-usage-source';
import { collectOwnerCommerce } from './owner-commerce-source';

// Scope digest includes every binding, so a changed allowlist/reader/start cannot
// read or resume snapshots from a different authorization contract.
export function ownerPolicyKey(policy: OwnerLearningPolicy): string {
    return createHash('sha256').update(JSON.stringify({ owner: policy.ownerId, tenants: [...policy.tenantIds].sort(), activeFrom: policy.activeFrom.toISOString(), version: policy.version })).digest('hex');
}

async function ownerIsActive(policy: OwnerLearningPolicy) {
    const owner = await getMainPrisma().user.findUnique({ where: { id: policy.ownerId }, select: { isActive: true, isSuperAdmin: true } });
    return !!owner?.isActive && !!owner.isSuperAdmin;
}

/** Own-record retention only. No change to source transactions or telemetry. */
async function cleanupOwnerLearning(now: Date) {
    const db = getMainPrisma();
    const expired = await db.ownerLearningRun.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: 100 });
    if (expired.length) await db.ownerLearningRun.deleteMany({ where: { id: { in: expired.map(row => row.id) }, expiresAt: { lte: now } } });
}

async function collectTenant(policy: OwnerLearningPolicy, tenant: { id: string; dbUrl: string }, end: Date, now: Date) {
    const main = getMainPrisma();
    const { start } = ownerWindow(firstCompleteDay(policy.activeFrom), end);
    const identity = { tenantId: tenant.id, ownerId: policy.ownerId, day: dayKey(new Date(end.getTime() - DAY_MS)), version: OWNER_LEARNING_VERSION, policyVersion: ownerPolicyKey(policy) };
    await main.ownerLearningRun.createMany({ skipDuplicates: true, data: [{ ...identity, windowStart: start, windowEnd: end, expiresAt: new Date(start.getTime() + OWNER_RETENTION_DAYS * DAY_MS) }] });
    const run = await main.ownerLearningRun.findUniqueOrThrow({ where: { tenantId_ownerId_day_version_policyVersion: identity } });
    if (run.state === 'COMPLETE') return 'COMPLETE';
    const token = randomUUID();
    const claim = await main.ownerLearningRun.updateMany({ where: { id: run.id, state: { not: 'COMPLETE' }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { state: 'RUNNING', leaseToken: token, leaseUntil: new Date(Date.now() + 180_000), attempts: { increment: 1 }, failureCode: null } });
    if (!claim.count) return 'BUSY';
    try {
        const usage = await main.$transaction(async tx => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            return collectOwnerUsage(tx, tenant.id, start, end);
        }, { timeout: 30_000 });
        const salesEnabled = await hasTenantModuleDirect(tenant.id, 'SALES');
        const tenantDb = getTenantDb(tenant.dbUrl);
        const commerce = salesEnabled ? await tenantContext.run(tenantDb, () => tenantIdContext.run(tenant.id, () => tenantDb.$transaction(async tx => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            return collectOwnerCommerce(tx, start, end);
        }, { timeout: 30_000 }))) : { customers: [], prices: [], regions: [], movements: [], truncated: { customers: false, prices: false, regions: false, movements: false } };
        const partial = { schemaVersion: 1 as const, usage: usage.rows, ...commerce, commerceState: salesEnabled ? 'OBSERVED' as const : 'MODULE_NOT_ENABLED' as const, truncated: { usage: usage.truncated, ...commerce.truncated } };
        const snapshot = ownerSnapshotSchema.parse({ ...partial, suggestions: ownerSuggestions(partial) });
        // Recheck mutable authorization after collection; never publish after revocation.
        const current = ownerLearningPolicy();
        if (!current.enabled || ownerPolicyKey(current) !== identity.policyVersion || !await ownerIsActive(policy)) throw new BusinessRuleError('POLICY_CHANGED');
        const activeTenant = await main.tenant.count({ where: { id: tenant.id, status: 'ACTIVE', dbUrl: tenant.dbUrl } });
        if (!activeTenant) throw new BusinessRuleError('TENANT_INACTIVE');
        const committed = await main.ownerLearningRun.updateMany({ where: { id: run.id, state: 'RUNNING', leaseToken: token, leaseUntil: { gt: new Date() } }, data: { state: 'COMPLETE', summary: snapshot as Prisma.InputJsonValue, completedAt: new Date(), leaseToken: null, leaseUntil: null } });
        return committed.count ? 'COMPLETE' : 'BUSY';
    } catch {
        await main.ownerLearningRun.updateMany({ where: { id: run.id, leaseToken: token, state: 'RUNNING' }, data: { state: 'FAILED', failureCode: 'COLLECTION_FAILED', leaseToken: null, leaseUntil: null } });
        return 'FAILED';
    }
}

export async function runOwnerLearning(now = new Date()) {
    await cleanupOwnerLearning(now);
    const policy = ownerLearningPolicy();
    if (!policy.enabled) return { state: policy.reason, processed: 0 };
    if (!await ownerIsActive(policy)) return { state: 'OWNER_UNAVAILABLE', processed: 0 };
    const end = jakartaDayStart(now);
    if (firstCompleteDay(policy.activeFrom) >= end) return { state: 'AWAITING_COMPLETE_DAY', processed: 0 };
    const main = getMainPrisma();
    const tenants = await main.tenant.findMany({ where: { id: { in: policy.tenantIds }, status: 'ACTIVE' }, select: { id: true, dbUrl: true }, orderBy: { id: 'asc' } });
    let processed = 0;
    let failed = tenants.length !== policy.tenantIds.length;
    // Existing scheduler retries hourly. Bound work to three new tenant snapshots
    // per invocation; already complete tenants do not consume collection capacity.
    let attempted = 0;
    for (const tenant of tenants) {
        const complete = await main.ownerLearningRun.count({ where: { tenantId: tenant.id, ownerId: policy.ownerId, day: dayKey(new Date(end.getTime() - DAY_MS)), version: OWNER_LEARNING_VERSION, policyVersion: ownerPolicyKey(policy), state: 'COMPLETE' } });
        if (complete) continue;
        if (attempted >= 3) return { state: failed ? 'PARTIAL_FAILED' : 'PENDING', processed };
        attempted++;
        const state = await collectTenant(policy, tenant, end, now);
        if (state === 'COMPLETE') processed++; else failed = true;
    }
    return { state: failed ? 'PARTIAL_FAILED' : 'COMPLETE', processed };
}
