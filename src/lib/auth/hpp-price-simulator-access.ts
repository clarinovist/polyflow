import { isPathAllowedByResources } from '@/lib/auth/access-policy';
import { getUserRoles } from '@/lib/auth/roles';
import {
    HPP_PRICE_SIMULATOR_FEATURE,
    HPP_PRICE_SIMULATOR_RESOURCE,
} from '@/lib/auth/hpp-price-simulator-visibility';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import type { PrismaClient, Role } from '@prisma/client';

export type HppPriceSimulatorAccessDb = Pick<
    PrismaClient,
    'user' | 'rolePermission' | 'productVariant' | 'bom'
>;

export {
    HPP_PRICE_SIMULATOR_FEATURE,
    HPP_PRICE_SIMULATOR_RESOURCE,
} from '@/lib/auth/hpp-price-simulator-visibility';

export interface HppPriceSimulatorAccess {
    db: HppPriceSimulatorAccessDb;
    userId: string;
    roles: Role[];
}

/**
 * Optional visibility capability. Any failure hides the entry point without
 * taking down the existing costing page; the simulator page/action guard below
 * remains strict and propagates infrastructure failures.
 */
export async function canAccessHppPriceSimulator(): Promise<boolean> {
    try {
        await requireHppPriceSimulatorAccess();
        return true;
    } catch (error) {
        if (!(error instanceof AuthorizationError)) {
            console.error(
                '[canAccessHppPriceSimulator] Capability lookup failed; hiding optional simulator link.',
                error,
            );
        }
        return false;
    }
}

/**
 * Fresh, tenant-bound access check shared by the simulator page and its data
 * source. ADMIN is the only role that bypasses explicit resource/feature rows.
 */
export async function requireHppPriceSimulatorAccess(): Promise<HppPriceSimulatorAccess> {
    const session = await requireAuth();
    const db = getTenantDbFromContext();
    if (!db || session.user.isSuperAdmin) {
        throw new AuthorizationError(
            'Simulator HPP hanya tersedia di dalam tenant yang terverifikasi.',
        );
    }

    const currentUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            isActive: true,
            isSuperAdmin: true,
            role: true,
            roles: { select: { role: true } },
        },
    });
    if (!currentUser?.isActive || currentUser.isSuperAdmin) {
        throw new AuthorizationError(
            'Akun tidak aktif atau bukan pengguna tenant.',
        );
    }

    const roles = getUserRoles({
        role: currentUser.role,
        roles: currentUser.roles.map((entry) => entry.role),
    }) as Role[];
    if (roles.includes('ADMIN')) {
        return { db, userId: currentUser.id, roles };
    }
    if (roles.includes('FACTORY_MANAGER')) {
        throw new AuthorizationError(
            'Factory Manager tidak memiliki akses ke simulator HPP.',
        );
    }
    if (roles.length === 0) {
        throw new AuthorizationError('Akun tidak memiliki peran aktif.');
    }

    const grants = await db.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    const resources = [...new Set(grants.map((grant) => grant.resource))];
    // Non-admins need two explicit, independent gates. `ALL` is not a feature
    // wildcard; nominal access is granted only by feature:view-prices.
    const hasCostingResource = isPathAllowedByResources(
        HPP_PRICE_SIMULATOR_RESOURCE,
        resources,
    );
    const hasPriceFeature = resources.includes(HPP_PRICE_SIMULATOR_FEATURE);

    if (!hasCostingResource || !hasPriceFeature) {
        throw new AuthorizationError(
            'Akses Analisis Biaya dan izin melihat harga diperlukan.',
        );
    }

    return { db, userId: currentUser.id, roles };
}
