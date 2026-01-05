'use server';

import { prisma } from '@/lib/prisma';

export async function getLocations() {
    try {
        const locations = await prisma.location.findMany({
            orderBy: { name: 'asc' },
        });
        return locations;
    } catch (error) {
        console.error('Failed to fetch locations:', error);
        throw new Error('Failed to fetch locations');
    }
}
