import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finishTripMileage, getVehicleDistanceHistory, listRouteDistances, saveRouteDistance, saveTripDistancePlan, startTripMileage } from '../trip-distance';
import { BusinessRuleError } from '@/lib/errors/errors';
const mocks = vi.hoisted(() => ({
    sales: vi.fn(), delivery: vi.fn(), revalidate: vi.fn(),
    routes: vi.fn(), trips: vi.fn(), saveRoute: vi.fn(), plan: vi.fn(), start: vi.fn(), finish: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { deliveryRouteDistance: { findMany: mocks.routes }, deliveryScheduleVehicle: { findMany: mocks.trips } } }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.sales, requireDeliveryAccess: mocks.delivery }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/services/sales/trip-distance-service', () => ({ saveRouteDistance: mocks.saveRoute, saveTripDistancePlan: mocks.plan, startTripMileage: mocks.start, finishTripMileage: mocks.finish }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.sales.mockResolvedValue({ user: { id: 'u' } });
    mocks.delivery.mockResolvedValue({ user: { id: 'u' } });
    for (const fn of [mocks.plan, mocks.start, mocks.finish]) fn.mockResolvedValue({ scheduleId: 's', vehicleId: 'v' });
});
describe('trip distance actions', () => {
    it.each([saveRouteDistance, saveTripDistancePlan, startTripMileage, finishTripMileage])('rejects unauthorized mutations before service access', async (action) => {
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await action({})).toMatchObject({ success: false, error: 'Unauthorized' });
        for (const fn of [mocks.saveRoute, mocks.plan, mocks.start, mocks.finish]) expect(fn).not.toHaveBeenCalled();
    });
    it('guards route listing and serializes decimals', async () => {
        mocks.routes.mockResolvedValue([{ id: 'r', originAddress: 'F', destinationAddress: 'A', distanceKm: '40.50' }]);
        expect(await listRouteDistances()).toMatchObject({ success: true, data: [{ distanceKm: 40.5 }] });
        expect(mocks.delivery).toHaveBeenCalled();
        mocks.delivery.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await listRouteDistances()).toMatchObject({ success: false });
        expect(mocks.routes).toHaveBeenCalledTimes(1);
    });
    it('passes actor and invalidates affected vehicle and trip views', async () => {
        for (const action of [saveTripDistancePlan, startTripMileage, finishTripMileage]) {
            expect(await action({ tripId: 't' })).toMatchObject({ success: true });
        }
        expect(mocks.start).toHaveBeenCalledWith({ tripId: 't' }, 'u');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles/v');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/delivery-schedules/s');
        mocks.saveRoute.mockResolvedValue({ id: 'r' });
        await saveRouteDistance({ distanceKm: 1 });
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/tariffs');
    });
    it('aggregates once per rit, preserves zero and excludes cancelled plans', async () => {
        const row = { id: 't', scheduleId: 's', schedule: { scheduleNumber: 'SCH' }, departureDate: new Date('2026-09-23'), status: 'COMPLETED', plannedDistanceKm: 80, mileage: { driverName: 'D', odometerStart: 100, odometerEnd: 184 } };
        mocks.trips.mockResolvedValue([row, { ...row, id: 'zero', mileage: { ...row.mileage, odometerEnd: 100 } }, { ...row, id: 'pending', mileage: null }, { ...row, id: 'cancel', status: 'CANCELLED' }]);
        const result = await getVehicleDistanceHistory('v', '2026-09');
        expect(result).toMatchObject({ success: true, data: { actualKm: 84, recordedTrips: 2, pendingTrips: 1 } });
        expect(mocks.trips).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ departureDate: { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') } }) }));
    });
    it('rejects invalid month and unauthorized history before querying', async () => {
        expect(await getVehicleDistanceHistory('v', '2026-13')).toMatchObject({ success: false });
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await getVehicleDistanceHistory('v', '2026-09')).toMatchObject({ success: false });
        expect(mocks.trips).not.toHaveBeenCalled();
    });
});
