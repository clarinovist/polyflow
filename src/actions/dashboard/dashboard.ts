'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import { ExecutiveStatsService, type ExecutiveStats } from '@/services/dashboard/executive-stats-service';


export const getExecutiveStats = withTenant(
async function getExecutiveStats(): Promise<{ success: boolean, data?: ExecutiveStats, error?: string }> {
    await requireAuth();
    return safeAction(async () => {
        return ExecutiveStatsService.getExecutiveStats();
    });
}
);
