import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFleetDistanceHistory, getFleetSummaries } from '../fleet-summary-service';
const mocks = vi.hoisted(() => ({ context: vi.fn(), vehicles: vi.fn(), vehicle: vi.fn(), trips: vi.fn(), records: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
const mileage = { id: 'm', tripId: 't', vehicleId: 'v', driverName: 'Driver snapshot', odometerStart: '100', odometerEnd: '184', startedAt: new Date('2026-09-23T01:00:00Z'), returnedAt: new Date('2026-09-23T07:00:00Z'), note: null, trip: { scheduleId: 's', schedule: { scheduleNumber: 'SCH' } } };
const unlinked = { ...mileage, id: 'u', tripId: null, driverName: 'Sopir tanpa jadwal', odometerStart: '200', odometerEnd: '230.5', startedAt: new Date('2026-09-24T01:00:00Z'), returnedAt: new Date('2026-09-24T05:00:00Z'), note: 'ke gudang', trip: null };
const trip = { id: 't', vehicleId: 'v', vehicle: { ownershipType: 'FACTORY' }, transportMode: 'INTERNAL_FLEET', scheduleId: 's', schedule: { scheduleNumber: 'SCH' }, departureDate: new Date('2026-09-23'), status: 'COMPLETED', plannedDistanceKm: '80', distanceLegs: null, routeName: null, mileage, orders: [] };
const planned = { ...trip, id: 'p', mileage: null };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockReturnValue({
        vehicle: { findMany: mocks.vehicles, findUnique: mocks.vehicle },
        deliveryScheduleVehicle: { findMany: mocks.trips },
        vehicleTripMileage: { findMany: mocks.records },
    });
    mocks.vehicles.mockResolvedValue([{ id: 'v', tripMileages: [mileage] }]);
    mocks.vehicle.mockResolvedValue({ id: 'v', tripMileages: [mileage] });
    mocks.records.mockResolvedValue([mileage]);
    mocks.trips.mockResolvedValue([]);
});
describe('fleet read model', () => {
    it('fails closed without tenant and avoids DB work for an empty fleet', async () => {
        mocks.context.mockReturnValue(undefined);
        await expect(getFleetSummaries(['v'], '2026-09')).rejects.toThrow('Konteks tenant');
        await expect(getFleetSummaries([], '2026-09')).resolves.toEqual([]);
        await expect(getFleetDistanceHistory('v', 'invalid')).rejects.toThrow('Bulan');
        expect(mocks.trips).not.toHaveBeenCalled();
    });
    it('totals come from odometer records, with batched month queries', async () => {
        const [summary, other] = await getFleetSummaries(['v', 'other'], '2026-09');
        expect(summary).toMatchObject({ vehicleId: 'v', actualKm: 84, recordedTrips: 1, latestReading: { km: 184, source: 'TRIP_RETURN', recordedAt: '2026-09-23T07:00:00.000Z', scheduleId: 's', scheduleNumber: 'SCH' } });
        expect(other).toBeUndefined();
        const month = { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') };
        expect(mocks.records).toHaveBeenCalledTimes(1);
        expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({ where: {
            vehicleId: { in: ['v', 'other'] }, OR: [{ tripId: null, startedAt: month }, { trip: { departureDate: month } }],
        } }));
        expect(mocks.trips).toHaveBeenCalledTimes(1);
        expect(mocks.trips).toHaveBeenCalledWith(expect.objectContaining({ where: {
            OR: [{ mileage: { vehicleId: { in: ['v', 'other'] } } }, { mileage: null, vehicleId: { in: ['v', 'other'] } }],
            AND: [{ OR: [{ departureDate: month }, { departureDate: null }] }],
        } }));
    });
    it('counts a record without a trip in km totals and reports no schedule on the latest reading', async () => {
        mocks.vehicles.mockResolvedValue([{ id: 'v', tripMileages: [unlinked] }]);
        mocks.records.mockResolvedValue([mileage, unlinked]);
        const [summary] = await getFleetSummaries(['v'], '2026-09');
        expect(summary).toMatchObject({ actualKm: 114.5, recordedTrips: 2, pendingTrips: 0, latestReading: { km: 230.5, scheduleId: null, scheduleNumber: null } });
    });
    it('keeps absent, open and undated observations honest', async () => {
        const open = { ...mileage, odometerEnd: null, returnedAt: null };
        mocks.vehicles.mockResolvedValue([{ id: 'v', tripMileages: [open] }, { id: 'empty', tripMileages: [] }]);
        mocks.records.mockResolvedValue([open]);
        mocks.trips.mockResolvedValue([planned, { ...planned, id: 'old', departureDate: null }]);
        const [summary, empty] = await getFleetSummaries(['v', 'empty'], '2026-09');
        expect(summary).toMatchObject({ actualKm: null, pendingTrips: 2, undatedTrips: 1, latestReading: { km: 100, source: 'TRIP_START' } });
        expect(empty).toMatchObject({ actualKm: null, latestReading: null, pendingTrips: 0 });
    });
    it('lists trip rows and records without a trip, deduplicating SJ without multiplying kilometers', async () => {
        const delivery = { id: 'do', orderNumber: 'SJ-1', status: 'PENDING', vehicleId: 'v' };
        mocks.records.mockResolvedValue([mileage, unlinked]);
        mocks.trips.mockResolvedValue([
            { ...trip, orders: [{ deliveryOrder: delivery }, { deliveryOrder: delivery }, { deliveryOrder: null }, { deliveryOrder: { ...delivery, id: 'do2' } }] },
            { ...planned, id: 'old', departureDate: null, plannedDistanceKm: null },
        ]);
        const history = await getFleetDistanceHistory('v', '2026-09');
        expect(history).toMatchObject({ actualKm: 114.5, recordedTrips: 2, pendingTrips: 0, undatedTrips: 1 });
        expect(history.rows.map((row) => row.id)).toEqual(['u', 't', 'old']);
        expect(history.rows[1].deliveries).toHaveLength(2);
        expect(history.rows[1]).toMatchObject({ mileageId: 'm', returnedAt: '2026-09-23T07:00:00.000Z', actualDistanceKm: 84, plannedDistanceKm: 80, driverName: 'Driver snapshot' });
        expect(history.rows[0]).toMatchObject({ mileageId: 'u', scheduleId: null, scheduleNumber: null, status: null, note: 'ke gudang', odometerStart: 200, odometerEnd: 230.5, actualDistanceKm: 30.5, deliveries: [] });
        expect(history.rows[2]).toMatchObject({ departureDate: null, actualDistanceKm: null, odometerStart: null, mileageId: null, returnedAt: null });
    });
    it('attributes trip-linked records to the trip departure month and unlinked records to their start time', async () => {
        await getFleetDistanceHistory('v', '2026-09');
        const month = { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') };
        expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({ where: {
            vehicleId: { in: ['v'] }, OR: [{ tripId: null, startedAt: month }, { trip: { departureDate: month } }],
        } }));
        expect(mocks.trips).toHaveBeenCalledWith(expect.objectContaining({ where: {
            OR: [{ mileage: { vehicleId: { in: ['v'] } } }, { mileage: null, vehicleId: { in: ['v'] } }],
            AND: [{ OR: [{ departureDate: month }, { departureDate: null }] }],
        } }));
    });
    it('rejects a vehicle missing from the current tenant', async () => {
        mocks.vehicle.mockResolvedValue(null);
        await expect(getFleetDistanceHistory('missing', '2026-09')).rejects.toThrow('Kendaraan');
        expect(mocks.trips).not.toHaveBeenCalled();
    });
});
