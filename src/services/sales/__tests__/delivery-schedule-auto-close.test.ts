import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        deliverySchedule: { findMany: vi.fn(), update: vi.fn() },
        deliveryScheduleOrder: { update: vi.fn() },
        deliveryScheduleVehicle: { update: vi.fn() },
        $transaction: vi.fn(async (fn: any) => {
            // if fn is cb, call it; if array, resolve
            if (typeof fn === 'function') return fn({ deliverySchedule: { update: vi.fn() }, deliveryScheduleOrder: { findMany: vi.fn(), update: vi.fn() }, deliveryScheduleVehicle: { update: vi.fn() } });
            return fn;
        }),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { autoCloseExpiredDeliverySchedules } from '../delivery-schedule-auto-close';

describe('autoCloseExpiredDeliverySchedules', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes schedule where all trips have SO CANCELLED (dryRun)', async () => {
        const today = new Date('2026-07-29');
        const weekEnd = new Date('2026-07-19');
        (prisma.deliverySchedule.findMany as any).mockResolvedValue([
            {
                id: 'sched-1',
                scheduleNumber: 'JADWAL-2026-W29',
                weekStart: new Date('2026-07-13'),
                weekEnd,
                status: 'ACTIVE',
                trips: [
                    {
                        id: 'trip-1',
                        status: 'CONFIRMED',
                        departureDate: new Date('2026-07-13'),
                        orders: [
                            {
                                id: 'stop-1',
                                status: 'PLANNED',
                                salesOrder: { status: 'CANCELLED' },
                            },
                        ],
                    },
                ],
            },
        ]);
        // $transaction mock to execute callback
        (prisma.$transaction as any).mockImplementation(async (cb: any) => {
            if (typeof cb === 'function') {
                return cb(prisma);
            }
            return cb;
        });

        const result = await autoCloseExpiredDeliverySchedules({ dryRun: true, bufferDays: 2, today });

        expect(result.scanned).toBe(1);
        expect(result.closed).toContain('JADWAL-2026-W29');
        expect(result.cancelledStops).toBe(1);
        expect(result.cancelledTrips).toBe(1);
        // dryRun => no real update calls
        expect(prisma.deliverySchedule.update).not.toHaveBeenCalled();
    });

    it('skips non-overdue schedule', async () => {
        const today = new Date('2026-07-29');
        (prisma.deliverySchedule.findMany as any).mockResolvedValue([]);
        const result = await autoCloseExpiredDeliverySchedules({ dryRun: true, bufferDays: 2, today });
        expect(result.scanned).toBe(0);
        expect(result.closed).toHaveLength(0);
    });

    it('skips schedule with active trip (has CONFIRMED SO)', async () => {
        const today = new Date('2026-07-29');
        const weekEnd = new Date('2026-07-20');
        (prisma.deliverySchedule.findMany as any).mockResolvedValue([
            {
                id: 'sched-2',
                scheduleNumber: 'JADWAL-2026-W30',
                weekStart: new Date('2026-07-20'),
                weekEnd,
                status: 'ACTIVE',
                trips: [
                    {
                        id: 'trip-2',
                        status: 'PLANNED',
                        departureDate: new Date('2026-07-22'),
                        orders: [
                            {
                                id: 'stop-2',
                                status: 'PLANNED',
                                salesOrder: { status: 'CONFIRMED' },
                            },
                        ],
                    },
                ],
            },
        ]);
        (prisma.$transaction as any).mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(prisma) : cb));

        const result = await autoCloseExpiredDeliverySchedules({ dryRun: true, bufferDays: 2, today });

        expect(result.closed).toHaveLength(0);
        expect(result.skipped.length).toBe(1);
        expect(result.skipped[0].scheduleNumber).toBe('JADWAL-2026-W30');
    });
});
