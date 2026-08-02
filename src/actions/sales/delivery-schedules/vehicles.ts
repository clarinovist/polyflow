'use server';

import {
    withTenant,
    prisma,
    requireSalesAccess,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    canRemoveTrip,
    revalidatePath,
} from './shared';

// ============================================
// Vehicle Assignment Actions
// ============================================

/**
 * Backward-compat alias: assignVehicleToSchedule now creates a trip.
 * Kept for existing callers; new code should use createScheduleTrip.
 */
export const assignVehicleToSchedule = withTenant(
    async function assignVehicleToSchedule(
        scheduleId: string,
        vehicleId: string,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            const schedule = await prisma.deliverySchedule.findUnique({
                where: { id: scheduleId },
            });
            if (!schedule) throw new NotFoundError('Jadwal Kirim', scheduleId);

            const vehicle = await prisma.vehicle.findUnique({
                where: { id: vehicleId },
            });
            if (!vehicle) throw new NotFoundError('Kendaraan', vehicleId);
            if (vehicle.status !== 'ACTIVE') {
                throw new BusinessRuleError(
                    `Kendaraan "${vehicle.plateNumber}" tidak aktif.`,
                );
            }

            // Backward compat: no departureDate required, create with null
            const existing = await prisma.deliveryScheduleVehicle.findFirst({
                where: { scheduleId, vehicleId, departureDate: null },
            });
            if (existing) {
                throw new BusinessRuleError(
                    `Kendaraan "${vehicle.plateNumber}" sudah ditugaskan ke jadwal ini.`,
                );
            }

            const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
                where: { scheduleId },
                _max: { sequence: true },
            });

            const assigned = await prisma.deliveryScheduleVehicle.create({
                data: {
                    scheduleId,
                    vehicleId,
                    sequence: (maxSeq._max.sequence ?? -1) + 1,
                    status: 'PLANNED',
                },
            });

            revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
            return assigned;
        });
    },
);

/**
 * Remove a trip (with guard checks).
 */
export const removeVehicleFromSchedule = withTenant(
    async function removeVehicleFromSchedule(scheduleVehicleId: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const sv = await prisma.deliveryScheduleVehicle.findUnique({
                where: { id: scheduleVehicleId },
                include: { orders: true },
            });
            if (!sv) throw new NotFoundError('Trip', scheduleVehicleId);

            // Guard: canRemoveTrip
            const removeCheck = canRemoveTrip(sv.status, sv.orders);
            if (!removeCheck.ok) {
                throw new BusinessRuleError(removeCheck.error!);
            }

            // Delete stops first, then trip
            await prisma.deliveryScheduleOrder.deleteMany({
                where: { scheduleVehicleId },
            });

            await prisma.deliveryScheduleVehicle.delete({
                where: { id: scheduleVehicleId },
            });

            revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
            return { success: true };
        });
    },
);
