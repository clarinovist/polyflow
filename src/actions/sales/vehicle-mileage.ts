'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import * as service from '@/services/sales/vehicle-mileage-service';

// Every export here must be an async function: sync exports in 'use server' files fail only at `next build`.
async function revalidateMileageViews(vehicleId: string) {
    revalidatePath('/sales/vehicles');
    revalidatePath('/sales/vehicles/km');
    revalidatePath(`/sales/vehicles/${vehicleId}`);
}

export const getFleetMileageBoard = withTenant(async function getFleetMileageBoard() {
    return safeAction(async () => {
        await requireSalesAccess();
        return service.listFleetMileageBoard();
    });
});
export const startVehicleMileage = withTenant(async function startVehicleMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.startVehicleMileage(input, session.user.id);
        await revalidateMileageViews(result.vehicleId);
        return result;
    });
});
export const finishVehicleMileage = withTenant(async function finishVehicleMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.finishVehicleMileage(input, session.user.id);
        await revalidateMileageViews(result.vehicleId);
        return result;
    });
});
export const correctVehicleMileage = withTenant(async function correctVehicleMileage(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.correctVehicleMileage(input, session.user.id);
        await revalidateMileageViews(result.vehicleId);
        return result;
    });
});
