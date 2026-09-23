import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { fleetMonthRange, summarizeFleetTrips } from '@/lib/sales/fleet-summary';
import { actualTripDistance, readDistanceLegs } from '@/lib/sales/trip-distance';
import { tripDistanceDb } from './trip-distance-service';

const mileageSelect = {
    vehicleId: true, driverName: true, odometerStart: true, odometerEnd: true,
    startedAt: true, returnedAt: true,
} satisfies Prisma.VehicleTripMileageSelect;
const latestMileage = {
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1,
    select: { ...mileageSelect, trip: { select: { scheduleId: true, schedule: { select: { scheduleNumber: true } } } } },
} satisfies Prisma.VehicleTripMileageFindManyArgs;
type LatestMileage = Prisma.VehicleTripMileageGetPayload<{ select: typeof latestMileage.select }>;
function latestReading(latest: LatestMileage | undefined) {
    return latest ? {
        km: Number(latest.odometerEnd ?? latest.odometerStart),
        recordedAt: (latest.returnedAt ?? latest.startedAt).toISOString(),
        source: latest.odometerEnd === null ? 'TRIP_START' as const : 'TRIP_RETURN' as const,
        scheduleId: latest.trip.scheduleId, scheduleNumber: latest.trip.schedule.scheduleNumber,
    } : null;
}
const tripSelect = {
    id: true, vehicleId: true, scheduleId: true, departureDate: true, status: true,
    transportMode: true, routeName: true, plannedDistanceKm: true, distanceLegs: true,
    vehicle: { select: { ownershipType: true } },
    mileage: { select: mileageSelect },
    schedule: { select: { scheduleNumber: true } },
} satisfies Prisma.DeliveryScheduleVehicleSelect;
type Trip = Prisma.DeliveryScheduleVehicleGetPayload<{ select: typeof tripSelect }>;

function tripWhere(vehicleIds: string[], month: string): Prisma.DeliveryScheduleVehicleWhereInput {
    return {
        // Once physical evidence exists, only its snapshot owns the actual usage.
        OR: [{ mileage: { vehicleId: { in: vehicleIds } } }, { mileage: null, vehicleId: { in: vehicleIds } }],
        AND: [{ OR: [{ departureDate: fleetMonthRange(month) }, { departureDate: null }] }],
    };
}
function measure(trip: Trip) {
    const mileage = trip.mileage;
    return {
        departureDate: trip.departureDate, status: trip.status,
        hasMileage: mileage !== null,
        eligible: trip.transportMode === 'INTERNAL_FLEET' && trip.vehicle?.ownershipType === 'FACTORY',
        actualDistanceKm: mileage ? actualTripDistance(Number(mileage.odometerStart), mileage.odometerEnd === null ? null : Number(mileage.odometerEnd)) : null,
    };
}

/** Batched read model, not a second ledger or a counter on Vehicle. */
export async function getFleetSummaries(vehicleIds: string[], month: string) {
    fleetMonthRange(month);
    if (!vehicleIds.length) return [];
    const db = tripDistanceDb();
    const [vehicles, trips] = await Promise.all([
        db.vehicle.findMany({
            where: { id: { in: vehicleIds } },
            select: {
                id: true,
                tripMileages: latestMileage,
            },
        }),
        db.deliveryScheduleVehicle.findMany({ where: tripWhere(vehicleIds, month), select: tripSelect }),
    ]);
    const grouped = new Map<string, Trip[]>();
    for (const trip of trips) {
        const id = trip.mileage?.vehicleId ?? trip.vehicleId;
        if (id) {
            const group = grouped.get(id) ?? [];
            group.push(trip);
            grouped.set(id, group);
        }
    }
    return vehicles.map((vehicle) => {
        const latest = vehicle.tripMileages[0];
        return {
            vehicleId: vehicle.id, month,
            ...summarizeFleetTrips((grouped.get(vehicle.id) ?? []).map(measure)),
            latestReading: latestReading(latest),
        };
    });
}
export type FleetSummary = Awaited<ReturnType<typeof getFleetSummaries>>[number];

export async function getFleetDistanceHistory(vehicleId: string, month: string) {
    const where = tripWhere([vehicleId], month);
    const db = tripDistanceDb();
    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tripMileages: latestMileage } });
    if (!vehicle) throw new NotFoundError('Kendaraan', vehicleId);
    const trips = await db.deliveryScheduleVehicle.findMany({
        where,
        select: {
            ...tripSelect,
            orders: { select: { deliveryOrder: { select: { id: true, orderNumber: true, status: true, vehicleId: true } } } },
        },
        orderBy: [{ departureDate: { sort: 'desc', nulls: 'last' } }, { sequence: 'asc' }],
    });
    return {
        ...summarizeFleetTrips(trips.map(measure)),
        latestReading: latestReading(vehicle.tripMileages[0]),
        rows: trips.map((trip) => ({
            id: trip.id, scheduleId: trip.scheduleId, scheduleNumber: trip.schedule.scheduleNumber,
            departureDate: trip.departureDate?.toISOString() ?? null, status: trip.status,
            routeName: trip.routeName, legs: readDistanceLegs(trip.distanceLegs),
            plannedDistanceKm: trip.plannedDistanceKm === null ? null : Number(trip.plannedDistanceKm),
            driverName: trip.mileage?.driverName ?? null,
            odometerStart: trip.mileage ? Number(trip.mileage.odometerStart) : null,
            odometerEnd: trip.mileage?.odometerEnd == null ? null : Number(trip.mileage.odometerEnd),
            returnedAt: trip.mileage?.returnedAt?.toISOString() ?? null,
            actualDistanceKm: measure(trip).actualDistanceKm,
            deliveries: [...new Map(trip.orders.flatMap((order) => order.deliveryOrder ? [[order.deliveryOrder.id, order.deliveryOrder] as const] : [])).values()],
        })),
    };
}
