'use server';

import { prisma } from '@/lib/prisma';
import {
    createSalesOrderSchema,
    updateSalesOrderSchema,
    shipSalesOrderSchema,
    CreateSalesOrderValues,
    UpdateSalesOrderValues
} from '@/lib/schemas/sales';
import { SalesService } from '@/services/sales-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';
import { catchError } from '@/lib/error-handler';
import { serializeData } from '@/lib/utils';

/**
 * Get all sales orders
 */
export async function getSalesOrders(includeItems = false) {
    await requireAuth();
    const orders = await SalesService.getOrders({ includeItems });
    return serializeData(orders);
}

/**
 * Get sales orders by customer ID
 */
export async function getSalesOrdersByCustomerId(customerId: string) {
    await requireAuth();
    const orders = await SalesService.getOrders({ customerId });
    return serializeData(orders);
}


/**
 * Get sales order by ID with details
 */
export async function getSalesOrderById(id: string) {
    await requireAuth();
    const order = await SalesService.getOrderById(id);
    if (!order) return null;
    return serializeData(order);
}

/**
 * Create a new sales order
 */
export async function createSalesOrder(data: CreateSalesOrderValues) {
    const session = await requireAuth();
    return catchError(async () => {
        const result = createSalesOrderSchema.parse(data);
        const order = await SalesService.createOrder(result, session.user.id);
        revalidatePath('/sales');
        return order;
    });
}

/**
 * Update a sales order
 */
export async function updateSalesOrder(data: UpdateSalesOrderValues) {
    const session = await requireAuth();
    return catchError(async () => {
        const result = updateSalesOrderSchema.parse(data);
        await SalesService.updateOrder(result, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${data.id}`);
        return { id: data.id };
    });
}

/**
 * Confirm a sales order
 */
export async function confirmSalesOrder(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.confirmOrder(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}

export async function markReadyToShip(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.markReadyToShip(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}

/**
 * Ship a sales order (Deduct Stock)
 */
export async function shipSalesOrder(data: { id: string, trackingNumber?: string, carrier?: string }) {
    const session = await requireAuth();
    return catchError(async () => {
        const validatedData = shipSalesOrderSchema.parse(data);
        await SalesService.shipOrder(validatedData.id, session.user.id, {
            trackingNumber: validatedData.trackingNumber,
            carrier: validatedData.carrier
        });
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${validatedData.id}`);
        revalidatePath('/warehouse/inventory'); // Stock changed
        return true;
    });
}

/**
 * Check if a sales order can be fulfilled with current stock
 */
export async function checkSalesOrderFulfillment(id: string) {
    await requireAuth();
    try {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: {
                items: true,
                productionOrders: {
                    select: { status: true, actualQuantity: true, plannedQuantity: true }
                }
            }
        });

        if (!order) return { success: false, error: "Sales Order not found" };

        const shortages = [];
        for (const item of order.items) {
            // Check inventory in the designated location
            const stock = await prisma.inventory.findUnique({
                where: {
                    locationId_productVariantId: {
                        locationId: order.sourceLocationId || '',
                        productVariantId: item.productVariantId
                    }
                }
            });

            const available = stock ? Number(stock.quantity) : 0;
            const required = Number(item.quantity);

            if (available < required) {
                shortages.push({
                    productVariantId: item.productVariantId,
                    required,
                    available,
                    shortage: required - available
                });
            }
        }

        return {
            success: true,
            data: {
                canFulfill: shortages.length === 0,
                shortages
            }
        };
    } catch (error) {
        console.error("Check Fulfillment Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to check stock" };
    }
}


/**
 * Deliver a sales order
 */
export async function deliverSalesOrder(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.deliverOrder(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        revalidatePath('/sales/deliveries');
        revalidatePath(`/sales/deliveries/${id}`);
        return true;
    });
}

/**
 * Cancel a sales order
 */
export async function cancelSalesOrder(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.cancelOrder(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}

/**
 * Delete a sales order (Draft only)
 */
export async function deleteSalesOrder(id: string) {
    await requireAuth();
    return catchError(async () => {
        await SalesService.deleteOrder(id);
        revalidatePath('/sales');
        return true;
    });
}

/**
 * Get sales order statistics
 */
export async function getSalesOrderStats() {
    await requireAuth();

    const stats = await prisma.salesOrder.groupBy({
        by: ['status'],
        _count: {
            status: true
        }
    });

    const totalOrders = stats.reduce((acc, curr) => acc + curr._count.status, 0);

    const activeCount = stats
        .filter(s => ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(s.status))
        .reduce((acc, curr) => acc + curr._count.status, 0);

    const completedCount = stats
        .filter(s => ['SHIPPED', 'DELIVERED'].includes(s.status))
        .reduce((acc, curr) => acc + curr._count.status, 0);

    const cancelledCount = stats
        .filter(s => s.status === 'CANCELLED')
        .reduce((acc, curr) => acc + curr._count.status, 0);

    return {
        totalOrders,
        activeCount,
        completedCount,
        cancelledCount
    };
}
