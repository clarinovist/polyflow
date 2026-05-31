'use server';

import { withTenant } from "@/lib/core/tenant";
import { safeAction } from '@/lib/errors/errors';
import { ExecutiveStatsService, type ExecutiveStats } from '@/services/dashboard/executive-stats-service';

export type { ExecutiveStats };

export const getExecutiveStats = withTenant(
async function getExecutiveStats(): Promise<{ success: boolean, data?: ExecutiveStats, error?: string }> {
    return safeAction(async () => {
        return ExecutiveStatsService.getExecutiveStats();
    });
}
);
