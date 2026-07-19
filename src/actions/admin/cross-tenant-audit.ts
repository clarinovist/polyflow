"use server";

import { prisma, getMainPrisma, getTenantDb } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { AuthorizationError } from "@/lib/errors/errors";

export interface CrossTenantAuditLog {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string | null;
    changes: unknown;
    createdAt: Date;
    user: { name: string | null; email: string | null } | null;
    source: 'main' | 'tenant';
    tenantId?: string;
    tenantName?: string;
    tenantSubdomain?: string;
}

interface GetCrossTenantAuditLogsParams {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    tenantId?: string; // filter to one tenant (or 'main' for platform-only)
}

/**
 * Read audit logs from BOTH the main/plattform DB and every tenant DB,
 * merge, sort (newest first), and paginate.
 *
 * Used by the superadmin audit-logs page so platform actions (provisioning,
 * password resets) AND tenant business actions all show up in one view,
 * tagged with the tenant they came from.
 *
 * Performance note: this fetches the latest N rows from each source (default
 * 200) before merging — sufficient for normal browsing + filtering. If a
 * tenant DB has vastly more logs than page*N, older pages past that window
 * may not include that tenant. Acceptable for an admin tool; revisit if
 * tenant count grows.
 */
export async function getCrossTenantAuditLogs({
    page = 1,
    limit = 50,
    action,
    entityType,
    tenantId,
}: GetCrossTenantAuditLogsParams = {}) {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }

    // Pull up to this many rows from each DB so we can merge & paginate in-app.
    const FETCH_PER_SOURCE = 200;

    // 1. Always include platform-level logs from main DB (provisioning, etc.)
    type Source = { tenantId: string | null; tenantName: string | null; tenantSubdomain: string | null; db: typeof prisma };
    const sources: Source[] = [{ tenantId: null, tenantName: null, tenantSubdomain: null, db: getMainPrisma() }];

    // 2. Add every tenant DB (unless filtered to main-only).
    if (tenantId !== 'main') {
        const tenantList = tenantId && tenantId !== 'main'
            ? await prisma.tenant.findMany({ where: { id: tenantId } })
            : await prisma.tenant.findMany();
        for (const t of tenantList) {
            if (!t.dbUrl) continue;
            try {
                sources.push({
                    tenantId: t.id,
                    tenantName: t.name,
                    tenantSubdomain: t.subdomain,
                    db: getTenantDb(t.dbUrl),
                });
            } catch {
                // skip tenant with bad dbUrl (don't fail whole page)
            }
        }
    }

    // Build filter once
    const buildWhere = () => {
        const w: Record<string, unknown> = {};
        if (action) w.action = action;
        if (entityType) w.entityType = entityType;
        return w;
    };
    const where = buildWhere();

    // 3. Fetch latest N from each source in parallel (best-effort)
    const results = await Promise.allSettled(
        sources.map(async (src) => {
            const rows = await src.db.auditLog.findMany({
                where,
                include: { user: { select: { name: true, email: true } } },
                orderBy: { createdAt: 'desc' },
                take: FETCH_PER_SOURCE,
            });
            return rows.map((r) => ({
                ...(r as Record<string, unknown>),
                source: src.tenantId ? 'tenant' : 'main',
                tenantId: src.tenantId ?? undefined,
                tenantName: src.tenantName ?? undefined,
                tenantSubdomain: src.tenantSubdomain ?? undefined,
            })) as CrossTenantAuditLog[];
        })
    );

    // 4. Merge, sort, paginate
    const merged: CrossTenantAuditLog[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
        else {
            // surface in logs but don't fail the page
            console.error('[cross-tenant-audit] source failed:', r.reason);
        }
    }
    merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = merged.length;
    const start = (page - 1) * limit;
    const paged = merged.slice(start, start + limit);

    return {
        logs: paged,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
}

/**
 * Aggregate action/entity stats across main + all tenant DBs.
 */
export async function getCrossTenantAuditLogStats() {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }

    const mainPrisma = getMainPrisma();
    const tenants = await prisma.tenant.findMany();
    const dbs = [mainPrisma, ...tenants.filter(t => t.dbUrl).map(t => {
        try { return getTenantDb(t.dbUrl!); } catch { return null; }
    })].filter(Boolean) as typeof prisma[];

    const [actionLists, entityLists] = await Promise.all([
        Promise.allSettled(dbs.map(db => db.auditLog.groupBy({ by: ['action'], _count: { action: true } }))),
        Promise.allSettled(dbs.map(db => db.auditLog.groupBy({ by: ['entityType'], _count: { entityType: true } }))),
    ]);

    const actionsMap = new Map<string, number>();
    for (const r of actionLists) {
        if (r.status === 'fulfilled') for (const s of r.value) {
            actionsMap.set(s.action, (actionsMap.get(s.action) ?? 0) + s._count.action);
        }
    }
    const entitiesMap = new Map<string, number>();
    for (const r of entityLists) {
        if (r.status === 'fulfilled') for (const s of r.value) {
            entitiesMap.set(s.entityType, (entitiesMap.get(s.entityType) ?? 0) + s._count.entityType);
        }
    }

    return {
        actions: Array.from(actionsMap.entries()).map(([action, count]) => ({ action, count })),
        entities: Array.from(entitiesMap.entries()).map(([entityType, count]) => ({ entityType, count })),
    };
}
