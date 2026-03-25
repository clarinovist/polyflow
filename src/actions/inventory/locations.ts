'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';

export const getLocations = withTenant(
async function getLocations() {
    try {
        const locations = await prisma.location.findMany({
            orderBy: { name: 'asc' },
        });
        return locations;
    } catch (error) {
        logger.error('Failed to fetch locations', { error, module: 'LocationsActions' });
        throw new Error('Failed to fetch locations. Please try again later.');
    }
}
);
