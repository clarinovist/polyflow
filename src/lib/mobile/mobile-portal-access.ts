import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/auth';
import {
    getMyExplicitFeaturePermissions,
    getMyPermissions,
} from '@/actions/admin/permissions';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import { getActiveModuleKeys } from '@/lib/modules/tenant-entitlements';
import {
    MOBILE_PORTAL_REGISTRY,
    getMobilePortalById,
    type MobileActionCapability,
    type MobilePortalId,
} from '@/lib/mobile/mobile-portal-registry';
import {
    getMobilePortalDecision,
    type MobilePortalDecision,
} from '@/lib/mobile/mobile-portal-decision';
import { readMobilePortalRollouts } from '@/services/settings/mobile-portal-rollout-service';

export class MobilePortalAccessError extends AuthorizationError {
    public readonly reason: Exclude<
        MobilePortalDecision,
        { allowed: true }
    >['reason'];

    constructor(reason: MobilePortalAccessError['reason']) {
        super('Portal mobile tidak tersedia untuk akun ini.');
        this.reason = reason;
    }
}

export interface MobilePortalAccess {
    portal: Extract<MobilePortalDecision, { allowed: true }>['portal'];
    capabilities: MobileActionCapability[];
}

const readMobilePortalAccessContext = cache(async () => {
    const session = await auth();
    if (!session?.user) {
        return { success: false as const, reason: 'NO_SESSION' as const };
    }

    const tenantDb = getTenantDbFromContext();
    if (!tenantDb) {
        return { success: false as const, reason: 'RESOURCE' as const };
    }
    const rolloutKeys = MOBILE_PORTAL_REGISTRY.flatMap((portal) =>
        portal.rolloutKey ? [portal.rolloutKey] : [],
    );
    const [permissions, featurePermissions, activeModules, rollout] =
        await Promise.all([
            getMyPermissions(),
            getMyExplicitFeaturePermissions(),
            getActiveModuleKeys(),
            readMobilePortalRollouts(rolloutKeys, tenantDb.appSetting),
        ]);
    if (!permissions.success) {
        return { success: false as const, reason: 'RESOURCE' as const };
    }

    return {
        success: true as const,
        context: {
            user: {
                ...session.user,
                isSuperAdmin:
                    !!session.user.isSuperAdmin ||
                    !!(session.user as { impersonatedBy?: string })
                        .impersonatedBy,
            },
            permissions: permissions.data,
            featurePermissions: featurePermissions.success
                ? featurePermissions.data
                : [],
            activeModules,
            rollout,
        },
    };
});

export async function resolveMobilePortalAccess(
    portalId: MobilePortalId,
    capability?: MobileActionCapability,
): Promise<MobilePortalDecision> {
    const definition = getMobilePortalById(portalId);
    if (!definition) return { allowed: false, reason: 'PLANNED' };

    const accessContext = await readMobilePortalAccessContext();
    if (!accessContext.success) {
        return { allowed: false, reason: accessContext.reason };
    }
    return getMobilePortalDecision(
        definition,
        accessContext.context,
        capability,
    );
}

export async function requireMobilePortalAccess(
    portalId: MobilePortalId,
    capability?: MobileActionCapability,
): Promise<MobilePortalAccess> {
    const decision = await resolveMobilePortalAccess(portalId, capability);
    if (!decision.allowed) {
        if (decision.reason === 'NO_SESSION') redirect('/login');
        throw new MobilePortalAccessError(decision.reason);
    }
    return {
        portal: decision.portal,
        capabilities: decision.capabilities,
    };
}
