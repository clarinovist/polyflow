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
}

/**
 * Collect lightweight observability stats for every tenant, querying each
 * tenant's OWN database in parallel. A tenant whose DB is unreachable is
 * returned with online=false + an error message instead of failing the whole
 * page (Promise.allSettled). Read-only.
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
    results.forEach((r, i) => {
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
