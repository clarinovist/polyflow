"use server";

import { prisma, getTenantDb } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { AuthorizationError } from "@/lib/errors/errors";

export interface TenantStats {
    tenantId: string;
    online: boolean;          // could we connect & query the tenant DB?
    error?: string;           // populated when online === false
    userCount: number;
    activeUserCount: number;
    lastActivityAt: string | null; // ISO string of MAX(AuditLog.createdAt)
    dbSizeBytes: number | null;
    cachedAt?: string | null; // when the cache was last refreshed (ISO)
}

/**
 * Collect observability stats live from each tenant's OWN database, in
 * parallel. A tenant whose DB is unreachable is returned with online=false +
 * an error message instead of failing the whole page (Promise.allSettled).
 * Read-only at the tenant DB level, but WRITES the results back into the
 * cached* columns on Tenant in the main DB so that subsequent page loads can
 * read from cache (getTenantStatsCached, no cross-DB calls at all).
 */
export async function getAllTenantStats(): Promise<Record<string, TenantStats>> {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }

    const tenants = await prisma.tenant.findMany({ select: { id: true, dbUrl: true } });

    const results = await Promise.allSettled(
        tenants.map((t) => collectOneTenantStats(t.id, t.dbUrl))
    );

    const map: Record<string, TenantStats> = {};
    results.forEach(async (r, i) => {
        const tenantId = tenants[i].id;
        if (r.status === "fulfilled") {
            map[tenantId] = r.value;
        } else {
            map[tenantId] = {
                tenantId,
                online: false,
                error: r.reason instanceof Error ? r.reason.message : "Unknown error",
                userCount: 0,
                activeUserCount: 0,
                lastActivityAt: null,
                dbSizeBytes: null,
            };
        }
    });

    // Persist cache (fire-and-forget — don't make the page wait on the writes).
    // We don't await this; updated rows will be visible on the NEXT page load.
    prisma.$transaction(
        tenants.map((t) => {
            const s = map[t.id];
            return prisma.tenant.update({
                where: { id: t.id },
                data: {
                    cachedUserCount: s.userCount,
                    cachedActiveUserCount: s.activeUserCount,
                    cachedDbSizeBytes: s.dbSizeBytes != null ? BigInt(s.dbSizeBytes) : null,
                    cachedLastActivityAt: s.lastActivityAt ? new Date(s.lastActivityAt) : null,
                    cachedOnline: s.online,
                    cachedStatsError: s.error ?? null,
                    cachedStatsAt: new Date(),
                },
                select: { id: true }, // minimal select
            });
        })
    ).catch((e) => console.error("[getAllTenantStats] cache write failed:", e));

    return map;
}

/**
 * Read cached stats from the main DB only — no cross-DB calls. Fast, safe for
 * every page load. Use getAllTenantStats() (live) when the user explicitly
 * clicks "Refresh" — it refreshes the cache and is slower.
 */
export async function getTenantStatsCached(): Promise<Record<string, TenantStats>> {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }

    const tenants = await prisma.tenant.findMany({
        select: {
            id: true,
            cachedUserCount: true,
            cachedActiveUserCount: true,
            cachedDbSizeBytes: true,
            cachedLastActivityAt: true,
            cachedOnline: true,
            cachedStatsError: true,
            cachedStatsAt: true,
        },
    });

    const map: Record<string, TenantStats> = {};
    for (const t of tenants) {
        map[t.id] = {
            tenantId: t.id,
            online: t.cachedOnline ?? false,
            error: t.cachedStatsError ?? undefined,
            userCount: t.cachedUserCount ?? 0,
            activeUserCount: t.cachedActiveUserCount ?? 0,
            lastActivityAt: t.cachedLastActivityAt
                ? new Date(t.cachedLastActivityAt).toISOString()
                : null,
            dbSizeBytes: t.cachedDbSizeBytes != null ? Number(t.cachedDbSizeBytes) : null,
            cachedAt: t.cachedStatsAt ? new Date(t.cachedStatsAt).toISOString() : null,
        };
    }
    return map;
}

async function collectOneTenantStats(tenantId: string, dbUrl: string): Promise<TenantStats> {
    if (!dbUrl) {
        return {
            tenantId,
            online: false,
            error: "No database URL configured",
            userCount: 0,
            activeUserCount: 0,
            lastActivityAt: null,
            dbSizeBytes: null,
        };
    }

    const db = getTenantDb(dbUrl);

    // Run the cheap queries in parallel. Individual failures bubble up and are
    // caught by getAllTenantStats' allSettled.
    const [userCount, activeUserCount, lastActivity, sizeRows] = await Promise.all([
        db.user.count(),
        db.user.count({ where: { isActive: true } }),
        db.auditLog.aggregate({ _max: { createdAt: true } }),
        db.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database()) AS size`,
    ]);

    const dbSizeBytes = sizeRows?.[0]?.size != null ? Number(sizeRows[0].size) : null;

    return {
        tenantId,
        online: true,
        userCount,
        activeUserCount,
        lastActivityAt: lastActivity._max.createdAt
            ? new Date(lastActivity._max.createdAt).toISOString()
            : null,
        dbSizeBytes,
    };
}
