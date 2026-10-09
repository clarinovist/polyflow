'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { getUserRoles } from '@/lib/auth/roles';
import {
    getTenantActiveModules,
    hasWorkspaceResourceAccess,
} from '@/lib/auth/access-policy';
import { safeAction } from '@/lib/errors/errors';
import {
    ExecutiveStatsService,
    type ExecutiveSectionKey,
    type ExecutiveStats,
} from '@/services/dashboard/executive-stats-service';

const ROLE_SECTIONS: Record<string, ExecutiveSectionKey[]> = {
    ADMIN: ['sales', 'purchasing', 'production', 'inventory', 'finance'],
    FINANCE: ['sales', 'purchasing', 'finance'],
    SALES: ['sales', 'inventory'],
    MARKETING: ['sales', 'inventory'],
    PROCUREMENT: ['purchasing', 'inventory'],
    PLANNING: ['sales', 'purchasing', 'production', 'inventory'],
    WAREHOUSE: ['purchasing', 'production', 'inventory'],
    PRODUCTION: ['production', 'inventory'],
    FACTORY_MANAGER: ['production', 'inventory'],
    HRD: [],
};

function allowedSections(
    user: Parameters<typeof getUserRoles>[0] & {
        allowedResources?: string[];
    },
) {
    const allowed = new Set<ExecutiveSectionKey>();
    for (const role of getUserRoles(user)) {
        for (const section of ROLE_SECTIONS[role] ?? []) allowed.add(section);
    }
    const resourceSections: Array<[string, ExecutiveSectionKey]> = [
        ['sales', 'sales'],
        ['purchasing', 'purchasing'],
        ['production', 'production'],
        ['warehouse', 'inventory'],
    ];
    for (const [workspace, section] of resourceSections) {
        if (hasWorkspaceResourceAccess(user.allowedResources, workspace)) {
            allowed.add(section);
        }
    }
    return [...allowed];
}

export const getExecutiveStats = withTenant(
    async function getExecutiveStats(): Promise<{
        success: boolean;
        data?: ExecutiveStats;
        error?: string;
    }> {
        const session = await requireAuth();
        return safeAction(async () => {
            return ExecutiveStatsService.getExecutiveStats({
                sections: allowedSections(session.user),
                activeModules: getTenantActiveModules(),
            });
        });
    },
);
