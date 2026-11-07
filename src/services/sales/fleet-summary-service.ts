import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { fleetMonthRange, summarizeFleetMileage } from '@/lib/sales/fleet-summary';
import { actualTripDistance, readDistanceLegs } from '@/lib/sales/trip-distance';
import { tripDistanceDb } from './trip-distance-service';

const mileageSelect = {
    id: true, tripId: true, vehicleId: true, driverName: true, odometerStart: true, odometerEnd: true,
    startedAt: true, returnedAt: true, note: true,
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
        // Null when the record is not tied to a schedule trip ("Tanpa jadwal").
        scheduleId: latest.trip?.scheduleId ?? null, scheduleNumber: latest.trip?.schedule.scheduleNumber ?? null,
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
type MileageRecord = Prisma.VehicleTripMileageGetPayload<{ select: typeof mileageSelect }>;

const recordDistance = (record: Pick<MileageRecord, 'odometerStart' | 'odometerEnd'>) =>
    actualTripDistance(Number(record.odometerStart), record.odometerEnd === null ? null : Number(record.odometerEnd));
/**
 * Trip-linked records stay attributed to their trip's departure month (unchanged behaviour);
 * records without a trip are attributed to when the truck actually left.
 */
function recordWhere(vehicleIds: string[], month: string): Prisma.VehicleTripMileageWhereInput {
    const range = fleetMonthRange(month);
    return { vehicleId: { in: vehicleIds }, OR: [{ tripId: null, startedAt: range }, { trip: { departureDate: range } }] };
}
function tripWhere(vehicleIds: string[], month: string): Prisma.DeliveryScheduleVehicleWhereInput {
    return {
        // Once physical evidence exists, only its snapshot owns the actual usage.
        OR: [{ mileage: { vehicleId: { in: vehicleIds } } }, { mileage: null, vehicleId: { in: vehicleIds } }],
        AND: [{ OR: [{ departureDate: fleetMonthRange(month) }, { departureDate: null }] }],
    };
}
function measure(trip: Trip) {
    return {
        departureDate: trip.departureDate, status: trip.status, hasMileage: trip.mileage !== null,
        eligible: trip.transportMode === 'INTERNAL_FLEET' && trip.vehicle?.ownershipType === 'FACTORY',
        actualDistanceKm: trip.mileage ? recordDistance(trip.mileage) : null,
    };
}
function summarize(records: MileageRecord[], trips: Trip[]) {
    return summarizeFleetMileage(records.map((record) => ({ actualDistanceKm: recordDistance(record) })), trips.map(measure));
}

/** Batched read model, not a second ledger or a counter on Vehicle. */
export async function getFleetSummaries(vehicleIds: string[], month: string) {
    fleetMonthRange(month);
    if (!vehicleIds.length) return [];
    const db = tripDistanceDb();
    const [vehicles, records, trips] = await Promise.all([
        db.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, tripMileages: latestMileage } }),
        db.vehicleTripMileage.findMany({ where: recordWhere(vehicleIds, month), select: mileageSelect }),
        db.deliveryScheduleVehicle.findMany({ where: tripWhere(vehicleIds, month), select: tripSelect }),
    ]);
    const tripVehicle = (trip: Trip) => trip.mileage?.vehicleId ?? trip.vehicleId;
    return vehicles.map((vehicle) => ({
        vehicleId: vehicle.id, month,
        ...summarize(records.filter((record) => record.vehicleId === vehicle.id), trips.filter((trip) => tripVehicle(trip) === vehicle.id)),
        latestReading: latestReading(vehicle.tripMileages[0]),
    }));
}
export type FleetSummary = Awaited<ReturnType<typeof getFleetSummaries>>[number];

const numberOrNull = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));
function recordColumns(record: MileageRecord | null) {
    return {
        mileageId: record?.id ?? null, note: record?.note ?? null, driverName: record?.driverName ?? null,
        odometerStart: record ? Number(record.odometerStart) : null, odometerEnd: record ? numberOrNull(record.odometerEnd) : null,
        returnedAt: record?.returnedAt?.toISOString() ?? null, actualDistanceKm: record ? recordDistance(record) : null,
    };
}
type TripWithOrders = Trip & { orders: { deliveryOrder: { id: string; orderNumber: string; status: string; vehicleId: string | null } | null }[] };
function tripRow(trip: TripWithOrders) {
    return {
        id: trip.id, scheduleId: trip.scheduleId as string | null, scheduleNumber: trip.schedule.scheduleNumber as string | null,
        departureDate: trip.departureDate?.toISOString() ?? null, status: trip.status as string | null,
        routeName: trip.routeName, legs: readDistanceLegs(trip.distanceLegs),
        plannedDistanceKm: numberOrNull(trip.plannedDistanceKm),
        ...recordColumns(trip.mileage),
        deliveries: [...new Map(trip.orders.flatMap((order) => order.deliveryOrder ? [[order.deliveryOrder.id, order.deliveryOrder] as const] : [])).values()],
    };
}
/** A record that is not tied to any schedule trip. */
function standaloneRow(record: MileageRecord): ReturnType<typeof tripRow> {
    return {
        id: record.id, scheduleId: null, scheduleNumber: null, departureDate: record.startedAt.toISOString(), status: null,
        routeName: null, legs: [], plannedDistanceKm: null, ...recordColumns(record), deliveries: [],
    };
}
const sortKey = (row: ReturnType<typeof tripRow>) => (row.departureDate ? new Date(row.departureDate).getTime() : Number.NEGATIVE_INFINITY);

export async function getFleetDistanceHistory(vehicleId: string, month: string) {
    const where = tripWhere([vehicleId], month);
    const recordsWhere = recordWhere([vehicleId], month);
    const db = tripDistanceDb();
    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tripMileages: latestMileage } });
    if (!vehicle) throw new NotFoundError('Kendaraan', vehicleId);
    const [records, trips] = await Promise.all([
        db.vehicleTripMileage.findMany({ where: recordsWhere, select: mileageSelect }),
        db.deliveryScheduleVehicle.findMany({
            where, orderBy: [{ sequence: 'asc' }],
            select: { ...tripSelect, orders: { select: { deliveryOrder: { select: { id: true, orderNumber: true, status: true, vehicleId: true } } } } },
        }),
    ]);
    const rows = [...trips.map(tripRow), ...records.filter((record) => record.tripId === null).map(standaloneRow)]
        .sort((a, b) => sortKey(b) - sortKey(a));
    return {
        ...summarize(records, trips),
        latestReading: latestReading(vehicle.tripMileages[0]),
        rows,
    };
}
