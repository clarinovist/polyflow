import { prisma } from '@/lib/core/prisma';
import {
    isScheduleOverdue,
    canAutoCancelTrip,
    canCloseSchedule,
} from '@/lib/sales/delivery-schedule-rules';
import type { TripStatus } from '@prisma/client';

export interface AutoCloseResult {
    scanned: number;
    closed: string[]; // scheduleNumbers
    cancelledTrips: number;
    cancelledStops: number;
    skipped: Array<{ scheduleNumber: string; reason: string }>;
    dryRun: boolean;
}

/**
 * Auto-close overdue DeliverySchedules.
 * - Overdue = weekEnd + bufferDays < today and status ACTIVE
 * - Cancel PLANNED stops where SO status CANCELLED
 * - Cancel PLANNED/CONFIRMED trips where all stops CANCELLED or no stops
 * - If all trips terminal after cleanup, set schedule CLOSED
 * Idempotent, safe to run daily via cron.
 */
export async function autoCloseExpiredDeliverySchedules(options?: {
    dryRun?: boolean;
    bufferDays?: number;
    today?: Date;
}): Promise<AutoCloseResult> {
    const bufferDays = options?.bufferDays ?? 2;
    const today = options?.today ?? new Date();
    const dryRun = options?.dryRun ?? false;

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - bufferDays);

    const schedules = await prisma.deliverySchedule.findMany({
        where: {
            status: 'ACTIVE',
            weekEnd: { lt: cutoff },
        },
        include: {
            trips: {
                include: {
                    orders: {
                        include: {
                            salesOrder: { select: { status: true } },
                        },
                    },
                },
            },
        },
        orderBy: { weekStart: 'asc' },
    });

    const result: AutoCloseResult = {
        scanned: schedules.length,
        closed: [],
        cancelledTrips: 0,
        cancelledStops: 0,
        skipped: [],
        dryRun,
    };

    for (const schedule of schedules) {
        if (!isScheduleOverdue(schedule.weekEnd, today, bufferDays)) {
            result.skipped.push({ scheduleNumber: schedule.scheduleNumber, reason: 'not overdue (race)' });
            continue;
        }

        // Step 1: cancel stops where SO CANCELLED
        let cancelledStopsThis = 0;
        let cancelledTripsThis = 0;

        // Use transaction per schedule
        const doWork = async () => {
            // Cancel orphan stops
            for (const trip of schedule.trips) {
                for (const order of trip.orders) {
                    if (order.status === 'CANCELLED') continue;
                    const soStatus = order.salesOrder?.status;
                    if (soStatus === 'CANCELLED') {
                        if (!dryRun) {
                            await prisma.deliveryScheduleOrder.update({
                                where: { id: order.id },
                                data: { status: 'CANCELLED' },
                            });
                        }
                        cancelledStopsThis++;
                    }
                }
            }

            // Re-fetch trip state after stop cancels (in-memory update for decision)
            const updatedTrips = schedule.trips.map((trip) => {
                const updatedOrders = trip.orders.map((o) => {
                    if (o.salesOrder?.status === 'CANCELLED' && o.status !== 'CANCELLED') {
                        return { ...o, status: 'CANCELLED' as const };
                    }
                    return o;
                });
                return { ...trip, orders: updatedOrders };
            });

            // Cancel trips where all stops cancelled / no stops
            for (const trip of updatedTrips) {
                const check = canAutoCancelTrip({
                    status: trip.status as TripStatus,
                    departureDate: trip.departureDate,
                    orders: trip.orders.map((o) => ({
                        status: o.status as string,
                        salesOrderStatus: o.salesOrder?.status ?? null,
                    })),
                });
                if (check.allowed) {
                    if (!dryRun) {
                        await prisma.deliveryScheduleVehicle.update({
                            where: { id: trip.id },
                            data: { status: 'CANCELLED' },
                        });
                    }
                    cancelledTripsThis++;
                }
            }

            // Step 2: check if schedule can close
            const terminalCheckTrips = updatedTrips.map((t) => {
                const willBeCancelled = canAutoCancelTrip({
                    status: t.status as TripStatus,
                    departureDate: t.departureDate,
                    orders: t.orders.map((o) => ({
                        status: (o.salesOrder?.status === 'CANCELLED' ? 'CANCELLED' : o.status) as string,
                        salesOrderStatus: o.salesOrder?.status,
                    })),
                }).allowed;
                return { status: willBeCancelled ? ('CANCELLED' as const) : (t.status as TripStatus) };
            });

            const closeGuard = canCloseSchedule(terminalCheckTrips);
            if (closeGuard.ok) {
                if (!dryRun) {
                    await prisma.deliverySchedule.update({
                        where: { id: schedule.id },
                        data: { status: 'CLOSED' },
                    });
                }
                return true; // closed
            }
            return false; // not closed
        };

        try {
            let closed = false;
            if (dryRun) {
                closed = await doWork();
            } else {
                closed = await prisma.$transaction(async () => {
                    return doWork();
                });
            }
            result.cancelledStops += cancelledStopsThis;
            result.cancelledTrips += cancelledTripsThis;
            if (closed) result.closed.push(schedule.scheduleNumber);
            else result.skipped.push({ scheduleNumber: schedule.scheduleNumber, reason: `${cancelledTripsThis} trips cancelled but still has active trips` });
        } catch (err) {
            console.error(`[autoClose] failed ${schedule.scheduleNumber}`, err);
            result.skipped.push({ scheduleNumber: schedule.scheduleNumber, reason: `error: ${String(err).slice(0, 100)}` });
        }
    }

    if (result.closed.length > 0 || result.cancelledTrips > 0 || result.cancelledStops > 0) {
        console.log(`[autoClose] scanned=${result.scanned} closed=${result.closed.length} cTrips=${result.cancelledTrips} cStops=${result.cancelledStops} dryRun=${dryRun}`, result);
    }

    return result;
}
