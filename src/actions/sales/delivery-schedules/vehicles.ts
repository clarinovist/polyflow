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
