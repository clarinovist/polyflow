import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    actualTripDistance, finishMileageSchema, parseDistanceInput, routeDistanceSchema,
    startMileageSchema, totalRouteDistance, tripDistancePlanSchema,
} from '@/lib/sales/trip-distance';

type Tx = Prisma.TransactionClient;
async function lockedTrip(tx: Tx, tripId: string) {
    // Serializes planning/odometer writes with ordinary trip UPDATEs as well.
    await tx.$queryRaw`SELECT id FROM "DeliveryScheduleVehicle" WHERE id = ${tripId} FOR UPDATE`;
    const trip = await tx.deliveryScheduleVehicle.findUnique({ where: { id: tripId }, include: { vehicle: true, mileage: true } });
    if (!trip) throw new NotFoundError('Trip', tripId);
    if (trip.transportMode !== 'INTERNAL_FLEET' || !trip.vehicleId || trip.vehicle?.ownershipType !== 'FACTORY') {
        throw new BusinessRuleError('Pencatatan kilometer ini khusus mobil pabrik yang di-assign ke trip.');
    }
    return trip;
}
async function audit(tx: Tx, userId: string, entityId: string, action: string, changes: Record<string, unknown>) {
    await logActivity({ tx, userId, entityType: 'DeliveryScheduleVehicle', entityId, action, changes });
}
export async function saveRouteDistance(raw: unknown, userId: string) {
    const input = parseDistanceInput(routeDistanceSchema, raw);
    return prisma.$transaction(async (tx) => {
        // Upsert is intentionally by the explicit address pair; existing trip snapshots never change.
        const route = await tx.deliveryRouteDistance.upsert({
            where: { originAddress_destinationAddress: { originAddress: input.originAddress, destinationAddress: input.destinationAddress } },
            create: input, update: { distanceKm: input.distanceKm },
        });
        await logActivity({ tx, userId, entityType: 'DeliveryRouteDistance', entityId: route.id, action: 'SAVE_ROUTE_DISTANCE', changes: input });
        return { id: route.id };
    });
}
export async function saveTripDistancePlan(raw: unknown, userId: string) {
    const input = parseDistanceInput(tripDistancePlanSchema, raw);
    return prisma.$transaction(async (tx) => {
        const trip = await lockedTrip(tx, input.tripId);
        if (!['PLANNED', 'CONFIRMED'].includes(trip.status) || trip.mileage) {
            throw new BusinessRuleError('Rencana jarak hanya dapat diubah sebelum trip berangkat.');
        }
        const routes = await tx.deliveryRouteDistance.findMany({ where: { id: { in: input.routeIds } } });
        const legs = input.routeIds.map((id) => {
            const route = routes.find((r) => r.id === id);
            if (!route) throw new NotFoundError('Ruas jalan', id);
            return { routeId: id, originAddress: route.originAddress, destinationAddress: route.destinationAddress, distanceKm: Number(route.distanceKm) };
        });
        const plannedDistanceKm = totalRouteDistance(legs);
        await tx.deliveryScheduleVehicle.update({ where: { id: trip.id }, data: { plannedDistanceKm, distanceLegs: legs } });
        await audit(tx, userId, trip.id, 'PLAN_TRIP_DISTANCE', { plannedDistanceKm, legs });
        return { scheduleId: trip.scheduleId, vehicleId: trip.vehicleId! };
    });
}
export async function startTripMileage(raw: unknown, userId: string) {
    const input = parseDistanceInput(startMileageSchema, raw);
    return prisma.$transaction(async (tx) => {
        const trip = await lockedTrip(tx, input.tripId);
        if (!['DEPARTED', 'COMPLETED'].includes(trip.status)) {
            throw new BusinessRuleError('Catat odometer setelah trip berangkat.');
        }
        const result = { scheduleId: trip.scheduleId, vehicleId: trip.vehicleId! };
        if (trip.mileage) {
            if (Number(trip.mileage.odometerStart) === input.odometerStart && trip.mileage.driverName === input.driverName) return result;
            throw new BusinessRuleError('Odometer awal sudah tercatat; tidak boleh ditimpa.');
        }
        // Global per-vehicle lock prevents two different trips claiming the same km range.
        await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${trip.vehicleId} FOR UPDATE`;
        const open = await tx.vehicleTripMileage.findFirst({ where: { vehicleId: trip.vehicleId!, odometerEnd: null } });
        if (open) throw new BusinessRuleError('Lengkapi odometer akhir perjalanan sebelumnya untuk mobil ini terlebih dahulu.');
        const previous = await tx.vehicleTripMileage.aggregate({ where: { vehicleId: trip.vehicleId! }, _max: { odometerEnd: true } });
        if (previous._max.odometerEnd != null && input.odometerStart < Number(previous._max.odometerEnd)) {
            throw new BusinessRuleError('Odometer awal tidak boleh di bawah odometer akhir perjalanan sebelumnya.');
        }
        await tx.vehicleTripMileage.create({ data: { tripId: trip.id, vehicleId: trip.vehicleId!, driverName: input.driverName, odometerStart: input.odometerStart } });
        await audit(tx, userId, trip.id, 'START_TRIP_MILEAGE', { vehicleId: trip.vehicleId, driverName: input.driverName, odometerStart: input.odometerStart });
        return result;
    });
}
export async function finishTripMileage(raw: unknown, userId: string) {
    const input = parseDistanceInput(finishMileageSchema, raw);
    return prisma.$transaction(async (tx) => {
        // Use the recorded vehicle, not a mutable master ownership/driver value.
        await tx.$queryRaw`SELECT id FROM "DeliveryScheduleVehicle" WHERE id = ${input.tripId} FOR UPDATE`;
        const trip = await tx.deliveryScheduleVehicle.findUnique({ where: { id: input.tripId }, include: { mileage: true } });
        if (!trip?.mileage) throw new BusinessRuleError('Catat odometer awal terlebih dahulu.');
        const mileage = trip.mileage;
        if (!['DEPARTED', 'COMPLETED'].includes(trip.status) || trip.vehicleId !== mileage.vehicleId) {
            throw new BusinessRuleError('Status atau assignment trip tidak sesuai dengan catatan kilometer.');
        }
        const result = { scheduleId: trip.scheduleId, vehicleId: mileage.vehicleId };
        if (mileage.odometerEnd !== null) {
            if (Number(mileage.odometerEnd) === input.odometerEnd) return result;
            throw new BusinessRuleError('Odometer akhir sudah tercatat; tidak boleh ditimpa.');
        }
        const actualDistanceKm = actualTripDistance(Number(mileage.odometerStart), input.odometerEnd);
        await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${mileage.vehicleId} FOR UPDATE`;
        await tx.vehicleTripMileage.update({ where: { id: mileage.id }, data: { odometerEnd: input.odometerEnd, returnedAt: new Date() } });
        await audit(tx, userId, trip.id, 'FINISH_TRIP_MILEAGE', { odometerEnd: input.odometerEnd, actualDistanceKm });
        return result;
    });
}
