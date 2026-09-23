'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireDeliveryAccess, requireSalesAccess } from '@/lib/auth/sales-access';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import * as service from '@/services/sales/trip-distance-service';
import { actualTripDistance, readDistanceLegs } from '@/lib/sales/trip-distance';

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
        revalidatePath(`/sales/delivery-schedules/${result.scheduleId}`);
        revalidatePath(`/sales/vehicles/${result.vehicleId}`);
        return result;
    });
});
export const finishTripMileage = withTenant(async function finishTripMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.finishTripMileage(input, session.user.id);
        revalidatePath(`/sales/delivery-schedules/${result.scheduleId}`);
        revalidatePath(`/sales/vehicles/${result.vehicleId}`);
        return result;
    });
});

export const getVehicleDistanceHistory = withTenant(async function getVehicleDistanceHistory(vehicleId: string, month: string) {
    return safeAction(async () => {
        await requireSalesAccess();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BusinessRuleError('Bulan tidak valid.');
        // Operational month uses departure date in WIB; missing departure dates stay unknown.
        const from = new Date(`${month}-01T00:00:00+07:00`);
        const [year, m] = month.split('-').map(Number);
        const until = new Date(Date.UTC(year, m, 1) - 7 * 60 * 60 * 1000);
        const trips = await service.tripDistanceDb().deliveryScheduleVehicle.findMany({
            where: { OR: [{ vehicleId }, { mileage: { vehicleId } }], departureDate: { gte: from, lt: until } },
            include: { mileage: true, schedule: { select: { scheduleNumber: true } } },
            orderBy: [{ departureDate: 'desc' }, { sequence: 'asc' }],
        });
        const rows = trips.map((trip) => ({
            id: trip.id, scheduleId: trip.scheduleId, scheduleNumber: trip.schedule.scheduleNumber,
            departureDate: trip.departureDate!.toISOString(), status: trip.status,
            routeName: trip.routeName, legs: readDistanceLegs(trip.distanceLegs),
            plannedDistanceKm: trip.plannedDistanceKm === null ? null : Number(trip.plannedDistanceKm),
            driverName: trip.mileage?.driverName ?? null,
            odometerStart: trip.mileage ? Number(trip.mileage.odometerStart) : null,
            odometerEnd: trip.mileage?.odometerEnd == null ? null : Number(trip.mileage.odometerEnd),
            actualDistanceKm: trip.mileage ? actualTripDistance(Number(trip.mileage.odometerStart), trip.mileage.odometerEnd == null ? null : Number(trip.mileage.odometerEnd)) : null,
        }));
        const counted = rows.filter((row) => row.status !== 'CANCELLED');
        return {
            rows,
            actualKm: Math.round(counted.reduce((sum, row) => sum + (row.actualDistanceKm ?? 0), 0) * 100) / 100,
            recordedTrips: counted.filter((row) => row.actualDistanceKm !== null).length,
            pendingTrips: counted.filter((row) => ['DEPARTED', 'COMPLETED'].includes(row.status) && row.actualDistanceKm === null).length,
        };
    });
});
