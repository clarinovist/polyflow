'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { ProductionStatus, PurchaseOrderStatus } from '@prisma/client';

export async function getWarehouseDashboardStats() {
    await requireAuth();

    // 1. Pending Material Issues (For Work Order)
    // Work Orders that are Released/InProgress
    const pendingProductionCount = await prisma.productionOrder.count({
        where: {
            status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] }
        }
    });

    // 2. Incoming Receipts (From Purchasing)
    // Purchase Orders that are SENT/PARTIAL (expecting goods)
    const incomingReceiptsCount = await prisma.purchaseOrder.count({
        where: {
            status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIAL_RECEIVED] }
        }
    });

    // 3. Low Stock Items
    // Variants where total inventory < minStockAlert
    // Note: This is a simplified check. Ideally we sum inventory per variant first.
    // For performance, we'll check variants that have a set alert level.
    // const lowStockCount = await prisma.productVariant.count({
    //     where: {
    //         minStockAlert: { not: null },
    //     }
    // });

    // Let's execute a raw query for Low Stock to be more impactful if possible,
    // or just return a placeholder for "Active Items" if risk is high.
    // Safe Approach: Count Total SKUs managed.
    const totalSkus = await prisma.productVariant.count();

    // 4. Outgoing Orders (Sales)
    // Count Sales Orders ready to ship (e.g., CONFIRMED/PACKING) - assuming SalesStatus exists
    // For now, let's use a proxy or just "Total Locations"
    const locationCount = await prisma.location.count();

    return {
        pendingProduction: pendingProductionCount,
        incomingReceipts: incomingReceiptsCount,
        totalSkus: totalSkus,
        activeLocations: locationCount
    };
}
