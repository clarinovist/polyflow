'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import * as service from '@/services/sales/vehicle-service-service';

// Every export here must be an async function: sync exports in 'use server' files fail only at `next build`.
async function revalidateServiceViews(vehicleId: string) {
    revalidatePath('/sales/vehicles');
    revalidatePath('/sales/vehicles/km');
    revalidatePath(`/sales/vehicles/${vehicleId}`);
}

export const getVehicleServiceStatus = withTenant(async function getVehicleServiceStatus(vehicleId: string) {
    return safeAction(async () => {
        await requireSalesAccess();
        return service.listVehicleServiceStatus(vehicleId);
    });
});
export const getFleetServiceAlerts = withTenant(async function getFleetServiceAlerts() {
    return safeAction(async () => {
        await requireSalesAccess();
        return service.listFleetServiceAlerts();
    });
});
export const createServiceItem = withTenant(async function createServiceItem(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.createServiceItem(input, session.user.id);
        await revalidateServiceViews(result.vehicleId);
        return result;
    });
});
export const updateServiceItem = withTenant(async function updateServiceItem(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.updateServiceItem(input, session.user.id);
        await revalidateServiceViews(result.vehicleId);
        return result;
    });
});
export const recordVehicleService = withTenant(async function recordVehicleService(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.recordVehicleService(input, session.user.id);
        await revalidateServiceViews(result.vehicleId);
        return result;
    });
});
export const correctVehicleService = withTenant(async function correctVehicleService(input: unknown) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const result = await service.correctVehicleService(input, session.user.id);
        await revalidateServiceViews(result.vehicleId);
        return result;
    });
});
