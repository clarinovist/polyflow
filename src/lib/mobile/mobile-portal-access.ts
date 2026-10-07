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
    type MobilePortalDependency,
    type MobilePortalId,
} from '@/lib/mobile/mobile-portal-registry';
import {
    getAvailableMobilePortals,
    getMobilePortalDecision,
    type MobilePortalDecision,
    type MobilePortalInfo,
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

export interface MobilePortalAccessDetails extends MobilePortalAccess {
    activeModules: Awaited<ReturnType<typeof getActiveModuleKeys>>;
    permissions: readonly string[] | 'ALL';
    availablePortals: MobilePortalInfo[];
    dataDependencies: readonly MobilePortalDependency[];
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

async function resolveMobilePortalAccessWithContext(
    portalId: MobilePortalId,
    capability?: MobileActionCapability,
) {
    const definition = getMobilePortalById(portalId);
    if (!definition) {
        return { decision: { allowed: false, reason: 'PLANNED' } as const };
    }

    const accessContext = await readMobilePortalAccessContext();
    if (!accessContext.success) {
        return {
            decision: { allowed: false, reason: accessContext.reason } as const,
        };
    }
    return {
        decision: getMobilePortalDecision(
            definition,
            accessContext.context,
            capability,
        ),
        context: accessContext.context,
    };
}

export async function resolveMobilePortalAccess(
    portalId: MobilePortalId,
    capability?: MobileActionCapability,
): Promise<MobilePortalDecision> {
    return (await resolveMobilePortalAccessWithContext(portalId, capability))
        .decision;
}

export async function requireMobilePortalAccess(
    portalId: MobilePortalId,
    capability?: MobileActionCapability,
): Promise<MobilePortalAccessDetails> {
    const resolved = await resolveMobilePortalAccessWithContext(
        portalId,
        capability,
    );
    if (!resolved.decision.allowed) {
        if (resolved.decision.reason === 'NO_SESSION') redirect('/login');
        throw new MobilePortalAccessError(resolved.decision.reason);
    }
    if (!resolved.context) {
        throw new MobilePortalAccessError('RESOURCE');
    }

    return {
        portal: resolved.decision.portal,
        capabilities: resolved.decision.capabilities,
        activeModules: resolved.context.activeModules,
        permissions: resolved.context.permissions,
        availablePortals: getAvailableMobilePortals(resolved.context),
        dataDependencies: getMobilePortalById(portalId)?.dataDependencies ?? [],
    };
}
