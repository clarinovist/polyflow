'use server';

import { prisma } from '@/lib/prisma';
import {
    createSalesOrderSchema,
    updateSalesOrderSchema,
    CreateSalesOrderValues,
    UpdateSalesOrderValues
} from '@/lib/schemas/sales';
import { SalesService } from '@/services/sales-service';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';
import { SalesOrderStatus } from '@prisma/client';

/**
 * Get all sales orders
 */
export async function getSalesOrders() {
    await requireAuth();
    return await prisma.salesOrder.findMany({
        include: {
            customer: true,
            sourceLocation: true,
            _count: { select: { items: true } }
        },
        orderBy: { orderDate: 'desc' }
    });
}

/**
 * Get sales order by ID with details
 */
export async function getSalesOrderById(id: string) {
    await requireAuth();
    return await prisma.salesOrder.findUnique({
        where: { id },
        include: {
            customer: true,
            sourceLocation: true,
            items: {
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            },
            movements: true,
            productionOrders: true,
            invoices: true,
            createdBy: {
                select: {
                    name: true
                }
            }
        }
    });
}

/**
 * Create a new sales order
 */
export async function createSalesOrder(data: CreateSalesOrderValues) {
    const session = await requireAuth();
    const result = createSalesOrderSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const order = await SalesService.createOrder(result.data, session.user.id);
        revalidatePath('/dashboard/sales');

        // Serialize Decimal fields for client consumption
        const serializedOrder = {
            ...order,
            totalAmount: Number((order as any).totalAmount),
            items: (order as any).items?.map((item: any) => ({
                ...item,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                subtotal: Number(item.subtotal),
                deliveredQty: item.deliveredQty ? Number(item.deliveredQty) : 0
            }))
        };

        return { success: true, data: serializedOrder };
    } catch (error) {
        console.error("Create SO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to create order" };
    }
}

/**
 * Update a sales order
 */
export async function updateSalesOrder(data: UpdateSalesOrderValues) {
    const session = await requireAuth();
    const result = updateSalesOrderSchema.safeParse(data);

    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await SalesService.updateOrder(result.data, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${data.id}`);
        return { success: true };
    } catch (error) {
        console.error("Update SO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to update order" };
    }
}

/**
 * Confirm a sales order
 */
export async function confirmSalesOrder(id: string) {
    const session = await requireAuth();
    try {
        await SalesService.confirmOrder(id, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${id}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to confirm order" };
    }
}

export async function markReadyToShip(id: string) {
    const session = await requireAuth();
    try {
        await SalesService.markReadyToShip(id, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${id}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update status" };
    }
}

/**
 * Ship a sales order (Deduct Stock)
 */
export async function shipSalesOrder(id: string) {
    const session = await requireAuth();
    try {
        await SalesService.shipOrder(id, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${id}`);
        revalidatePath('/dashboard/inventory'); // Stock changed
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to ship order" };
    }
}

/**
 * Check if a sales order can be fulfilled with current stock
 */
export async function checkSalesOrderFulfillment(id: string) {
    const session = await requireAuth();
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
    try {
        await SalesService.deliverOrder(id, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${id}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to mark as delivered" };
    }
}

/**
 * Cancel a sales order
 */
export async function cancelSalesOrder(id: string) {
    const session = await requireAuth();
    try {
        await SalesService.cancelOrder(id, session.user.id);
        revalidatePath('/dashboard/sales');
        revalidatePath(`/dashboard/sales/${id}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to cancel order" };
    }
}

/**
 * Delete a sales order (Draft only)
 */
export async function deleteSalesOrder(id: string) {
    await requireAuth();
    try {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be deleted");

        await prisma.salesOrder.delete({ where: { id } });

        revalidatePath('/dashboard/sales');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to delete order" };
    }
}
