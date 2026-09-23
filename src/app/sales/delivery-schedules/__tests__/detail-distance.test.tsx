import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import ScheduleDetailPage from '../[id]/page';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/actions/sales/delivery-schedules', () => ({ getDeliverySchedule: mocks.get }));
vi.mock('@/components/sales/schedules/ScheduleDetailClient', () => ({ ScheduleDetailClient: () => null }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
describe('schedule mileage RSC serialization', () => {
    it('serializes nested Prisma values including raw trips relation, zero and null', async () => {
        const date = new Date('2026-09-23T00:00:00Z');
        mocks.get.mockResolvedValue({ success: true, data: {
            id: 's', weekStart: date, weekEnd: date, createdAt: date, updatedAt: date,
            trips: [{ id: 't', createdAt: date, vehicleId: 'v', departureDate: date, plannedDistanceKm: new Prisma.Decimal(80), distanceLegs: [],
                mileage: { driverName: 'Synthetic', odometerStart: new Prisma.Decimal(0), odometerEnd: null },
                vehicle: { capacityKg: new Prisma.Decimal(1000) }, orders: [] }],
        } });
        const element = await ScheduleDetailPage({ params: Promise.resolve({ id: 's' }) });
        const schedule = element.props.schedule;
        expect(schedule.vehicles[0].plannedDistanceKm).toBe(80);
        expect(schedule.vehicles[0].mileage).toEqual({ driverName: 'Synthetic', odometerStart: 0, odometerEnd: null });
        expect(schedule.vehicles[0].vehicle.capacityKg).toBe(1000);
        expect(schedule.trips[0].plannedDistanceKm).toBe(80);
    });
});
