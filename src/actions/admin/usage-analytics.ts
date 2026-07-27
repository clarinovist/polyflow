'use server';

import { auth } from '@/auth';
import { canAccessWorkspace } from '@/lib/auth/access-policy';
import { AuthorizationError } from '@/lib/errors/errors';
import {
    UsageAnalyticsService,
    UsageAnalyticsFilter,
    UsageAnalyticsOverviewData,
} from '@/services/admin/usage-analytics.service';
import { prisma } from '@/lib/core/prisma';

export async function fetchUsageAnalytics(
    filter: UsageAnalyticsFilter = {},
): Promise<UsageAnalyticsOverviewData> {
    const session = await auth();

    if (!session?.user || !canAccessWorkspace(session.user, 'admin')) {
        throw new AuthorizationError('Unauthorized access to super admin usage analytics.');
    }

    try {
        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: 'VIEW_USAGE_ANALYTICS',
                entityType: 'UsageAnalytics',
                entityId: 'overview',
                details: `Viewed usage analytics overview (range=${filter.range || '7d'}, tenant=${filter.tenantId || 'all'}, module=${filter.moduleKey || 'all'})`,
            },
        });
    } catch (auditError) {
        console.warn('[UsageAnalyticsAction] Audit log creation non-fatal error:', auditError);
    }

    return UsageAnalyticsService.getAnalytics(filter);
}
