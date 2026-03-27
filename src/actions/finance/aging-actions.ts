'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { AgingService } from '@/services/finance/aging-service';

export const getAgingSummary = withTenant(
async function getAgingSummary(type: 'AR' | 'AP') {
    return safeAction(async () => {
        await requireAuth();
        const data = type === 'AR' ? await AgingService.getARAging() : await AgingService.getAPAging();
        return serializeData(data);
    });
}
);
