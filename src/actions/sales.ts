'use server';

import { withTenant } from "@/lib/tenant";
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

export const getSalesOrders = withTenant(
async function getSalesOrders(includeItems = false, dateRange?: { startDate?: Date, endDate?: Date }) {
    await requireAuth();
    const orders = await SalesService.getOrders({
        includeItems,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate
    });
    return serializeData(orders);
}
);

export const getSalesOrdersByCustomerId = withTenant(
async function getSalesOrdersByCustomerId(customerId: string) {
    await requireAuth();
    const orders = await SalesService.getOrders({ customerId });
    return serializeData(orders);
}
);


export const getSalesOrderById = withTenant(
async function getSalesOrderById(id: string) {
    await requireAuth();
    const order = await SalesService.getOrderById(id);
    if (!order) return null;
    return serializeData(order);
}
);

export const createSalesOrder = withTenant(
async function createSalesOrder(data: CreateSalesOrderValues) {
    const session = await requireAuth();
    return catchError(async () => {
        const result = createSalesOrderSchema.parse(data);
        const order = await SalesService.createOrder(result, session.user.id);
        revalidatePath('/sales');
        return order;
    });
}
);

export const updateSalesOrder = withTenant(
async function updateSalesOrder(data: UpdateSalesOrderValues) {
    const session = await requireAuth();
    return catchError(async () => {
        const result = updateSalesOrderSchema.parse(data);
        await SalesService.updateOrder(result, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${data.id}`);
        return { id: data.id };
    });
}
);

export const confirmSalesOrder = withTenant(
async function confirmSalesOrder(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.confirmOrder(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}
);

export const markReadyToShip = withTenant(
async function markReadyToShip(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.markReadyToShip(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}
);

export const shipSalesOrder = withTenant(
async function shipSalesOrder(data: { id: string, trackingNumber?: string, carrier?: string }) {
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
);

export const checkSalesOrderFulfillment = withTenant(
async function checkSalesOrderFulfillment(id: string) {
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

            // Subtract reservations for OTHER orders
            const reservations = await prisma.stockReservation.aggregate({
                where: {
                    locationId: order.sourceLocationId || '',
                    productVariantId: item.productVariantId,
                    status: 'ACTIVE',
                    referenceId: { not: order.id }
                },
                _sum: { quantity: true }
            });
            const reservedQuantity = reservations._sum.quantity?.toNumber() || 0;

            const rawAvailable = stock ? Number(stock.quantity) : 0;
            const available = Math.max(0, rawAvailable - reservedQuantity);
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
);


export const deliverSalesOrder = withTenant(
async function deliverSalesOrder(id: string) {
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
);

export const cancelSalesOrder = withTenant(
async function cancelSalesOrder(id: string) {
    const session = await requireAuth();
    return catchError(async () => {
        await SalesService.cancelOrder(id, session.user.id);
        revalidatePath('/sales');
        revalidatePath(`/sales/orders/${id}`);
        return true;
    });
}
);

export const deleteSalesOrder = withTenant(
async function deleteSalesOrder(id: string) {
    await requireAuth();
    return catchError(async () => {
        await SalesService.deleteOrder(id);
        revalidatePath('/sales');
        return true;
    });
}
);

export const getSalesOrderStats = withTenant(
async function getSalesOrderStats() {
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
);
