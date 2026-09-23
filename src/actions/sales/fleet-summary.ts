'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { parseDistanceInput } from '@/lib/sales/trip-distance';
import { getFleetSummaries } from '@/services/sales/fleet-summary-service';

export const getFleetOverview = withTenant(async function getFleetOverview(vehicleIds: string[], month: string) {
    return safeAction(async () => {
        await requireSalesAccess();
        const ids = parseDistanceInput(z.array(z.string().min(1)).max(1000), vehicleIds);
        return getFleetSummaries([...new Set(ids)], month);
    });
});
