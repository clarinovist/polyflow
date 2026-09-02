import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getCachedPermissions,
    invalidatePermissionsCache,
    permissionsCacheKey,
    resetPermissionsCacheForTests,
    permissionsCacheSizeForTests,
} from '../permissions-cache';

describe('permissions-cache', () => {
    beforeEach(() => {
        resetPermissionsCacheForTests();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-02T09:00:00.000+07:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls loader once within TTL and caches per key', async () => {
        const loader = vi.fn().mockResolvedValue(['res-a', 'res-b']);
        const key = permissionsCacheKey('tenant-1', 'user-1');

        const first = await getCachedPermissions(key, loader);
        const second = await getCachedPermissions(key, loader);

        expect(first).toEqual(['res-a', 'res-b']);
        expect(second).toEqual(['res-a', 'res-b']);
        expect(loader).toHaveBeenCalledTimes(1);
        expect(permissionsCacheSizeForTests()).toBe(1);
    });

    it('isolates cache per tenant+user key', async () => {
        const loaderA = vi.fn().mockResolvedValue(['only-a']);
        const loaderB = vi.fn().mockResolvedValue('ALL' as const);

        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-1'),
            loaderA,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-2', 'user-1'),
            loaderB,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-2'),
            loaderB,
        );

        expect(loaderA).toHaveBeenCalledTimes(1);
        expect(loaderB).toHaveBeenCalledTimes(2);
        expect(permissionsCacheSizeForTests()).toBe(3);
    });

    it('expires after TTL and re-runs loader', async () => {
        const loader = vi.fn().mockResolvedValue(['x']);
        const key = permissionsCacheKey('tenant-1', 'user-1');

        await getCachedPermissions(key, loader);
        // Advance 59s — still fresh
        vi.setSystemTime(new Date(Date.now() + 59_000));
        await getCachedPermissions(key, loader);
        expect(loader).toHaveBeenCalledTimes(1);

        // Advance past 60s — expired
        vi.setSystemTime(new Date(Date.now() + 2_000));
        await getCachedPermissions(key, loader);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('invalidatePermissionsCache({userId}) drops only that user across tenants', async () => {
        const loader = vi.fn().mockResolvedValue(['x']);
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-1'),
            loader,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-2', 'user-1'),
            loader,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-2'),
            loader,
        );
        expect(loader).toHaveBeenCalledTimes(3);

        invalidatePermissionsCache({ userId: 'user-1' });
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-1'),
            loader,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-2', 'user-1'),
            loader,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-2'),
            loader,
        );
        // user-1 keys re-ran (2), user-2 key still cached
        expect(loader).toHaveBeenCalledTimes(5);
    });

    it('invalidatePermissionsCache() without args clears everything', async () => {
        const loader = vi.fn().mockResolvedValue(['x']);
        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-1'),
            loader,
        );
        await getCachedPermissions(
            permissionsCacheKey('tenant-2', 'user-2'),
            loader,
        );

        invalidatePermissionsCache();
        expect(permissionsCacheSizeForTests()).toBe(0);

        await getCachedPermissions(
            permissionsCacheKey('tenant-1', 'user-1'),
            loader,
        );
        expect(loader).toHaveBeenCalledTimes(3);
    });

    it('evicts oldest entries beyond MAX to avoid unbounded growth', async () => {
        const loader = vi.fn().mockResolvedValue(['x']);
        // Fill beyond the cap (1000)
        for (let i = 0; i < 1001; i++) {
            await getCachedPermissions(
                permissionsCacheKey(`tenant-${i}`, 'user-1'),
                loader,
            );
        }
        expect(permissionsCacheSizeForTests()).toBeLessThanOrEqual(1000);
    });
});
