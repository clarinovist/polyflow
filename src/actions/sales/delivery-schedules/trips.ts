'use server';

import {
    withTenant,
    prisma,
    requireSalesAccess,
    requireSalesApprover,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    computeDeliveryTotals,
    canTransitionTrip,
    canDepartTrip,
    validateDepartureInWeek,
    canRescheduleTrip,
    canCancelTrip,
    canReopenTrip,
    checkSameDayTrips,
    validateTransportMode,
    TripStatus,
    RateType,
    TransportMode,
    revalidatePath,
} from './shared';
import { findApplicableVehicleTariff } from '@/lib/sales/vehicle-tariff-resolver';

// ============================================
// Trip Actions
// ============================================

/**
 * Create a trip (evolved assignVehicleToSchedule).
 * Requires departureDate and optional routeName.
 */
export const createScheduleTrip = withTenant(async function createScheduleTrip(
    scheduleId: string,
    rawData: {
        vehicleId?: string;
        transportMode?: TransportMode;
        departureDate: Date;
        routeName?: string;
        runNumber?: string;
        notes?: string;
        externalProvider?: string;
        externalPlate?: string;
        externalDriver?: string;
    },
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const schedule = await prisma.deliverySchedule.findUnique({
            where: { id: scheduleId },
        });
        if (!schedule) throw new NotFoundError('Jadwal Kirim', scheduleId);

        const transportMode = rawData.transportMode || 'INTERNAL_FLEET';

        // Validate transport mode requirements
        const modeCheck = validateTransportMode(
            transportMode,
            rawData.vehicleId,
        );
        if (!modeCheck.ok) throw new BusinessRuleError(modeCheck.error!);

        // Validate vehicle if INTERNAL_FLEET
        if (transportMode === 'INTERNAL_FLEET' && rawData.vehicleId) {
            const vehicle = await prisma.vehicle.findUnique({
                where: { id: rawData.vehicleId },
            });
            if (!vehicle)
                throw new NotFoundError('Kendaraan', rawData.vehicleId);
            if (vehicle.status !== 'ACTIVE') {
                throw new BusinessRuleError(
                    `Kendaraan "${vehicle.plateNumber}" tidak aktif.`,
                );
            }
        }

        // R-T1: departureDate within week bounds
        const weekCheck = validateDepartureInWeek(
            rawData.departureDate,
            schedule.weekStart,
            schedule.weekEnd,
        );
        if (!weekCheck.ok) {
            throw new BusinessRuleError(weekCheck.error!);
        }

        // R-T2: same vehicle + same date — warning only (multi-trip allowed)
        if (rawData.vehicleId) {
            const existingTrips = await prisma.deliveryScheduleVehicle.findMany(
                {
                    where: { scheduleId, status: { not: 'CANCELLED' } },
                    select: {
                        vehicleId: true,
                        departureDate: true,
                        status: true,
                    },
                },
            );
            const sameDayCheck = checkSameDayTrips(
                rawData.vehicleId,
                rawData.departureDate,
                existingTrips,
            );
            if (sameDayCheck.warning) {
                console.warn(`[schedule] ${sameDayCheck.warning}`);
            }
        }

        // Default sequence = max + 1
        const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
            where: { scheduleId },
            _max: { sequence: true },
        });

        const trip = await prisma.deliveryScheduleVehicle.create({
            data: {
                scheduleId,
                vehicleId: rawData.vehicleId || null,
                transportMode,
                departureDate: rawData.departureDate,
                routeName: rawData.routeName || null,
                runNumber: rawData.runNumber || null,
                notes: rawData.notes || null,
                externalProvider: rawData.externalProvider || null,
                externalPlate: rawData.externalPlate || null,
                externalDriver: rawData.externalDriver || null,
                sequence: (maxSeq._max.sequence ?? -1) + 1,
                status: 'PLANNED',
            },
        });

        revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
        return trip;
    });
});

/**
 * Update trip details. Supports PLANNED (free edit) and CONFIRMED (with reopen).
 */
export const updateScheduleTrip = withTenant(async function updateScheduleTrip(
    tripId: string,
    data: {
        departureDate?: Date;
        routeName?: string;
        runNumber?: string;
        notes?: string;
        sequence?: number;
        transportMode?: TransportMode;
        vehicleId?: string | null;
        externalProvider?: string;
        externalPlate?: string;
        externalDriver?: string;
    },
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: { schedule: true },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        // If CONFIRMED, must reopen first (separate action)
        if (trip.status === 'CONFIRMED') {
            throw new BusinessRuleError(
                'Trip sudah dikonfirmasi. Gunakan "Kembali ke Rencana" terlebih dahulu.',
            );
        }

        if (trip.status !== 'PLANNED') {
            throw new BusinessRuleError(
                `Hanya trip dengan status "Direncanakan" yang bisa diedit.`,
            );
        }

        // Validate transport mode if changing
        const newMode = data.transportMode || trip.transportMode;
        const newVehicleId =
            data.vehicleId !== undefined ? data.vehicleId : trip.vehicleId;
        if (data.transportMode || data.vehicleId !== undefined) {
            const modeCheck = validateTransportMode(newMode, newVehicleId);
            if (!modeCheck.ok) throw new BusinessRuleError(modeCheck.error!);
        }

        // If changing departureDate, validate within week
        if (data.departureDate) {
            const weekCheck = validateDepartureInWeek(
                data.departureDate,
                trip.schedule.weekStart,
                trip.schedule.weekEnd,
            );
            if (!weekCheck.ok) {
                throw new BusinessRuleError(weekCheck.error!);
            }
        }

        const updated = await prisma.deliveryScheduleVehicle.update({
            where: { id: tripId },
            data: {
                ...(data.departureDate && {
                    departureDate: data.departureDate,
                }),
                ...(data.routeName !== undefined && {
                    routeName: data.routeName,
                }),
                ...(data.runNumber !== undefined && {
                    runNumber: data.runNumber,
                }),
                ...(data.notes !== undefined && { notes: data.notes }),
                ...(data.sequence !== undefined && { sequence: data.sequence }),
                ...(data.transportMode && {
                    transportMode: data.transportMode,
                }),
                ...(data.vehicleId !== undefined && {
                    vehicleId: data.vehicleId,
                }),
                ...(data.externalProvider !== undefined && {
                    externalProvider: data.externalProvider,
                }),
                ...(data.externalPlate !== undefined && {
                    externalPlate: data.externalPlate,
                }),
                ...(data.externalDriver !== undefined && {
                    externalDriver: data.externalDriver,
                }),
            },
        });

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return updated;
    });
});

/**
 * Update trip status with guard checks.
 */
export const updateTripStatus = withTenant(async function updateTripStatus(
    tripId: string,
    newStatus: TripStatus,
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: {
                schedule: true,
                orders: {
                    select: {
                        id: true,
                        status: true,
                        deliveryOrderId: true,
                        activityType: true,
                    },
                },
            },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        // Guard transition
        if (!canTransitionTrip(trip.status, newStatus)) {
            throw new BusinessRuleError(
                `Tidak bisa mengubah status trip dari "${trip.status}" ke "${newStatus}".`,
            );
        }

        // Guard DEPARTED: all stops must have DO
        if (newStatus === 'DEPARTED') {
            const departCheck = canDepartTrip(trip.orders);
            if (!departCheck.ok) {
                throw new BusinessRuleError(departCheck.error!);
            }
        }

        // Guard CONFIRMED: departureDate must be set
        if (newStatus === 'CONFIRMED') {
            const weekCheck = validateDepartureInWeek(
                trip.departureDate,
                trip.schedule.weekStart,
                trip.schedule.weekEnd,
            );
            if (!weekCheck.ok) {
                throw new BusinessRuleError(weekCheck.error!);
            }
        }

        const updated = await prisma.deliveryScheduleVehicle.update({
            where: { id: tripId },
            data: { status: newStatus },
        });

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return updated;
    });
});

/**
 * Cancel trip with reason. Sets status to CANCELLED, preserves SJ.
 */
export const cancelTrip = withTenant(async function cancelTrip(
    tripId: string,
    reason: string,
) {
    return safeAction(async () => {
        await requireSalesApprover();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: { schedule: true },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        const cancelCheck = canCancelTrip(trip.status);
        if (!cancelCheck.allowed) {
            throw new BusinessRuleError(cancelCheck.error!);
        }

        if (!reason || reason.trim() === '') {
            throw new BusinessRuleError('Alasan pembatalan wajib diisi.');
        }

        const updated = await prisma.deliveryScheduleVehicle.update({
            where: { id: tripId },
            data: {
                status: 'CANCELLED',
                cancelReason: reason,
            },
        });

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return updated;
    });
});

/**
 * Reopen trip from CONFIRMED back to PLANNED.
 * Requires reason for audit trail.
 */
export const reopenTrip = withTenant(async function reopenTrip(
    tripId: string,
    reason: string,
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: { schedule: true },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        const reopenCheck = canReopenTrip(trip.status);
        if (!reopenCheck.allowed) {
            throw new BusinessRuleError(reopenCheck.error!);
        }

        const updated = await prisma.deliveryScheduleVehicle.update({
            where: { id: tripId },
            data: {
                status: 'PLANNED',
                cancelReason: reason || null,
            },
        });

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return updated;
    });
});

/**
 * Reschedule trip: change date, vehicle, mode with reason.
 * PLANNED: free to change. CONFIRMED: must reopen first.
 */
export const rescheduleTrip = withTenant(async function rescheduleTrip(
    tripId: string,
    data: {
        departureDate?: Date;
        vehicleId?: string | null;
        transportMode?: TransportMode;
        externalProvider?: string;
        externalPlate?: string;
        externalDriver?: string;
        reason?: string;
    },
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: { schedule: true },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        const rescheduleCheck = canRescheduleTrip(trip.status);
        if (!rescheduleCheck.allowed) {
            throw new BusinessRuleError(rescheduleCheck.error!);
        }

        // If CONFIRMED, must reopen first
        if (rescheduleCheck.needsReopen) {
            if (!data.reason || data.reason.trim() === '') {
                throw new BusinessRuleError(
                    'Alasan perubahan wajib diisi untuk trip terkonfirmasi.',
                );
            }
            // Reopen first
            await prisma.deliveryScheduleVehicle.update({
                where: { id: tripId },
                data: { status: 'PLANNED' },
            });
        }

        // Validate transport mode
        const newMode = data.transportMode || trip.transportMode;
        const newVehicleId =
            data.vehicleId !== undefined ? data.vehicleId : trip.vehicleId;
        const modeCheck = validateTransportMode(newMode, newVehicleId);
        if (!modeCheck.ok) throw new BusinessRuleError(modeCheck.error!);

        // Validate departure date within week
        if (data.departureDate) {
            const weekCheck = validateDepartureInWeek(
                data.departureDate,
                trip.schedule.weekStart,
                trip.schedule.weekEnd,
            );
            if (!weekCheck.ok) throw new BusinessRuleError(weekCheck.error!);
        }

        const updated = await prisma.deliveryScheduleVehicle.update({
            where: { id: tripId },
            data: {
                status: 'PLANNED',
                ...(data.departureDate && {
                    departureDate: data.departureDate,
                }),
                ...(data.vehicleId !== undefined && {
                    vehicleId: data.vehicleId,
                }),
                ...(data.transportMode && {
                    transportMode: data.transportMode,
                }),
                ...(data.externalProvider !== undefined && {
                    externalProvider: data.externalProvider,
                }),
                ...(data.externalPlate !== undefined && {
                    externalPlate: data.externalPlate,
                }),
                ...(data.externalDriver !== undefined && {
                    externalDriver: data.externalDriver,
                }),
                ...(data.reason && { cancelReason: data.reason }),
            },
        });

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return updated;
    });
});

/**
 * Generate Delivery Orders for all eligible stops in a trip.
 * R-D5: Atomic per-stop best-effort with partial failure report.
 * Reuses createDeliveryOrderFromSalesOrder for each stop.
 */
export const generateDeliveryOrdersForTrip = withTenant(
    async function generateDeliveryOrdersForTrip(
        tripId: string,
        options?: { sourceLocationId?: string },
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            const trip = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: tripId },
                include: { schedule: true },
            });
            if (!trip) throw new NotFoundError('Trip', tripId);

            // Get all stops that need DO generation (skip non-SJ activities)
            const stops = await prisma.deliveryScheduleOrder.findMany({
                where: {
                    scheduleVehicleId: tripId,
                    status: 'PLANNED',
                    salesOrderId: { not: null },
                    activityType: { in: ['DELIVERY', 'PICKUP_LOAD'] },
                },
                orderBy: { sequence: 'asc' },
            });

            if (stops.length === 0) {
                throw new BusinessRuleError(
                    'Tidak ada stop yang perlu Surat Jalan dibuat.',
                );
            }

            const { createDeliveryOrderFromSalesOrder } =
                await import('@/services/sales/delivery-fulfillment-service');

            const results: {
                ok: string[];
                failed: { stopId: string; error: string }[];
            } = {
                ok: [],
                failed: [],
            };

            for (const stop of stops) {
                try {
                    const fullStop =
                        await prisma.deliveryScheduleOrder.findUnique({
                            where: { id: stop.id },
                            include: {
                                salesOrder: true,
                                deliveryOrder: true,
                                scheduleVehicle: {
                                    include: { vehicle: true, schedule: true },
                                },
                            },
                        });

                    if (
                        !fullStop ||
                        !fullStop.salesOrderId ||
                        fullStop.deliveryOrderId
                    ) {
                        results.failed.push({
                            stopId: stop.id,
                            error: 'Stop tidak eligible.',
                        });
                        continue;
                    }

                    const sv = fullStop.scheduleVehicle;
                    const so = await prisma.salesOrder.findUnique({
                        where: { id: fullStop.salesOrderId },
                        include: { customer: true },
                    });
                    const sourceLocationId =
                        options?.sourceLocationId || so?.sourceLocationId;

                    if (!sourceLocationId) {
                        results.failed.push({
                            stopId: stop.id,
                            error: 'Lokasi sumber tidak ditemukan.',
                        });
                        continue;
                    }

                    // Load planned items for this stop
                    const plannedItems =
                        await prisma.deliveryScheduleOrderItem.findMany({
                            where: { scheduleOrderId: fullStop.id },
                            select: {
                                salesOrderItemId: true,
                                plannedQuantity: true,
                            },
                        });

                    const deliveryOrder =
                        await createDeliveryOrderFromSalesOrder({
                            salesOrderId: fullStop.salesOrderId,
                            sourceLocationId,
                            userId: session.user.id,
                            vehicleId: sv.vehicleId ?? undefined,
                            appliedRouteName: sv.routeName || undefined,
                            estimatedWeightKg: fullStop.plannedWeightKg
                                ? Number(fullStop.plannedWeightKg)
                                : undefined,
                            destinationAddress:
                                so?.customer?.shippingAddress ||
                                so?.customer?.billingAddress ||
                                undefined,
                            plannedItems:
                                plannedItems.length > 0
                                    ? plannedItems.map((pi) => ({
                                          salesOrderItemId: pi.salesOrderItemId,
                                          plannedQuantity: Number(
                                              pi.plannedQuantity,
                                          ),
                                      }))
                                    : undefined,
                        });

                    // Tariff snapshot (route + customer-aware)
                    const tariff = await findApplicableVehicleTariff({
                        vehicleId: sv.vehicleId,
                        routeName: sv.routeName,
                        customerId: so?.customerId,
                    });

                    if (tariff) {
                        const weight = fullStop.plannedWeightKg
                            ? Number(fullStop.plannedWeightKg)
                            : null;
                        const { totalCost, totalCharge } =
                            computeDeliveryTotals({
                                rateType: tariff.rateType as
                                    | 'PER_KG'
                                    | 'FLAT_RATE',
                                costRate: Number(tariff.costRate),
                                chargeRate: Number(tariff.chargeRate),
                                weightKg: weight,
                                minKg:
                                    tariff.minKg != null
                                        ? Number(tariff.minKg)
                                        : null,
                            });

                        await prisma.deliveryOrder.update({
                            where: { id: deliveryOrder.id },
                            data: {
                                appliedRateType: tariff.rateType as RateType,
                                appliedCostRate: tariff.costRate,
                                appliedChargeRate: tariff.chargeRate,
                                appliedRouteName:
                                    tariff.routeName ?? sv.routeName ?? null,
                                totalCost,
                                totalCharge,
                            },
                        });
                    }

                    // Update stop
                    await prisma.deliveryScheduleOrder.update({
                        where: { id: stop.id },
                        data: {
                            deliveryOrderId: deliveryOrder.id,
                            status: 'GENERATED',
                        },
                    });

                    // Sync SO shipping
                    try {
                        const { syncSalesOrderShippingFromDeliveries } =
                            await import('@/services/sales/delivery-shipping-sync');
                        await syncSalesOrderShippingFromDeliveries(
                            fullStop.salesOrderId,
                            { userId: session.user.id },
                        );
                    } catch (err) {
                        console.warn(
                            '[delivery-shipping-sync] sync failed (non-blocking):',
                            err,
                        );
                    }

                    results.ok.push(stop.id);
                } catch (err) {
                    results.failed.push({
                        stopId: stop.id,
                        error:
                            err instanceof Error
                                ? err.message
                                : 'Unknown error',
                    });
                }
            }

            revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
            return results;
        });
    },
);
