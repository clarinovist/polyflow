'use server';

import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { requirePrivateLearningOwner } from '@/lib/learning/owner-authorization';
import { OWNER_LEARNING_VERSION, ownerSnapshotSchema } from '@/lib/learning/owner-contracts';
import { ownerPolicyKey } from '@/services/admin/owner-learning.service';
import { logActivity } from '@/lib/tools/audit';
import { AuthorizationError } from '@/lib/errors/errors';
import { dayKey, firstCompleteDay, jakartaDayStart, DAY_MS } from '@/lib/learning/contracts';

/** Only a single allowlisted tenant per request. Never export private snapshots
 * via the aggregate Learning Center or developer-brief endpoint. */
export async function fetchOwnerLearning(tenantId?: string) {
    const policy = await requirePrivateLearningOwner();
    const main = getMainPrisma();
    const tenants = await main.tenant.findMany({ where: { id: { in: policy.tenantIds }, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { id: 'asc' } });
    const selectedId = tenantId ?? tenants[0]?.id;
    if (!selectedId || !tenants.some(tenant => tenant.id === selectedId)) throw new AuthorizationError('Tenant tidak termasuk scope owner aktif.');
    const now = new Date();
    const runs = await main.ownerLearningRun.findMany({ where: { tenantId: selectedId, ownerId: policy.ownerId, version: OWNER_LEARNING_VERSION, policyVersion: ownerPolicyKey(policy), expiresAt: { gt: now } }, orderBy: { day: 'desc' }, take: 30, select: { id: true, day: true, windowStart: true, windowEnd: true, state: true, failureCode: true, summary: true, completedAt: true } });
    // Audit before returning or enriching sensitive results; failure is fail-closed.
    await logActivity({ userId: policy.ownerId, action: 'OWNER_LEARNING_VIEW', entityType: 'OwnerLearningRun', entityId: selectedId, tx: main });
    const latest = runs.find(run => run.state === 'COMPLETE');
    const snapshot = latest ? ownerSnapshotSchema.parse(latest.summary) : null;
    const tenant = await main.tenant.findFirst({ where: { id: selectedId, status: 'ACTIVE' }, select: { dbUrl: true } });
    if (!tenant) throw new AuthorizationError('Tenant tidak aktif.');
    let labelsAvailable = true;
    let users: { id: string; name: string | null; role: string; isActive: boolean }[] = [];
    let customers: { id: string; name: string }[] = [];
    let variants: { id: string; name: string }[] = [];
    if (snapshot) {
        try {
            const db = getTenantDb(tenant.dbUrl);
            [users, customers, variants] = await db.$transaction(async tx => {
                await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                return Promise.all([
                    tx.user.findMany({ where: { id: { in: [...new Set(snapshot.usage.map(row => row.userId))] } }, select: { id: true, name: true, role: true, isActive: true } }),
                    tx.customer.findMany({ where: { id: { in: [...new Set([...snapshot.customers, ...snapshot.prices, ...snapshot.movements].map(row => row.customerId).filter((id): id is string => !!id))] } }, select: { id: true, name: true } }),
                    tx.productVariant.findMany({ where: { id: { in: [...new Set([...snapshot.prices, ...snapshot.movements].map(row => row.variantId))] } }, select: { id: true, name: true } }),
                ]);
            }, { timeout: 15_000 });
        } catch { labelsAvailable = false; }
    }
    const expectedDay = dayKey(new Date(jakartaDayStart(now).getTime() - DAY_MS));
    const health = firstCompleteDay(policy.activeFrom) >= jakartaDayStart(now) ? 'AWAITING_COMPLETE_DAY' :
        runs[0]?.state === 'FAILED' ? 'FAILED' : !latest || latest.day < expectedDay ? 'STALE' : 'CURRENT';
    const currentPolicy = await requirePrivateLearningOwner();
    if (ownerPolicyKey(currentPolicy) !== ownerPolicyKey(policy)) throw new AuthorizationError('Kebijakan berubah; muat ulang.');
    if (!await main.tenant.count({ where: { id: selectedId, status: 'ACTIVE', dbUrl: tenant.dbUrl } })) throw new AuthorizationError('Tenant berubah; akses dihentikan.');
    return { tenants, selectedId, health, policyVersion: policy.version, activeFrom: policy.activeFrom, labelsAvailable, users, customers, variants, snapshot, latest: latest ? { day: latest.day, windowStart: latest.windowStart, windowEnd: latest.windowEnd, completedAt: latest.completedAt } : null, runs: runs.map(({ summary: _summary, ...run }) => run) };
}
