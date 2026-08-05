import { prisma } from '@/lib/core/prisma';
import { resolveBestTariff } from '@/lib/sales/delivery-pricing';
import type { VehicleTariff, Prisma } from '@prisma/client';

/**
 * Find the applicable tariff for a given vehicle + route + customer.
 *
 * Query pattern matches the existing call sites: filter by vehicleId,
 * validity window (validFrom <= now, validUntil null or >= now), ordered
 * by validFrom desc. Then delegates to resolveBestTariff for precedence.
 *
 * Pure DB helper — does not wrap in safeAction/withTenant (caller handles auth).
 */
export async function findApplicableVehicleTariff(params: {
    vehicleId?: string | null;
    routeName?: string | null;
    customerId?: string | null;
}): Promise<VehicleTariff | null> {
    const now = new Date();
    const where: Prisma.VehicleTariffWhereInput = {
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    };
    if (params.vehicleId) {
        where.vehicleId = params.vehicleId;
    }
    const candidates = await prisma.vehicleTariff.findMany({
        where,
        orderBy: { validFrom: 'desc' },
    });

    return (
        resolveBestTariff(candidates, {
            routeName: params.routeName,
            customerId: params.customerId,
        }) ?? null
    );
}
