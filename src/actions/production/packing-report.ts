'use server';

import { withTenant } from '@/lib/core/tenant';
import { auth } from '@/auth';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { PackingReportService } from '@/services/production/packing-report-service';
import { serializeData } from '@/lib/utils/utils';
import { logger } from '@/lib/config/logger';

export const getMonthlyPackingReport = withTenant(
    async function getMonthlyPackingReport(monthStr?: string) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                const report = await PackingReportService.getMonthlyPackingReport(monthStr);
                return serializeData(report);
            } catch (error) {
                logger.error("Failed to get monthly packing report", { error, module: 'PackingReportActions' });
                throw new BusinessRuleError('Failed to load monthly packing report.');
            }
        });
    }
);
