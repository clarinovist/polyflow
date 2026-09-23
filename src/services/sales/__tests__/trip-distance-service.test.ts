import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveRouteDistance, saveTripDistancePlan, startTripMileage, finishTripMileage, tripDistanceDb } from '../trip-distance-service';
const mocks = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        deliveryScheduleVehicle: { findUnique: vi.fn(), update: vi.fn() },
        deliveryRouteDistance: { findMany: vi.fn(), upsert: vi.fn() },
        vehicleTripMileage: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
    };
    return { tx, audit: vi.fn(), transaction: vi.fn(), context: vi.fn() };
});
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
const baseTrip = () => ({ id: 't', scheduleId: 's', status: 'DEPARTED', vehicleId: 'v', transportMode: 'INTERNAL_FLEET', vehicle: { ownershipType: 'FACTORY' }, mileage: null });
const mileage = (end: number | null = null) => ({ id: 'm', vehicleId: 'v', odometerStart: 100, odometerEnd: end, driverName: 'D' });
beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.context.mockReturnValue({ $transaction: mocks.transaction });
    mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue(baseTrip());
    mocks.tx.vehicleTripMileage.aggregate.mockResolvedValue({ _max: { odometerEnd: null } });
});
describe('trip distance service', () => {
    it('fails closed without tenant context instead of using main database', async () => {
        mocks.context.mockReturnValue(undefined);
        expect(() => tripDistanceDb()).toThrow('Konteks tenant');
        await expect(startTripMileage({ tripId: 't', driverName: 'D', odometerStart: 100 }, 'u')).rejects.toThrow('Konteks tenant');
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('upserts explicit address pairs and audits in same tx', async () => {
        mocks.tx.deliveryRouteDistance.upsert.mockResolvedValue({ id: 'r' });
        await expect(saveRouteDistance({ originAddress: ' F ', destinationAddress: 'A', distanceKm: 40 }, 'u')).resolves.toEqual({ id: 'r' });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.tx, userId: 'u', action: 'SAVE_ROUTE_DISTANCE' }));
    });
    it('snapshots ordered master legs and totals', async () => {
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), status: 'PLANNED' });
        mocks.tx.deliveryRouteDistance.findMany.mockResolvedValue([{ id: 'r', originAddress: 'F', destinationAddress: 'A', distanceKm: 40 }, { id: 'back', originAddress: 'A', destinationAddress: 'F', distanceKm: 44 }]);
        await saveTripDistancePlan({ tripId: 't', routeIds: ['r', 'back'] }, 'u');
        expect(mocks.tx.deliveryScheduleVehicle.update).toHaveBeenCalledWith({ where: { id: 't' }, data: { plannedDistanceKm: 84, distanceLegs: expect.any(Array) } });
    });
    it('rejects missing master and plan after departure', async () => {
        await expect(saveTripDistancePlan({ tripId: 't', routeIds: ['r'] }, 'u')).rejects.toThrow('sebelum');
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), status: 'CONFIRMED' });
        mocks.tx.deliveryRouteDistance.findMany.mockResolvedValue([]);
        await expect(saveTripDistancePlan({ tripId: 't', routeIds: ['foreign'] }, 'u')).rejects.toThrow();
    });
    it.each([null, { ...baseTrip(), vehicle: { ownershipType: 'PRIVATE' } }, { ...baseTrip(), transportMode: 'EXTERNAL_FLEET' }])('rejects missing/foreign/nonfactory trip %j', async (trip) => {
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue(trip);
        await expect(startTripMileage({ tripId: 't', driverName: 'D', odometerStart: 100 }, 'u')).rejects.toThrow();
        expect(mocks.tx.vehicleTripMileage.create).not.toHaveBeenCalled();
    });
    it('starts once with vehicle/driver snapshot, rejecting conflicting retry', async () => {
        const input = { tripId: 't', driverName: 'D', odometerStart: 100 };
        await startTripMileage(input, 'u');
        expect(mocks.tx.vehicleTripMileage.create).toHaveBeenCalledWith({ data: { ...input, vehicleId: 'v' } });
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), mileage: mileage() });
        await startTripMileage(input, 'u');
        expect(mocks.tx.vehicleTripMileage.create).toHaveBeenCalledTimes(1);
        await expect(startTripMileage({ ...input, odometerStart: 101 }, 'u')).rejects.toThrow('ditimpa');
    });
    it('rejects wrong phase, open trip, or backwards starting reading', async () => {
        const input = { tripId: 't', driverName: 'D', odometerStart: 100 };
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), status: 'PLANNED' });
        await expect(startTripMileage(input, 'u')).rejects.toThrow('berangkat');
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue(baseTrip());
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue({ id: 'open' });
        await expect(startTripMileage(input, 'u')).rejects.toThrow('sebelumnya');
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue(null);
        mocks.tx.vehicleTripMileage.aggregate.mockResolvedValue({ _max: { odometerEnd: 101 } });
        await expect(startTripMileage(input, 'u')).rejects.toThrow('di bawah');
    });
    it('finishes idempotently without incrementing any vehicle counter', async () => {
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), mileage: mileage() });
        await finishTripMileage({ tripId: 't', odometerEnd: 184 }, 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { odometerEnd: 184, returnedAt: expect.any(Date) } });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ changes: { odometerEnd: 184, actualDistanceKm: 84 }, tx: mocks.tx }));
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), mileage: mileage(184) });
        await finishTripMileage({ tripId: 't', odometerEnd: 184 }, 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledTimes(1);
        await expect(finishTripMileage({ tripId: 't', odometerEnd: 185 }, 'u')).rejects.toThrow('ditimpa');
    });
    it('rejects finish without start, wrong assignment/status and smaller end', async () => {
        await expect(finishTripMileage({ tripId: 't', odometerEnd: 184 }, 'u')).rejects.toThrow('awal');
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), mileage: mileage(), vehicleId: 'other' });
        await expect(finishTripMileage({ tripId: 't', odometerEnd: 184 }, 'u')).rejects.toThrow('assignment');
        mocks.tx.deliveryScheduleVehicle.findUnique.mockResolvedValue({ ...baseTrip(), mileage: mileage() });
        await expect(finishTripMileage({ tripId: 't', odometerEnd: 99 }, 'u')).rejects.toThrow('lebih kecil');
    });
    it('propagates audit failure instead of reporting unaudited success', async () => {
        mocks.audit.mockRejectedValue(new Error('audit unavailable'));
        await expect(startTripMileage({ tripId: 't', driverName: 'D', odometerStart: 100 }, 'u')).rejects.toThrow('audit unavailable');
    });
});
