import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFleetDistanceHistory, getFleetSummaries } from '../fleet-summary-service';
const mocks = vi.hoisted(() => ({ context: vi.fn(), vehicles: vi.fn(), vehicle: vi.fn(), trips: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
const mileage = { vehicleId: 'v', driverName: 'Driver snapshot', odometerStart: '100', odometerEnd: '184', startedAt: new Date('2026-09-23T01:00:00Z'), returnedAt: new Date('2026-09-23T07:00:00Z'), trip: { scheduleId: 's', schedule: { scheduleNumber: 'SCH' } } };
const trip = { id: 't', vehicleId: 'v', vehicle: { ownershipType: 'FACTORY' }, transportMode: 'INTERNAL_FLEET', scheduleId: 's', schedule: { scheduleNumber: 'SCH' }, departureDate: new Date('2026-09-23'), status: 'COMPLETED', plannedDistanceKm: '80', distanceLegs: null, routeName: null, mileage, orders: [] };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockReturnValue({ vehicle: { findMany: mocks.vehicles, findUnique: mocks.vehicle }, deliveryScheduleVehicle: { findMany: mocks.trips } });
    mocks.vehicles.mockResolvedValue([{ id: 'v', tripMileages: [mileage] }]);
    mocks.vehicle.mockResolvedValue({ id: 'v', tripMileages: [mileage] });
    mocks.trips.mockResolvedValue([trip]);
});
describe('fleet read model', () => {
    it('fails closed without tenant and avoids DB work for an empty fleet', async () => {
        mocks.context.mockReturnValue(undefined);
        await expect(getFleetSummaries(['v'], '2026-09')).rejects.toThrow('Konteks tenant');
        await expect(getFleetSummaries([], '2026-09')).resolves.toEqual([]);
        await expect(getFleetDistanceHistory('v', 'invalid')).rejects.toThrow('Bulan');
        expect(mocks.trips).not.toHaveBeenCalled();
    });
    it('uses snapshot attribution, batches the month query and serializes the latest reading', async () => {
        mocks.trips.mockResolvedValue([{ ...trip, vehicleId: 'other', status: 'CANCELLED' }]);
        const [summary] = await getFleetSummaries(['v', 'other'], '2026-09');
        expect(summary).toMatchObject({ vehicleId: 'v', actualKm: 84, recordedTrips: 1, latestReading: { km: 184, source: 'TRIP_RETURN', recordedAt: '2026-09-23T07:00:00.000Z' } });
        expect(mocks.trips).toHaveBeenCalledTimes(1);
        expect(mocks.trips).toHaveBeenCalledWith(expect.objectContaining({ where: {
            OR: [{ mileage: { vehicleId: { in: ['v', 'other'] } } }, { mileage: null, vehicleId: { in: ['v', 'other'] } }],
            AND: [{ OR: [{ departureDate: { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') } }, { departureDate: null }] }],
        } }));
    });
    it('keeps absent, open and undated observations honest', async () => {
        mocks.vehicles.mockResolvedValue([{ id: 'v', tripMileages: [{ ...mileage, odometerEnd: null, returnedAt: null }] }, { id: 'empty', tripMileages: [] }]);
        mocks.trips.mockResolvedValue([{ ...trip, mileage: null }, { ...trip, id: 'old', departureDate: null }]);
        const [summary, empty] = await getFleetSummaries(['v', 'empty'], '2026-09');
        expect(summary).toMatchObject({ actualKm: null, pendingTrips: 1, undatedTrips: 1, latestReading: { km: 100, source: 'TRIP_START' } });
        expect(empty).toMatchObject({ actualKm: null, latestReading: null });
    });
    it('deduplicates SJ without multiplying kilometers and preserves return separately from status', async () => {
        const delivery = { id: 'do', orderNumber: 'SJ-1', status: 'PENDING', vehicleId: 'v' };
        mocks.trips.mockResolvedValue([{ ...trip, orders: [{ deliveryOrder: delivery }, { deliveryOrder: delivery }, { deliveryOrder: null }, { deliveryOrder: { ...delivery, id: 'do2' } }] }, { ...trip, id: 'old', departureDate: null, plannedDistanceKm: null, mileage: null }]);
        const history = await getFleetDistanceHistory('v', '2026-09');
        expect(history).toMatchObject({ actualKm: 84, recordedTrips: 1, undatedTrips: 1 });
        expect(history.rows[0].deliveries).toHaveLength(2);
        expect(history.rows[0]).toMatchObject({ returnedAt: '2026-09-23T07:00:00.000Z', actualDistanceKm: 84, plannedDistanceKm: 80, driverName: 'Driver snapshot' });
        expect(history.rows[1]).toMatchObject({ departureDate: null, actualDistanceKm: null, odometerStart: null, returnedAt: null });
    });
    it('rejects a vehicle missing from the current tenant', async () => {
        mocks.vehicle.mockResolvedValue(null);
        await expect(getFleetDistanceHistory('missing', '2026-09')).rejects.toThrow('Kendaraan');
        expect(mocks.trips).not.toHaveBeenCalled();
    });
});
