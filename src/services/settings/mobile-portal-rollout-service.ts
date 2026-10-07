export const MOBILE_PORTAL_ROLLOUT_KEYS = [
    'mobile.portal.admin.enabled',
    'mobile.portal.marketing.enabled',
    'mobile.portal.distribution.enabled',
    'mobile.portal.maklon.enabled',
] as const;

export type MobilePortalRolloutKey =
    (typeof MOBILE_PORTAL_ROLLOUT_KEYS)[number];

/**
 * Rollout metadata for portals that are not in the runtime registry yet.
 * A portal implementation adds its key to the registry only when the route is
 * ready; existing ACTIVE portals intentionally have no rollout key.
 */
export const PLANNED_MOBILE_PORTAL_ROLLOUTS = {
    admin: 'mobile.portal.admin.enabled',
    marketing: 'mobile.portal.marketing.enabled',
    distribution: 'mobile.portal.distribution.enabled',
    maklon: 'mobile.portal.maklon.enabled',
} as const satisfies Record<string, MobilePortalRolloutKey>;

export function isEnabledAppSetting(value: string | null | undefined): boolean {
    return value === 'true';
}

export interface MobilePortalRolloutReader {
    findMany(args: {
        where: { key: { in: string[] } };
        select: { key: true; value: true };
    }): Promise<Array<{ key: string; value: string }>>;
}

/**
 * Reads all requested tenant rollout flags in one query. The caller must pass
 * the tenant-scoped AppSetting delegate. Missing, malformed, and failed reads
 * are false so a new portal never opens by accident.
 */
export async function readMobilePortalRollouts(
    keys: readonly string[],
    settings: MobilePortalRolloutReader,
): Promise<Record<string, boolean>> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) return {};

    try {
        const rows = await settings.findMany({
            where: { key: { in: uniqueKeys } },
            select: { key: true, value: true },
        });
        const values = new Map(rows.map((row) => [row.key, row.value]));
        return Object.fromEntries(
            uniqueKeys.map((key) => [
                key,
                isEnabledAppSetting(values.get(key)),
            ]),
        );
    } catch {
        return Object.fromEntries(uniqueKeys.map((key) => [key, false]));
    }
}
