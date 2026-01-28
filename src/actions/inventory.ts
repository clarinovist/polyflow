'use server';

import { InventoryService } from '@/services/inventory-service';
import { transferStockSchema, TransferStockValues, bulkAdjustStockSchema, BulkAdjustStockValues, bulkTransferStockSchema, BulkTransferStockValues, createReservationSchema, CreateReservationValues, cancelReservationSchema, CancelReservationValues, adjustStockWithBatchSchema, AdjustStockWithBatchValues } from '@/lib/schemas/inventory';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';

export async function getInventoryStats(searchParams?: { locationId?: string; type?: string }) {
    await requireAuth();
    return await InventoryService.getStats(searchParams);
}

export async function getLocations() {
    await requireAuth();
    return await InventoryService.getLocations();
}

export async function getProductVariants() {
    await requireAuth();
    return await InventoryService.getProductVariants();
}

export async function getAvailableBatches(productVariantId: string, locationId: string) {
    await requireAuth();
    return await InventoryService.getAvailableBatches(productVariantId, locationId);
}

export async function transferStock(data: TransferStockValues, _userId?: string) {
    const session = await requireAuth();
    const currentUserId = session.user.id;

    console.log("Transfer Action Started", data);
    const result = transferStockSchema.safeParse(data);
    if (!result.success) {
        console.error("Validation Failed", result.error);
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.transferStock(result.data, currentUserId);
        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        console.error("Transfer Error", error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function transferStockBulk(data: BulkTransferStockValues, _userId?: string) {
    const session = await requireAuth();
    const currentUserId = session.user.id;

    const result = bulkTransferStockSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.transferStockBulk(result.data, currentUserId);
        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        console.error("Bulk Transfer Error", error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function adjustStock(data: AdjustStockWithBatchValues, _userId?: string) {
    const session = await requireAuth();
    const currentUserId = session.user.id;

    const result = adjustStockWithBatchSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.adjustStock(result.data, currentUserId);
        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function adjustStockBulk(data: BulkAdjustStockValues, _userId?: string) {
    const session = await requireAuth();
    const currentUserId = session.user.id;

    const result = bulkAdjustStockSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.adjustStockBulk(result.data, currentUserId);
        revalidatePath('/dashboard/inventory');
        revalidatePath('/dashboard/inventory/history');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function updateThreshold(productVariantId: string, minStockAlert: number) {
    await requireAuth();
    try {
        await InventoryService.updateThreshold(productVariantId, minStockAlert);
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

export async function getStockMovements(limit = 50) {
    await requireAuth();
    return await InventoryService.getStockMovements(limit);
}

export async function getDashboardStats() {
    await requireAuth();
    return await InventoryService.getDashboardStats();
}

export async function getSuggestedPurchases() {
    await requireAuth();
    return await InventoryService.getSuggestedPurchases();
}

export async function getInventoryValuation() {
    await requireAuth();
    return await InventoryService.getInventoryValuation();
}

export async function getInventoryAsOf(targetDate: Date, locationId?: string) {
    await requireAuth();
    return await InventoryService.getInventoryAsOf(targetDate, locationId);
}

export async function getStockHistory(
    productVariantId: string,
    startDate: Date,
    endDate: Date,
    locationId?: string
) {
    await requireAuth();
    return await InventoryService.getStockHistory(productVariantId, startDate, endDate, locationId);
}

export async function createStockReservation(data: CreateReservationValues) {
    await requireAuth();
    const result = createReservationSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.createStockReservation(result.data);
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create reservation" };
    }
}

export async function cancelStockReservation(data: CancelReservationValues) {
    await requireAuth();
    const result = cancelReservationSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await InventoryService.cancelStockReservation(result.data);
        revalidatePath('/dashboard/inventory');
        return { success: true };
    } catch (_error) {
        return { success: false, error: "Failed to cancel reservation" };
    }
}

export async function getActiveReservations(locationId?: string, productVariantId?: string) {
    await requireAuth();
    return await InventoryService.getActiveReservations(locationId, productVariantId);
}

// ============================================
// ANALYTICS & INSIGHTS (Phase 4)
// ============================================

export async function getInventoryTurnover(periodDays = 30) {
    await requireAuth();
    return await InventoryService.getInventoryTurnover(periodDays);
}

export async function getDaysOfInventoryOnHand(periodDays = 30) {
    await requireAuth();
    return await InventoryService.getDaysOfInventoryOnHand(periodDays);
}

export async function getStockMovementTrends(period: 'week' | 'month' | 'quarter' = 'month') {
    await requireAuth();
    return await InventoryService.getStockMovementTrends(period);
}

export async function acknowledgeHandover(movementId: string) {
    const session = await requireAuth();
    const currentUserId = session.user.id;

    try {
        const movement = await (await import('@/lib/prisma')).prisma.stockMovement.findUnique({ where: { id: movementId } });
        if (!movement) return { success: false, error: 'Movement not found' };

        // Append an acknowledgement note to the reference for auditability
        const newReference = `${movement.reference || ''}`.trim() + ` | ACK:${currentUserId}:${new Date().toISOString()}`;

        await (await import('@/lib/prisma')).prisma.stockMovement.update({
            where: { id: movementId },
            data: { reference: newReference }
        });

        // Create audit log for traceability
        const { logActivity } = await import('@/lib/audit');
        await logActivity({
            userId: currentUserId,
            action: 'ACKNOWLEDGE_HANDOVER',
            entityType: 'StockMovement',
            entityId: movementId,
            details: `Acknowledged transfer to ${movement.toLocationId}`
        });

        revalidatePath('/production/inventory');
        return { success: true };
    } catch (error) {
        console.error('Acknowledge handover error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

export async function getRealtimeStock(locationId: string, productVariantId: string) {
    await requireAuth();
    const inventory = await (await import('@/lib/prisma')).prisma.inventory.findUnique({
        where: { locationId_productVariantId: { locationId, productVariantId } },
        select: { quantity: true }
    });
    return inventory?.quantity.toNumber() || 0;
}
