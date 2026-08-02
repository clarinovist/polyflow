'use server';

import {
    withTenant,
    prisma,
    requireDeliveryAccess,
    requireSalesAccess,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    isSOSchedulable,
    validateStopHasSource,
    validateStopSource,
    validateDepartureInWeek,
    validateTransportMode,
    Prisma,
    TransportMode,
    ActivityType,
    revalidatePath,
    assignSalesOrderToTripSchema,
} from './shared';

// ============================================
// Stop Actions — from Sales Order (new)
// ============================================

/**
 * Assign a Sales Order to a trip as a planned stop.
 * No DO needed — plan-first workflow.
 */
export const assignSalesOrderToTrip = withTenant(
    async function assignSalesOrderToTrip(
        tripId: string,
        rawData: {
            salesOrderId: string;
            plannedWeightKg?: number;
            notes?: string;
        },
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            // Zod validation
            const parsed = assignSalesOrderToTripSchema.safeParse(rawData);
            if (!parsed.success) {
                throw new BusinessRuleError(
                    parsed.error.issues.map((i) => i.message).join(', '),
                );
            }
            const data = parsed.data;

            const trip = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: tripId },
                include: { schedule: true },
            });
            if (!trip) throw new NotFoundError('Trip', tripId);

            // R-Trip: only PLANNED/CONFIRMED trips accept new stops
            if (trip.status !== 'PLANNED' && trip.status !== 'CONFIRMED') {
                throw new BusinessRuleError(
                    `Trip dengan status "${trip.status}" tidak bisa menerima stop baru.`,
                );
            }

            // Validate SO exists and is schedulable
            const so = await prisma.salesOrder.findUnique({
                where: { id: data.salesOrderId },
                include: { customer: { select: { id: true, name: true } } },
            });
            if (!so) throw new NotFoundError('Sales Order', data.salesOrderId);
            if (!isSOSchedulable(so.status)) {
                throw new BusinessRuleError(
                    `Sales Order "${so.orderNumber}" dengan status "${so.status}" tidak bisa dijadwalkan.`,
                );
            }

            // Validate stop has source
            const sourceCheck = validateStopHasSource(data.salesOrderId, null);
            if (!sourceCheck.ok)
                throw new BusinessRuleError(sourceCheck.error!);

            // Default sequence
            const maxSeq = await prisma.deliveryScheduleOrder.aggregate({
                where: { scheduleVehicleId: tripId },
                _max: { sequence: true },
            });

            const stop = await prisma.deliveryScheduleOrder.create({
                data: {
                    scheduleVehicleId: tripId,
                    salesOrderId: data.salesOrderId,
                    plannedWeightKg: data.plannedWeightKg ?? null,
                    notes: data.notes ?? null,
                    sequence: (maxSeq._max.sequence ?? -1) + 1,
                    status: 'PLANNED',
                },
            });

            revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
            return stop;
        });
    },
);

/**
 * Unified action: tambah SO ke jadwal dengan manajemen trip otomatis.
 * - existingTripId diisi  → SO masuk ke trip itu langsung
 * - existingTripId kosong → buat trip baru, lalu assign SO
 */
export const scheduleSOWithTrip = withTenant(async function scheduleSOWithTrip(
    scheduleId: string,
    data: {
        salesOrderId: string;
        vehicleId: string;
        departureDate: Date;
        plannedWeightKg?: number;
        existingTripId?: string;
    },
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const schedule = await prisma.deliverySchedule.findUnique({
            where: { id: scheduleId },
        });
        if (!schedule) throw new NotFoundError('Jadwal Kirim', scheduleId);

        const so = await prisma.salesOrder.findUnique({
            where: { id: data.salesOrderId },
        });
        if (!so) throw new NotFoundError('Sales Order', data.salesOrderId);
        if (!isSOSchedulable(so.status))
            throw new BusinessRuleError(
                `SO "${so.orderNumber}" tidak bisa dijadwalkan.`,
            );

        let tripId: string;

        if (data.existingTripId) {
            // Re-use existing trip — validasi kepemilikan & status
            const trip = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: data.existingTripId },
            });
            if (!trip) throw new NotFoundError('Trip', data.existingTripId);
            if (trip.scheduleId !== scheduleId)
                throw new BusinessRuleError(
                    'Trip tidak ditemukan dalam jadwal ini.',
                );
            if (trip.status !== 'PLANNED' && trip.status !== 'CONFIRMED')
                throw new BusinessRuleError(
                    `Trip dengan status "${trip.status}" tidak bisa menerima stop baru.`,
                );
            tripId = trip.id;
        } else {
            // Buat trip baru
            const vehicle = await prisma.vehicle.findUnique({
                where: { id: data.vehicleId },
            });
            if (!vehicle) throw new NotFoundError('Kendaraan', data.vehicleId);
            if (vehicle.status !== 'ACTIVE')
                throw new BusinessRuleError(
                    `Kendaraan "${vehicle.plateNumber}" tidak aktif.`,
                );

            const weekCheck = validateDepartureInWeek(
                data.departureDate,
                schedule.weekStart,
                schedule.weekEnd,
            );
            if (!weekCheck.ok) throw new BusinessRuleError(weekCheck.error!);

            const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
                where: { scheduleId },
                _max: { sequence: true },
            });
            const newTrip = await prisma.deliveryScheduleVehicle.create({
                data: {
                    scheduleId,
                    vehicleId: data.vehicleId,
                    departureDate: data.departureDate,
                    sequence: (maxSeq._max.sequence ?? -1) + 1,
                    status: 'PLANNED',
                },
            });
            tripId = newTrip.id;
        }

        // Assign SO sebagai stop
        const maxStopSeq = await prisma.deliveryScheduleOrder.aggregate({
            where: { scheduleVehicleId: tripId },
            _max: { sequence: true },
        });
        const stop = await prisma.deliveryScheduleOrder.create({
            data: {
                scheduleVehicleId: tripId,
                salesOrderId: data.salesOrderId,
                plannedWeightKg: data.plannedWeightKg ?? null,
                sequence: (maxStopSeq._max.sequence ?? -1) + 1,
                status: 'PLANNED',
            },
        });

        revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
        return { tripId, stop };
    });
});

/**
 * List schedulable Sales Orders for the SO picker dialog.
 * Returns SO with remaining qty signal + already-planned-this-week flag.
 */
export const listSchedulableSalesOrders = withTenant(
    async function listSchedulableSalesOrders(filters?: {
        weekEnd?: Date;
        customerId?: string;
        search?: string;
        scheduleId?: string;
    }) {
        return safeAction(async () => {
            await requireDeliveryAccess();

            const where: Prisma.SalesOrderWhereInput = {
                status: {
                    notIn: [
                        'DRAFT',
                        'CANCELLED',
                        'QUOTATION',
                        'QUOTATION_SENT',
                        'QUOTATION_REJECTED',
                        'QUOTATION_EXPIRED',
                    ],
                },
            };

            if (filters?.customerId) {
                where.customerId = filters.customerId;
            }
            if (filters?.search) {
                where.OR = [
                    {
                        orderNumber: {
                            contains: filters.search,
                            mode: 'insensitive',
                        },
                    },
                    {
                        customer: {
                            name: {
                                contains: filters.search,
                                mode: 'insensitive',
                            },
                        },
                    },
                ];
            }

            const orders = await prisma.salesOrder.findMany({
                where,
                include: {
                    customer: { select: { id: true, name: true } },
                    items: {
                        select: {
                            id: true,
                            quantity: true,
                            deliveredQty: true,
                            enteredQuantity: true,
                            enteredUnit: true,
                            productVariant: {
                                select: {
                                    id: true,
                                    name: true,
                                    skuCode: true,
                                    primaryUnit: true,
                                },
                            },
                        },
                    },
                    scheduleStops: {
                        where: { status: { not: 'CANCELLED' } },
                        select: {
                            id: true,
                            scheduleVehicle: { select: { scheduleId: true } },
                        },
                    },
                },
                orderBy: { orderDate: 'desc' },
                take: 50,
            });

            // Compute remaining qty signal + filter out fully delivered
            return orders.map((so) => {
                const totalOrdered = so.items.reduce(
                    (sum, item) => sum + Number(item.quantity),
                    0,
                );
                const totalDelivered = so.items.reduce(
                    (sum, item) => sum + Number(item.deliveredQty),
                    0,
                );
                const remainingQty = totalOrdered - totalDelivered;

                // Filter to current schedule if scheduleId provided
                const relevantStops = filters?.scheduleId
                    ? so.scheduleStops.filter(
                          (s) =>
                              s.scheduleVehicle.scheduleId ===
                              filters.scheduleId,
                      )
                    : so.scheduleStops;
                const alreadyPlanned = relevantStops.length > 0;
                const multiStop = so.scheduleStops.length > 1;

                return {
                    id: so.id,
                    orderNumber: so.orderNumber,
                    status: so.status,
                    orderDate: so.orderDate.toISOString(),
                    expectedDate: so.expectedDate?.toISOString() ?? null,
                    customer: so.customer,
                    totalOrdered,
                    totalDelivered,
                    remainingQty,
                    alreadyPlanned,
                    multiStop,
                    plannedCount: relevantStops.length,
                    items: so.items.map((item) => ({
                        id: item.id,
                        quantity: Number(item.quantity),
                        deliveredQty: Number(item.deliveredQty),
                        enteredQuantity: item.enteredQuantity
                            ? Number(item.enteredQuantity)
                            : null,
                        enteredUnit: item.enteredUnit,
                        productVariant: item.productVariant,
                    })),
                };
            });
        });
    },
);

// ============================================
// Stop Actions — from Delivery Order (existing, updated)
// ============================================
// NOTE: assignOrderToSchedule, linkDeliveryOrderToStop and
// generateDeliveryOrderFromStop moved to ./delivery-orders.ts (DO linkage
// & generation) to keep this file under the 800-line convention.

/**
 * Remove/cancel a stop.
 * PLANNED stops → delete. LINKED/GENERATED → cancel (keep DO).
 */
export const removeOrderFromSchedule = withTenant(
    async function removeOrderFromSchedule(scheduleOrderId: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const stop = await prisma.deliveryScheduleOrder.findUnique({
                where: { id: scheduleOrderId },
                include: { scheduleVehicle: true },
            });
            if (!stop) throw new NotFoundError('Stop', scheduleOrderId);

            if (stop.status === 'PLANNED' || stop.status === 'CANCELLED') {
                // Hard delete for planned/cancelled stops
                await prisma.deliveryScheduleOrder.delete({
                    where: { id: scheduleOrderId },
                });
            } else {
                // Cancel for LINKED/GENERATED (keep DO intact)
                await prisma.deliveryScheduleOrder.update({
                    where: { id: scheduleOrderId },
                    data: { status: 'CANCELLED' },
                });
            }

            const sv = stop.scheduleVehicle;
            if (sv) {
                revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
            }
            return { success: true };
        });
    },
);

// NOTE: generateDeliveryOrderFromStop moved to ./delivery-orders.ts.

/**
 * Reorder stops within a trip. Accepts ordered array of stop IDs.
 */
export const reorderStops = withTenant(async function reorderStops(
    tripId: string,
    stopIds: string[],
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const trip = await prisma.deliveryScheduleVehicle.findUnique({
            where: { id: tripId },
            include: {
                orders: { select: { id: true, scheduleVehicleId: true } },
            },
        });
        if (!trip) throw new NotFoundError('Trip', tripId);

        // Verify all stopIds belong to this trip
        const tripStopIds = new Set(trip.orders.map((o) => o.id));
        if (stopIds.some((id) => !tripStopIds.has(id))) {
            throw new BusinessRuleError(
                'Beberapa stop ID bukan milik trip ini.',
            );
        }

        // Update sequence for each stop
        await prisma.$transaction(
            stopIds.map((stopId, index) =>
                prisma.deliveryScheduleOrder.update({
                    where: { id: stopId },
                    data: { sequence: index },
                }),
            ),
        );

        revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
        return { success: true };
    });
});

/**
 * Quick-add: transactional action to add a stop to a trip (or create trip + stop).
 * Supports: SO delivery, non-delivery activities, planned items.
 */
export const quickAddStop = withTenant(async function quickAddStop(
    scheduleId: string,
    data: {
        // Trip selection (existing or create new)
        existingTripId?: string;
        // New trip params (if no existingTripId)
        vehicleId?: string;
        transportMode?: TransportMode;
        departureDate: Date;
        runNumber?: string;
        externalProvider?: string;
        externalPlate?: string;
        externalDriver?: string;
        // Stop params
        activityType?: ActivityType;
        salesOrderId?: string;
        activityLabel?: string;
        activityCustomer?: string;
        plannedWeightKg?: number;
        notes?: string;
        // Planned items (optional)
        plannedItems?: Array<{
            salesOrderItemId: string;
            plannedQuantity: number;
        }>;
    },
) {
    return safeAction(async () => {
        await requireSalesAccess();

        const schedule = await prisma.deliverySchedule.findUnique({
            where: { id: scheduleId },
        });
        if (!schedule) throw new NotFoundError('Jadwal Kirim', scheduleId);

        const activityType = data.activityType || 'DELIVERY';

        // Validate stop source
        const sourceCheck = validateStopSource(
            activityType,
            data.salesOrderId,
            data.activityLabel,
        );
        if (!sourceCheck.ok) throw new BusinessRuleError(sourceCheck.error!);

        // Validate SO if delivery
        if (data.salesOrderId) {
            const so = await prisma.salesOrder.findUnique({
                where: { id: data.salesOrderId },
            });
            if (!so) throw new NotFoundError('Sales Order', data.salesOrderId);
            if (!isSOSchedulable(so.status)) {
                throw new BusinessRuleError(
                    `SO "${so.orderNumber}" tidak bisa dijadwalkan.`,
                );
            }
        }

        let tripId: string;

        if (data.existingTripId) {
            // Use existing trip
            const trip = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: data.existingTripId },
            });
            if (!trip) throw new NotFoundError('Trip', data.existingTripId);
            if (trip.scheduleId !== scheduleId) {
                throw new BusinessRuleError('Trip bukan milik jadwal ini.');
            }
            if (trip.status !== 'PLANNED' && trip.status !== 'CONFIRMED') {
                throw new BusinessRuleError(
                    `Trip dengan status "${trip.status}" tidak bisa menerima stop baru.`,
                );
            }
            tripId = trip.id;
        } else {
            // Create new trip
            const transportMode = data.transportMode || 'INTERNAL_FLEET';
            const modeCheck = validateTransportMode(
                transportMode,
                data.vehicleId,
            );
            if (!modeCheck.ok) throw new BusinessRuleError(modeCheck.error!);

            if (transportMode === 'INTERNAL_FLEET' && data.vehicleId) {
                const vehicle = await prisma.vehicle.findUnique({
                    where: { id: data.vehicleId },
                });
                if (!vehicle)
                    throw new NotFoundError('Kendaraan', data.vehicleId);
                if (vehicle.status !== 'ACTIVE') {
                    throw new BusinessRuleError(
                        `Kendaraan "${vehicle.plateNumber}" tidak aktif.`,
                    );
                }
            }

            const weekCheck = validateDepartureInWeek(
                data.departureDate,
                schedule.weekStart,
                schedule.weekEnd,
            );
            if (!weekCheck.ok) throw new BusinessRuleError(weekCheck.error!);

            const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
                where: { scheduleId },
                _max: { sequence: true },
            });

            const newTrip = await prisma.deliveryScheduleVehicle.create({
                data: {
                    scheduleId,
                    vehicleId: data.vehicleId || null,
                    transportMode,
                    departureDate: data.departureDate,
                    runNumber: data.runNumber || null,
                    externalProvider: data.externalProvider || null,
                    externalPlate: data.externalPlate || null,
                    externalDriver: data.externalDriver || null,
                    sequence: (maxSeq._max.sequence ?? -1) + 1,
                    status: 'PLANNED',
                },
            });
            tripId = newTrip.id;
        }

        // Create stop
        const maxStopSeq = await prisma.deliveryScheduleOrder.aggregate({
            where: { scheduleVehicleId: tripId },
            _max: { sequence: true },
        });

        const stop = await prisma.deliveryScheduleOrder.create({
            data: {
                scheduleVehicleId: tripId,
                salesOrderId: data.salesOrderId || null,
                activityType,
                activityLabel: data.activityLabel || null,
                activityCustomer: data.activityCustomer || null,
                plannedWeightKg: data.plannedWeightKg ?? null,
                notes: data.notes || null,
                sequence: (maxStopSeq._max.sequence ?? -1) + 1,
                status: 'PLANNED',
            },
        });

        // Create planned items if provided
        if (data.plannedItems && data.plannedItems.length > 0) {
            await prisma.deliveryScheduleOrderItem.createMany({
                data: data.plannedItems.map((item) => ({
                    scheduleOrderId: stop.id,
                    salesOrderItemId: item.salesOrderItemId,
                    plannedQuantity: item.plannedQuantity,
                })),
            });
        }

        revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
        return { tripId, stop };
    });
});

/**
 * Update planned items for a stop.
 * Validates planned quantities against residual.
 */
export const updateStopPlannedItems = withTenant(
    async function updateStopPlannedItems(
        stopId: string,
        items: Array<{
            salesOrderItemId: string;
            plannedQuantity: number;
        }>,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            const stop = await prisma.deliveryScheduleOrder.findUnique({
                where: { id: stopId },
                include: {
                    scheduleVehicle: { include: { schedule: true } },
                    plannedItems: true,
                },
            });
            if (!stop) throw new NotFoundError('Stop', stopId);
            if (stop.status === 'CANCELLED') {
                throw new BusinessRuleError('Stop sudah dibatalkan.');
            }

            // Validate each planned item
            for (const item of items) {
                const soi = await prisma.salesOrderItem.findUnique({
                    where: { id: item.salesOrderItemId },
                });
                if (!soi)
                    throw new NotFoundError(
                        'Sales Order Item',
                        item.salesOrderItemId,
                    );

                // Compute residual for this item
                const totalDelivered = Number(soi.deliveredQty);
                const otherPlanned =
                    await prisma.deliveryScheduleOrderItem.aggregate({
                        where: {
                            salesOrderItemId: item.salesOrderItemId,
                            scheduleOrderId: { not: stopId },
                            scheduleOrder: { status: { not: 'CANCELLED' } },
                        },
                        _sum: { plannedQuantity: true },
                    });
                const otherPlannedQty = Number(
                    otherPlanned._sum.plannedQuantity || 0,
                );
                const residual =
                    Number(soi.quantity) - totalDelivered - otherPlannedQty;

                if (item.plannedQuantity <= 0) {
                    throw new BusinessRuleError(
                        `Jumlah rencana untuk item harus lebih dari 0.`,
                    );
                }
                if (item.plannedQuantity > residual) {
                    throw new BusinessRuleError(
                        `Jumlah rencana (${item.plannedQuantity}) melebihi sisa yang tersedia (${residual}).`,
                    );
                }
            }

            // Delete existing planned items and recreate
            await prisma.deliveryScheduleOrderItem.deleteMany({
                where: { scheduleOrderId: stopId },
            });

            if (items.length > 0) {
                await prisma.deliveryScheduleOrderItem.createMany({
                    data: items.map((item) => ({
                        scheduleOrderId: stopId,
                        salesOrderItemId: item.salesOrderItemId,
                        plannedQuantity: item.plannedQuantity,
                    })),
                });
            }

            revalidatePath(
                `/sales/delivery-schedules/${stop.scheduleVehicle.scheduleId}`,
            );
            return { success: true };
        });
    },
);
