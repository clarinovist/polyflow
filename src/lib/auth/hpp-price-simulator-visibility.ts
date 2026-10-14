import { isPathAllowedByResources } from '@/lib/auth/access-policy';

export const HPP_PRICE_SIMULATOR_RESOURCE = '/production/costing';
export const HPP_PRICE_SIMULATOR_FEATURE = 'feature:view-prices';

/**
 * Pure visibility helper for client navigation. The server guard remains the
 * authority; this only prevents links from appearing when either gate is absent.
 */
export function canSeeHppPriceSimulatorShortcut(
    permissions: string[] | 'ALL',
    roles: readonly string[],
): boolean {
    const normalizedRoles = roles.map((role) => role.toUpperCase());
    if (normalizedRoles.includes('ADMIN')) return true;
    if (normalizedRoles.includes('FACTORY_MANAGER')) return false;
    if (permissions === 'ALL') return false;

    return (
        isPathAllowedByResources(HPP_PRICE_SIMULATOR_RESOURCE, permissions) &&
        permissions.includes(HPP_PRICE_SIMULATOR_FEATURE)
    );
}
