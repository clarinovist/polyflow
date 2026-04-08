'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { safeAction, ExternalServiceError, ValidationError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';
import { createLocationSchema, CreateLocationValues, updateLocationSchema, UpdateLocationValues } from '@/lib/schemas/inventory';


export const getLocations = withTenant(
async function getLocations() {
    return safeAction(async () => {
        try {
            const locations = await prisma.location.findMany({
                orderBy: { name: 'asc' },
            });
            return locations;
        } catch (error) {
            logger.error('Failed to fetch locations', { error, module: 'LocationsActions' });
            throw new ExternalServiceError('Failed to fetch locations. Please try again later.', 'Database');
        }
    });
}
);

export const getCustomerOwnedLocations = withTenant(
async function getCustomerOwnedLocations() {
    return safeAction(async () => {
        try {
            const locations = await prisma.location.findMany({
                where: { locationType: 'CUSTOMER_OWNED' },
                orderBy: { name: 'asc' },
            });
            return locations;
        } catch (error) {
            logger.error('Failed to fetch customer-owned locations', { error, module: 'LocationsActions' });
            throw new ExternalServiceError('Failed to fetch locations. Please try again later.', 'Database');
        }
    });
}
);

export const createLocation = withTenant(
async function createLocation(data: CreateLocationValues) {
    return safeAction(async () => {
        try {
            const parsed = createLocationSchema.safeParse(data);
            if (!parsed.success) {
                throw new ValidationError('Invalid location data', parsed.error.flatten().fieldErrors as Record<string, unknown>);
            }

            const { name, slug, description, locationType } = parsed.data;

            // Simple slug generation if not provided
            const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

            // Check if slug exists
            const existing = await prisma.location.findUnique({
                where: { slug: finalSlug }
            });
            if (existing) {
                throw new ValidationError('A location with a similar name or slug already exists', undefined);
            }

            const location = await prisma.location.create({
                data: {
                    name,
                    slug: finalSlug,
                    description,
                    locationType
                }
            });

            return location;
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            logger.error('Failed to create location', { error, module: 'LocationsActions' });
            throw new ExternalServiceError('Failed to create location', 'Database');
        }
    });
}
);

export const updateLocation = withTenant(
async function updateLocation(id: string, data: UpdateLocationValues) {
    return safeAction(async () => {
        try {
            const parsed = updateLocationSchema.safeParse(data);
            if (!parsed.success) {
                throw new ValidationError('Invalid location data', parsed.error.flatten().fieldErrors as Record<string, unknown>);
            }

            const { name, slug, description, locationType } = parsed.data;

            // Simple slug generation if not provided
            const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

            // Check if slug exists but is not this location
            const existing = await prisma.location.findUnique({
                where: { slug: finalSlug }
            });
            if (existing && existing.id !== id) {
                throw new ValidationError('A location with a similar name or slug already exists', undefined);
            }

            const location = await prisma.location.update({
                where: { id },
                data: {
                    name,
                    slug: finalSlug,
                    description,
                    locationType
                }
            });

            return location;
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            logger.error('Failed to update location', { error, module: 'LocationsActions' });
            throw new ExternalServiceError('Failed to update location', 'Database');
        }
    });
}
);

export const deleteLocation = withTenant(
async function deleteLocation(id: string) {
    return safeAction(async () => {
        try {
            // First check if it's used somewhere. Here we can let prisma throw foreign key error
            // or explicitly check relations. For simplicity we let Prisma error on delete if used.
            const location = await prisma.location.delete({
                where: { id }
            });
            return location;
        } catch (error) {
            logger.error('Failed to delete location', { error, module: 'LocationsActions' });
            throw new ExternalServiceError('Cannot delete location as it might be used in existing transactions.', 'Database');
        }
    });
}
);
