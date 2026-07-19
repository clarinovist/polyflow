"use server";

import { prisma, getTenantDb } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { AuthorizationError } from "@/lib/errors/errors";

export interface GlobalUserResult {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    source: "main" | "tenant";
    tenantId?: string;
    tenantName?: string;
    tenantSubdomain?: string;
}

/**
 * Search users across the main DB (superadmins) AND every tenant DB in
 * parallel. Matches by email OR name (case-insensitive contains).
 *
 * Designed for superadmin support workflows: "which tenant does this user
 * belong to?" without needing to know the subdomain first.
 *
 * Read-only. A tenant DB that's unreachable is skipped (allSettled) so one
 * bad tenant doesn't fail the whole search.
 */
export async function globalUserSearch(query: string): Promise<GlobalUserResult[]> {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
        return [];
    }

    // Prisma `contains` with `mode: 'insensitive'` on either email or name.
    // Using OR so a single query matches either field.
    const where = {
        OR: [
            { email: { contains: trimmed, mode: "insensitive" as const } },
            { name: { contains: trimmed, mode: "insensitive" as const } },
        ],
    };

    // 1. Main DB (superadmins + any platform-level users)
    type Source = {
        tenantId: string | null;
        tenantName: string | null;
        tenantSubdomain: string | null;
        db: typeof prisma;
    };
    const sources: Source[] = [
        { tenantId: null, tenantName: null, tenantSubdomain: null, db: prisma },
    ];

    // 2. Every tenant DB
    const tenants = await prisma.tenant.findMany();
    for (const t of tenants) {
        if (!t.dbUrl) continue;
        try {
            sources.push({
                tenantId: t.id,
                tenantName: t.name,
                tenantSubdomain: t.subdomain,
                db: getTenantDb(t.dbUrl),
            });
        } catch {
            // skip tenant with bad dbUrl
        }
    }

    // 3. Query all sources in parallel
    const results = await Promise.allSettled(
        sources.map(async (src) => {
            const users = await src.db.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                },
                take: 50, // cap per source to keep response bounded
            });
            return users.map((u) => ({
                ...u,
                source: src.tenantId ? ("tenant" as const) : ("main" as const),
                tenantId: src.tenantId ?? undefined,
                tenantName: src.tenantName ?? undefined,
                tenantSubdomain: src.tenantSubdomain ?? undefined,
            }));
        })
    );

    // 4. Merge
    const merged: GlobalUserResult[] = [];
    for (const r of results) {
        if (r.status === "fulfilled") merged.push(...r.value);
        else {
            console.error("[globalUserSearch] source failed:", r.reason);
        }
    }

    return merged;
}
