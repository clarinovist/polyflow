/**
 * Short-TTL in-memory cache for per-user permission reads.
 *
 * Every module layout calls getMyPermissions() on navigation; the loader
 * runs 3-5 sequential queries (auth + user + rolePermission count/findMany).
 * Permission data changes rarely, so a 60s cache removes that fan-out from
 * every navigation without risking stale access for long.
 *
 * Scope note: this is a single-container in-process cache (the app runs as
 * one polyflow-app container). If the app ever scales horizontally, move
 * invalidation to a shared store (e.g. Redis) or shorten the TTL.
 *
 * Invalidation contract — call invalidatePermissionsCache() after:
 * - rolePermission create/update/upsert (permissions actions)
 * - user role change or isActive toggle (admin users actions)
 * - superadmin tenant-user suspend/reactivate/delete (admin tenant-users)
 * Missed invalidation self-heals within TTL (max 60s of stale access).
 *
 * Note on scope: entries are keyed `${tenantId}:${userId}` where tenantId
 * comes from the browsing user's AsyncLocalStorage context. Superadmin
 * actions run OUTSIDE that context and only know the target tenant by
 * parameter, so they must invalidate by userId (sweeps every tenant entry
 * for that user) rather than by key.
 */

export type PermissionsValue = string[] | 'ALL';

type CacheEntry = {
    value: PermissionsValue;
    expiresAt: number;
};

const TTL_MS = 60_000;
/** Hard cap so a runaway key space cannot grow the map unbounded. */
const MAX_ENTRIES = 1_000;

const cache = new Map<string, CacheEntry>();

export function permissionsCacheKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
}

export async function getCachedPermissions(
    key: string,
    loader: () => Promise<PermissionsValue>,
): Promise<PermissionsValue> {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
        return hit.value;
    }

    const value = await loader();
    cache.set(key, { value, expiresAt: now + TTL_MS });

    if (cache.size > MAX_ENTRIES) {
        // Map preserves insertion order — drop the oldest entries.
        for (const oldest of cache.keys()) {
            cache.delete(oldest);
            if (cache.size <= MAX_ENTRIES) break;
        }
    }

    return value;
}

export function invalidatePermissionsCache(opts?: {
    userId?: string;
}): void {
    if (!opts?.userId) {
        cache.clear();
        return;
    }
    const suffix = `:${opts.userId}`;
    for (const key of cache.keys()) {
        if (key.endsWith(suffix)) {
            cache.delete(key);
        }
    }
}

/** Test hook — clear all entries between tests. */
export function resetPermissionsCacheForTests(): void {
    cache.clear();
}

/** Test hook — current entry count. */
export function permissionsCacheSizeForTests(): number {
    return cache.size;
}
