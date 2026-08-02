'use server';

import {
    withTenant,
    prisma,
    requireSalesAccess,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    computeDeliveryTotals,
    isDOAlreadyAssigned,
    canGenerateSJ,
    RateType,
    Prisma,
    revalidatePath,
} from './shared';

// ============================================
// Stop Actions — DO linkage & generation
// ============================================

/**
 * Assign a delivery order to a trip (existing flow, enhanced with salesOrderId backfill).
 */
export const assignOrderToSchedule = withTenant(
    async function assignOrderToSchedule(
        scheduleVehicleId: string,
        deliveryOrderId: string,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            const sv = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: scheduleVehicleId },
                include: { vehicle: true, schedule: true },
            });
            if (!sv) throw new NotFoundError('Trip', scheduleVehicleId);

            // R-Trip: only PLANNED/CONFIRMED trips accept new stops
            if (sv.status !== 'PLANNED' && sv.status !== 'CONFIRMED') {
                throw new BusinessRuleError(
                    `Trip dengan status "${sv.status}" tidak bisa menerima stop baru.`,
                );
            }

            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: deliveryOrderId },
                include: { salesOrder: true },
            });
            if (!doRecord)
                throw new NotFoundError('Surat Jalan', deliveryOrderId);

            // R-S3: DO not already assigned to active stop
            const allStops = await prisma.deliveryScheduleOrder.findMany({
                where: { deliveryOrderId, status: { not: 'CANCELLED' } },
                select: { id: true, deliveryOrderId: true, status: true },
            });
            if (isDOAlreadyAssigned(deliveryOrderId, allStops)) {
                throw new BusinessRuleError(
                    `Surat Jalan "${doRecord.orderNumber}" sudah dijadwalkan.`,
                );
            }

            // Auto-apply tariff from VehicleTariff (route-aware)
            const now = new Date();
            const routeKey = doRecord.appliedRouteName?.trim() || null;

            const tariffWhere: Prisma.VehicleTariffWhereInput = {
                validFrom: { lte: now },
                OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            };
            if (sv.vehicleId) {
                tariffWhere.vehicleId = sv.vehicleId;
            }
            const candidates = await prisma.vehicleTariff.findMany({
                where: tariffWhere,
                orderBy: { validFrom: 'desc' },
            });

            let tariff = null;
            if (routeKey) {
                tariff = candidates.find(
                    (t) =>
                        t.routeName?.trim().toLowerCase() ===
                        routeKey.toLowerCase(),
                );
            }
            if (!tariff) {
                tariff = candidates.find(
                    (t) => !t.routeName || t.routeName.trim() === '',
                );
            }
            if (!tariff) {
                tariff = candidates[0] ?? null;
            }

            // Default sequence
            const maxSeq = await prisma.deliveryScheduleOrder.aggregate({
                where: { scheduleVehicleId },
                _max: { sequence: true },
            });

            const assigned = await prisma.deliveryScheduleOrder.create({
                data: {
                    scheduleVehicleId,
                    deliveryOrderId,
                    salesOrderId: doRecord.salesOrderId, // backfill from DO
                    plannedWeightKg: doRecord.estimatedWeightKg
                        ? Number(doRecord.estimatedWeightKg)
                        : null,
                    sequence: (maxSeq._max.sequence ?? -1) + 1,
                    status: 'LINKED',
                },
            });

            // Update DO with vehicle + tariff snapshot
            if (tariff) {
                const weight = doRecord.estimatedWeightKg
                    ? Number(doRecord.estimatedWeightKg)
                    : null;
                const { totalCost, totalCharge } = computeDeliveryTotals({
                    rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
                    costRate: Number(tariff.costRate),
                    chargeRate: Number(tariff.chargeRate),
                    weightKg: weight,
                    minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
                });

                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId },
                    data: {
                        vehicleId: sv.vehicleId,
                        appliedRateType: tariff.rateType,
                        appliedCostRate: tariff.costRate,
                        appliedChargeRate: tariff.chargeRate,
                        appliedRouteName:
                            tariff.routeName ??
                            doRecord.appliedRouteName ??
                            null,
                        totalCost,
                        totalCharge,
                    },
                });
            } else {
                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId },
                    data: { vehicleId: sv.vehicleId },
                });
            }

            // Sync SO shipping cost from DO charges
            try {
                const { syncSalesOrderShippingFromDeliveries } =
                    await import('@/services/sales/delivery-shipping-sync');
                await syncSalesOrderShippingFromDeliveries(
                    doRecord.salesOrderId,
                    {
                        userId: session.user.id,
                    },
                );
            } catch (err) {
                console.warn(
                    '[delivery-shipping-sync] sync failed (non-blocking):',
                    err,
                );
            }

            revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
            return assigned;
        });
    },
);

/**
 * Link an existing DO to a planned stop.
 */
export const linkDeliveryOrderToStop = withTenant(
    async function linkDeliveryOrderToStop(
        stopId: string,
        deliveryOrderId: string,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            const stop = await prisma.deliveryScheduleOrder.findUnique({
                where: { id: stopId },
                include: {
                    scheduleVehicle: {
                        include: { schedule: true, vehicle: true },
                    },
                },
            });
            if (!stop) throw new NotFoundError('Stop', stopId);
            if (stop.status === 'CANCELLED') {
                throw new BusinessRuleError('Stop sudah dibatalkan.');
            }

            // R-Trip: only PLANNED/CONFIRMED trips accept link changes
            if (
                stop.scheduleVehicle.status !== 'PLANNED' &&
                stop.scheduleVehicle.status !== 'CONFIRMED'
            ) {
                throw new BusinessRuleError(
                    `Trip dengan status "${stop.scheduleVehicle.status}" tidak bisa diubah.`,
                );
            }

            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: deliveryOrderId },
                include: { salesOrder: true },
            });
            if (!doRecord)
                throw new NotFoundError('Surat Jalan', deliveryOrderId);

            // R-S: If stop already has salesOrderId, validate DO belongs to same SO
            if (
                stop.salesOrderId &&
                doRecord.salesOrderId !== stop.salesOrderId
            ) {
                throw new BusinessRuleError(
                    `Surat Jalan "${doRecord.orderNumber}" berasal dari Sales Order yang berbeda dengan stop ini.`,
                );
            }

            // R-S3: DO not already assigned
            const allStops = await prisma.deliveryScheduleOrder.findMany({
                where: { deliveryOrderId, status: { not: 'CANCELLED' } },
                select: { id: true, deliveryOrderId: true, status: true },
            });
            if (
                isDOAlreadyAssigned(
                    deliveryOrderId,
                    allStops.filter((s) => s.id !== stopId),
                )
            ) {
                throw new BusinessRuleError(
                    `Surat Jalan "${doRecord.orderNumber}" sudah dijadwalkan.`,
                );
            }

            const updated = await prisma.deliveryScheduleOrder.update({
                where: { id: stopId },
                data: {
                    deliveryOrderId,
                    salesOrderId: stop.salesOrderId ?? doRecord.salesOrderId, // fill if missing
                    status: 'LINKED',
                },
            });

            // Apply tariff + sync (same as assignOrderToSchedule)
            const sv = stop.scheduleVehicle;
            const now = new Date();
            const routeKey = doRecord.appliedRouteName?.trim() || null;

            const tariffWhere: Prisma.VehicleTariffWhereInput = {
                validFrom: { lte: now },
                OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            };
            if (sv.vehicleId) {
                tariffWhere.vehicleId = sv.vehicleId;
            }
            const candidates = await prisma.vehicleTariff.findMany({
                where: tariffWhere,
                orderBy: { validFrom: 'desc' },
            });

            let tariff = null;
            if (routeKey) {
                tariff = candidates.find(
                    (t) =>
                        t.routeName?.trim().toLowerCase() ===
                        routeKey.toLowerCase(),
                );
            }
            if (!tariff)
                tariff = candidates.find(
                    (t) => !t.routeName || t.routeName.trim() === '',
                );
            if (!tariff) tariff = candidates[0] ?? null;

            if (tariff) {
                const weight = doRecord.estimatedWeightKg
                    ? Number(doRecord.estimatedWeightKg)
                    : null;
                const { totalCost, totalCharge } = computeDeliveryTotals({
                    rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
                    costRate: Number(tariff.costRate),
                    chargeRate: Number(tariff.chargeRate),
                    weightKg: weight,
                    minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
                });

                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId },
                    data: {
                        vehicleId: sv.vehicleId,
                        appliedRateType: tariff.rateType,
                        appliedCostRate: tariff.costRate,
                        appliedChargeRate: tariff.chargeRate,
                        appliedRouteName:
                            tariff.routeName ??
                            doRecord.appliedRouteName ??
                            null,
                        totalCost,
                        totalCharge,
                    },
                });
            } else {
                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId },
                    data: { vehicleId: sv.vehicleId },
                });
            }

            try {
                const { syncSalesOrderShippingFromDeliveries } =
                    await import('@/services/sales/delivery-shipping-sync');
                await syncSalesOrderShippingFromDeliveries(
                    doRecord.salesOrderId,
                    { userId: session.user.id },
                );
            } catch (err) {
                console.warn(
                    '[delivery-shipping-sync] sync failed (non-blocking):',
                    err,
                );
            }

            revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
            return updated;
        });
    },
);

/**
 * Generate a Delivery Order from a planned stop.
 * Reuses createDeliveryOrderFromSalesOrder from delivery-fulfillment-service
 * which handles: SO status guard, residual qty, SERVICE skip, open DO check.
 * R-D2/D3/D4.
 */
export const generateDeliveryOrderFromStop = withTenant(
    async function generateDeliveryOrderFromStop(
        stopId: string,
        options?: { sourceLocationId?: string },
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            // Load stop with full context
            const stop = await prisma.deliveryScheduleOrder.findUnique({
                where: { id: stopId },
                include: {
                    salesOrder: true,
                    deliveryOrder: true,
                    scheduleVehicle: {
                        include: { vehicle: true, schedule: true },
                    },
                },
            });
            if (!stop) throw new NotFoundError('Stop', stopId);
            if (stop.status === 'CANCELLED') {
                throw new BusinessRuleError('Stop sudah dibatalkan.');
            }
            if (stop.deliveryOrderId) {
                throw new BusinessRuleError('Stop sudah memiliki Surat Jalan.');
            }
            if (!stop.salesOrderId) {
                throw new BusinessRuleError('Stop tidak memiliki Sales Order.');
            }
            if (!canGenerateSJ(stop.activityType)) {
                throw new BusinessRuleError(
                    `Aktivitas "${stop.activityType}" tidak menghasilkan Surat Jalan.`,
                );
            }

            const trip = stop.scheduleVehicle;

            // sourceLocationId: from options → SO → throw
            const so = await prisma.salesOrder.findUnique({
                where: { id: stop.salesOrderId },
                include: { customer: true },
            });
            const sourceLocationId =
                options?.sourceLocationId || so?.sourceLocationId;
            if (!sourceLocationId) {
                throw new BusinessRuleError(
                    'Lokasi sumber (sourceLocationId) tidak ditemukan.',
                );
            }

            // Reuse the validated service function
            const { createDeliveryOrderFromSalesOrder } =
                await import('@/services/sales/delivery-fulfillment-service');

            // Load planned items for this stop
            const plannedItems =
                await prisma.deliveryScheduleOrderItem.findMany({
                    where: { scheduleOrderId: stopId },
                    select: { salesOrderItemId: true, plannedQuantity: true },
                });

            const deliveryOrder = await createDeliveryOrderFromSalesOrder({
                salesOrderId: stop.salesOrderId,
                sourceLocationId,
                userId: session.user.id,
                vehicleId: trip.vehicleId ?? undefined,
                appliedRouteName: trip.routeName || undefined,
                estimatedWeightKg: stop.plannedWeightKg
                    ? Number(stop.plannedWeightKg)
                    : undefined,
                destinationAddress:
                    so?.customer?.shippingAddress ||
                    so?.customer?.billingAddress ||
                    undefined,
                plannedItems:
                    plannedItems.length > 0
                        ? plannedItems.map((pi) => ({
                              salesOrderItemId: pi.salesOrderItemId,
                              plannedQuantity: Number(pi.plannedQuantity),
                          }))
                        : undefined,
            });

            // Apply tariff snapshot (same logic as assignOrderToSchedule)
            const now = new Date();
            const routeKey = trip.routeName?.trim() || null;

            const tripTariffWhere: Prisma.VehicleTariffWhereInput = {
                validFrom: { lte: now },
                OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            };
            if (trip.vehicleId) {
                tripTariffWhere.vehicleId = trip.vehicleId;
            }
            const candidates = await prisma.vehicleTariff.findMany({
                where: tripTariffWhere,
                orderBy: { validFrom: 'desc' },
            });

            let tariff = null;
            if (routeKey) {
                tariff = candidates.find(
                    (t) =>
                        t.routeName?.trim().toLowerCase() ===
                        routeKey.toLowerCase(),
                );
            }
            if (!tariff)
                tariff = candidates.find(
                    (t) => !t.routeName || t.routeName.trim() === '',
                );
            if (!tariff) tariff = candidates[0] ?? null;

            if (tariff) {
                const weight = stop.plannedWeightKg
                    ? Number(stop.plannedWeightKg)
                    : null;
                const { totalCost, totalCharge } = computeDeliveryTotals({
                    rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
                    costRate: Number(tariff.costRate),
                    chargeRate: Number(tariff.chargeRate),
                    weightKg: weight,
                    minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
                });

                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrder.id },
                    data: {
                        appliedRateType: tariff.rateType as RateType,
                        appliedCostRate: tariff.costRate,
                        appliedChargeRate: tariff.chargeRate,
                        appliedRouteName:
                            tariff.routeName ?? trip.routeName ?? null,
                        totalCost,
                        totalCharge,
                    },
                });
            }

            // Update stop: link DO + status = GENERATED
            await prisma.deliveryScheduleOrder.update({
                where: { id: stopId },
                data: {
                    deliveryOrderId: deliveryOrder.id,
                    status: 'GENERATED',
                },
            });

            // Sync SO shipping cost from DO charges
            try {
                const { syncSalesOrderShippingFromDeliveries } =
                    await import('@/services/sales/delivery-shipping-sync');
                await syncSalesOrderShippingFromDeliveries(stop.salesOrderId, {
                    userId: session.user.id,
                });
            } catch (err) {
                console.warn(
                    '[delivery-shipping-sync] sync failed (non-blocking):',
                    err,
                );
            }

            revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
            return deliveryOrder;
        });
    },
);
