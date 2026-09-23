'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireDeliveryAccess, requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import * as service from '@/services/sales/trip-distance-service';
import { getFleetDistanceHistory } from '@/services/sales/fleet-summary-service';

export const listRouteDistances = withTenant(async function listRouteDistances() {
    return safeAction(async () => {
        await requireDeliveryAccess();
        const routes = await service.tripDistanceDb().deliveryRouteDistance.findMany({ orderBy: [{ originAddress: 'asc' }, { destinationAddress: 'asc' }] });
        return routes.map((r) => ({ id: r.id, originAddress: r.originAddress, destinationAddress: r.destinationAddress, distanceKm: Number(r.distanceKm) }));
    });
});
export const saveRouteDistance = withTenant(async function saveRouteDistance(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.saveRouteDistance(input, session.user.id);
        revalidatePath('/sales/tariffs');
        return result;
    });
});
export const saveTripDistancePlan = withTenant(async function saveTripDistancePlan(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.saveTripDistancePlan(input, session.user.id);
        revalidatePath(`/sales/delivery-schedules/${result.scheduleId}`);
        revalidatePath(`/sales/vehicles/${result.vehicleId}`);
        return result;
    });
});
export const startTripMileage = withTenant(async function startTripMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.startTripMileage(input, session.user.id);
        revalidatePath('/sales/vehicles');
        revalidatePath(`/sales/delivery-schedules/${result.scheduleId}`);
        revalidatePath(`/sales/vehicles/${result.vehicleId}`);
        return result;
    });
});
export const finishTripMileage = withTenant(async function finishTripMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.finishTripMileage(input, session.user.id);
        revalidatePath('/sales/vehicles');
        revalidatePath(`/sales/delivery-schedules/${result.scheduleId}`);
        revalidatePath(`/sales/vehicles/${result.vehicleId}`);
        return result;
    });
});

export const getVehicleDistanceHistory = withTenant(async function getVehicleDistanceHistory(vehicleId: string, month: string) {
    return safeAction(async () => {
        await requireSalesAccess();
        return getFleetDistanceHistory(vehicleId, month);
    });
});
