'use server';

import { withTenant } from "@/lib/core/tenant";
import { InventoryCoreService } from '@/services/inventory/core-service';
import { InventoryMovementService } from '@/services/inventory/movement-service';
import { InventoryQueryService } from '@/services/inventory/query-service';
import * as ReservationService from '@/services/inventory/reservation-service';
import * as AnalyticsService from '@/services/inventory/analytics-service';
import { getStockLedger } from '@/services/inventory/stock-ledger-service';
import { transferStockSchema, TransferStockValues, bulkAdjustStockSchema, BulkAdjustStockValues, bulkTransferStockSchema, BulkTransferStockValues, createReservationSchema, CreateReservationValues, cancelReservationSchema, CancelReservationValues, adjustStockWithBatchSchema, AdjustStockWithBatchValues } from '@/lib/schemas/inventory';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';
import { safeAction, ValidationError } from '@/lib/errors/errors';

export const getInventoryStats = withTenant(
async function getInventoryStats(searchParams?: { locationId?: string; type?: string }) {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getStats(searchParams);
    });
}
);

export const getLocations = withTenant(
async function getLocations() {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getLocations();
    });
}
);

export const getProductVariants = withTenant(
async function getProductVariants() {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getProductVariants();
    });
}
);

export const getAvailableBatches = withTenant(
async function getAvailableBatches(productVariantId: string, locationId: string) {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getAvailableBatches(productVariantId, locationId);
    });
}
);

export const transferStock = withTenant(
async function transferStock(data: TransferStockValues, _userId?: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const currentUserId = session.user.id;

        logger.info("Transfer Action Started", { data, module: 'inventory' });
        const result = transferStockSchema.safeParse(data);
        if (!result.success) {
            logger.error("Validation Failed", { error: result.error, module: 'inventory' });
            throw new ValidationError(result.error.issues[0].message);
        }

        await InventoryMovementService.transferStock(result.data, currentUserId);
        const { logActivity } = await import('@/lib/tools/audit');
        await logActivity({
            userId: currentUserId,
            action: 'TRANSFER_STOCK',
            entityType: 'Inventory',
            entityId: result.data.productVariantId,
            details: `Transferred ${result.data.quantity} units from ${result.data.sourceLocationId} to ${result.data.destinationLocationId}`
        });
        revalidatePath('/warehouse/inventory');
        revalidatePath('/warehouse/inventory/history');
    });
}
);

export const transferStockBulk = withTenant(
async function transferStockBulk(data: BulkTransferStockValues, _userId?: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const currentUserId = session.user.id;

        const result = bulkTransferStockSchema.safeParse(data);
        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        await InventoryMovementService.transferStockBulk(result.data, currentUserId);
        const { logActivity } = await import('@/lib/tools/audit');
        await logActivity({
            userId: currentUserId,
            action: 'TRANSFER_STOCK_BULK',
            entityType: 'Inventory',
            entityId: 'BULK',
            details: `Bulk transferred ${result.data.items.length} items from ${result.data.sourceLocationId} to ${result.data.destinationLocationId}`
        });
        revalidatePath('/warehouse/inventory');
        revalidatePath('/warehouse/inventory/history');
    });
}
);

export const adjustStock = withTenant(
async function adjustStock(data: AdjustStockWithBatchValues, _userId?: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const currentUserId = session.user.id;

        const result = adjustStockWithBatchSchema.safeParse(data);
        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        await InventoryMovementService.adjustStock(result.data, currentUserId);
        const { logActivity } = await import('@/lib/tools/audit');
        await logActivity({
            userId: currentUserId,
            action: 'ADJUST_STOCK',
            entityType: 'Inventory',
            entityId: result.data.productVariantId,
            details: `Adjusted stock by ${result.data.quantity} (${result.data.type}) at ${result.data.locationId}`
        });
        revalidatePath('/warehouse/inventory');
        revalidatePath('/warehouse/inventory/history');
    });
}
);

export const adjustStockBulk = withTenant(
async function adjustStockBulk(data: BulkAdjustStockValues, _userId?: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const currentUserId = session.user.id;

        const result = bulkAdjustStockSchema.safeParse(data);
        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        await InventoryMovementService.adjustStockBulk(result.data, currentUserId);
        const { logActivity } = await import('@/lib/tools/audit');
        await logActivity({
            userId: currentUserId,
            action: 'ADJUST_STOCK_BULK',
            entityType: 'Inventory',
            entityId: 'BULK',
            details: `Bulk adjusted stock for ${result.data.items.length} items at ${result.data.locationId}`
        });
        revalidatePath('/warehouse/inventory');
        revalidatePath('/warehouse/inventory/history');
    });
}
);

export const updateThreshold = withTenant(
async function updateThreshold(productVariantId: string, minStockAlert: number) {
    return safeAction(async () => {
        await requireAuth();
        await InventoryCoreService.updateThreshold(productVariantId, minStockAlert);
        revalidatePath('/dashboard');
        revalidatePath('/warehouse/inventory');
    });
}
);

export const getStockMovements = withTenant(
async function getStockMovements(limit = 50, startDate?: Date, endDate?: Date) {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getStockMovements({ limit, startDate, endDate });
    });
}
);

export const getDashboardStats = withTenant(
async function getDashboardStats() {
    return safeAction(async () => {
        await requireAuth();
        return await InventoryQueryService.getDashboardStats();
    });
}
);

export const getSuggestedPurchases = withTenant(
async function getSuggestedPurchases() {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getSuggestedPurchases();
    });
}
);

export const getInventoryValuation = withTenant(
async function getInventoryValuation() {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getInventoryValuation();
    });
}
);

export const getInventoryAsOf = withTenant(
async function getInventoryAsOf(targetDate: Date, locationId?: string) {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getInventoryAsOf(targetDate, locationId);
    });
}
);

export const getStockHistory = withTenant(
async function getStockHistory(
    productVariantId: string,
    startDate: Date,
    endDate: Date,
    locationId?: string
) {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getStockHistory(productVariantId, startDate, endDate, locationId);
    });
}
);

export const getStockLedgerAction = withTenant(
async function getStockLedgerAction(
    productVariantId: string,
    startDate: Date,
    endDate: Date,
    locationId?: string
) {
    return safeAction(async () => {
        await requireAuth();
        return await getStockLedger(productVariantId, startDate, endDate, locationId);
    });
}
);

export const createStockReservation = withTenant(
async function createStockReservation(data: CreateReservationValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = createReservationSchema.safeParse(data);
        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        await ReservationService.createStockReservation(result.data);
        revalidatePath('/warehouse/inventory');
    });
}
);

export const cancelStockReservation = withTenant(
async function cancelStockReservation(data: CancelReservationValues) {
    return safeAction(async () => {
        await requireAuth();
        const result = cancelReservationSchema.safeParse(data);
        if (!result.success) {
            throw new ValidationError(result.error.issues[0].message);
        }

        await ReservationService.cancelStockReservation(result.data);
        revalidatePath('/warehouse/inventory');
    });
}
);

export const getActiveReservations = withTenant(
async function getActiveReservations(locationId?: string, productVariantId?: string) {
    return safeAction(async () => {
        await requireAuth();
        return await ReservationService.getActiveReservations(locationId, productVariantId);
    });
}
);

// ============================================
// ANALYTICS & INSIGHTS (Phase 4)
// ============================================

export const getInventoryTurnover = withTenant(
async function getInventoryTurnover(periodDays = 30) {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getInventoryTurnover(periodDays);
    });
}
);

export const getDaysOfInventoryOnHand = withTenant(
async function getDaysOfInventoryOnHand(periodDays = 30) {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getDaysOfInventoryOnHand(periodDays);
    });
}
);

export const getStockMovementTrends = withTenant(
async function getStockMovementTrends(period: 'week' | 'month' | 'quarter' = 'month') {
    return safeAction(async () => {
        await requireAuth();
        return await AnalyticsService.getStockMovementTrends(period);
    });
}
);

export const acknowledgeHandover = withTenant(
async function acknowledgeHandover(movementId: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const currentUserId = session.user.id;

        const movement = await (await import('@/lib/core/prisma')).prisma.stockMovement.findUnique({ where: { id: movementId } });
        if (!movement) throw new ValidationError('Movement not found');

        // Append an acknowledgement note to the reference for auditability
        const newReference = `${movement.reference || ''}`.trim() + ` | ACK:${currentUserId}:${new Date().toISOString()}`;

        await (await import('@/lib/core/prisma')).prisma.stockMovement.update({
            where: { id: movementId },
            data: { reference: newReference }
        });

        // Create audit log for traceability
        const { logActivity } = await import('@/lib/tools/audit');
        await logActivity({
            userId: currentUserId,
            action: 'ACKNOWLEDGE_HANDOVER',
            entityType: 'StockMovement',
            entityId: movementId,
            details: `Acknowledged transfer to ${movement.toLocationId}`
        });

        revalidatePath('/production/inventory');
    });
}
);

export const getRealtimeStock = withTenant(
async function getRealtimeStock(locationId: string, productVariantId: string) {
    return safeAction(async () => {
        await requireAuth();
        const inventory = await (await import('@/lib/core/prisma')).prisma.inventory.findUnique({
            where: { locationId_productVariantId: { locationId, productVariantId } },
            select: { quantity: true }
        });
        return inventory?.quantity.toNumber() || 0;
    });
}
);

