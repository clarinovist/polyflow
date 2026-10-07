import type { Role } from '@prisma/client';
import { getUserRoles, hasRole } from '@/lib/auth/roles';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import type { ModuleKey } from '@/lib/modules/module-registry';
import {
    MOBILE_PORTAL_REGISTRY,
    type MobileActionCapability,
    type MobileMatchMode,
    type MobilePortalDefinition,
} from '@/lib/mobile/mobile-portal-registry';

export type MobilePortalDecisionReason =
    | 'NO_SESSION'
    | 'ROLE'
    | 'MODULE'
    | 'RESOURCE'
    | 'ROLLOUT'
    | 'FEATURE'
    | 'PLANNED';

export interface MobilePortalInfo {
    id: MobilePortalDefinition['id'];
    title: string;
    description: string;
    path: string;
    icon: string;
    status: MobilePortalDefinition['status'];
    mode: MobilePortalDefinition['mode'];
    capabilities: MobileActionCapability[];
    navigation: MobilePortalDefinition['navigation'];
}

export interface MobilePortalDecisionContext {
    user:
        | {
              role?: string;
              roles?: string[];
              isSuperAdmin?: boolean;
          }
        | null
        | undefined;
    permissions?: readonly string[] | 'ALL';
    activeModules?: readonly ModuleKey[];
    rollout?: Readonly<Record<string, boolean>>;
    featurePermissions?: readonly string[];
}

export type MobilePortalDecision =
    | {
          allowed: true;
          portal: MobilePortalInfo;
          capabilities: MobileActionCapability[];
      }
    | { allowed: false; reason: MobilePortalDecisionReason };

function matchesCount(matches: boolean[], mode: MobileMatchMode): boolean {
    return mode === 'ALL' ? matches.every(Boolean) : matches.some(Boolean);
}

function matchesRoles(
    assignedRoles: readonly string[],
    requiredRoles: readonly Role[],
    mode: MobileMatchMode,
): boolean {
    return matchesCount(
        requiredRoles.map((role) => assignedRoles.includes(role)),
        mode,
    );
}

function resourceMatches(
    permissionRoot: string,
    permissions: readonly string[] | 'ALL',
): boolean {
    const firstSegment = permissionRoot.split('/').filter(Boolean)[0];
    const moduleRoot =
        firstSegment === 'field'
            ? '/sales'
            : firstSegment
              ? `/${firstSegment}`
              : undefined;
    return canSeeNavHref(
        permissionRoot,
        permissions === 'ALL' ? permissions : [...permissions],
        moduleRoot,
    );
}

function matchesResources(
    definition: MobilePortalDefinition,
    assignedRoles: readonly string[],
    permissions: readonly string[] | 'ALL',
): boolean {
    const applicableRules = definition.resourceRules.filter(
        (rule) =>
            rule.roles.some((role) => assignedRoles.includes(role)) &&
            !rule.excludedRoles?.some((role) => assignedRoles.includes(role)),
    );
    if (applicableRules.length === 0) return false;

    return applicableRules.some((rule) =>
        matchesCount(
            rule.permissionRoots.map((root) =>
                resourceMatches(root, permissions),
            ),
            rule.match,
        ),
    );
}

function toPortalInfo(
    definition: MobilePortalDefinition,
    assignedRoles: readonly string[],
): MobilePortalInfo {
    const factoryManagerOnly =
        definition.id === 'production-supervisor' &&
        assignedRoles.includes('FACTORY_MANAGER') &&
        !assignedRoles.includes('ADMIN');

    return {
        id: definition.id,
        title: factoryManagerOnly ? 'Monitor Kepala Pabrik' : definition.title,
        description: factoryManagerOnly
            ? 'Pantau output, downtime, QC, stok, purchasing, dan tim'
            : definition.description,
        path: definition.path,
        icon: definition.icon,
        status: definition.status,
        mode: factoryManagerOnly ? 'EXECUTIVE' : definition.mode,
        capabilities: [],
        navigation: [...definition.navigation],
    };
}

export function getMobilePortalDecision(
    definition: MobilePortalDefinition,
    context: MobilePortalDecisionContext,
    capability?: MobileActionCapability,
): MobilePortalDecision {
    if (!context.user) return { allowed: false, reason: 'NO_SESSION' };
    if (context.user.isSuperAdmin) return { allowed: false, reason: 'ROLE' };
    if (definition.status === 'PLANNED') {
        return { allowed: false, reason: 'PLANNED' };
    }

    const assignedRoles = getUserRoles(context.user);
    if (
        definition.id === 'sales-field' &&
        assignedRoles.includes('MARKETING')
    ) {
        return { allowed: false, reason: 'ROLE' };
    }
    const isAdmin = hasRole(context.user, 'ADMIN');
    const roleAllowed = isAdmin
        ? definition.adminAccess !== 'NONE'
        : matchesRoles(assignedRoles, definition.roles, definition.roleMatch);
    if (!roleAllowed) return { allowed: false, reason: 'ROLE' };

    if (isAdmin && context.activeModules === undefined) {
        return { allowed: false, reason: 'ROLE' };
    }

    if (
        context.activeModules !== undefined &&
        !context.activeModules.includes(definition.moduleKey)
    ) {
        return { allowed: false, reason: 'MODULE' };
    }

    if (!isAdmin && context.permissions === undefined) {
        return { allowed: false, reason: 'RESOURCE' };
    }
    if (context.permissions !== undefined && !isAdmin) {
        if (!matchesResources(definition, assignedRoles, context.permissions)) {
            return { allowed: false, reason: 'RESOURCE' };
        }
    }

    if (
        definition.rolloutKey &&
        context.rollout?.[definition.rolloutKey] !== true
    ) {
        return { allowed: false, reason: 'ROLLOUT' };
    }

    const capabilities = definition.capabilities.filter((candidate) =>
        context.featurePermissions?.includes(candidate),
    );
    if (capability && !capabilities.includes(capability)) {
        return { allowed: false, reason: 'FEATURE' };
    }

    const portal = { ...toPortalInfo(definition, assignedRoles), capabilities };
    return { allowed: true, portal, capabilities };
}

export function getAvailableMobilePortals(
    context: MobilePortalDecisionContext,
): MobilePortalInfo[] {
    return MOBILE_PORTAL_REGISTRY.flatMap((definition) => {
        const decision = getMobilePortalDecision(definition, context);
        return decision.allowed ? [decision.portal] : [];
    });
}
