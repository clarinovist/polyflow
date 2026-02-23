import { prisma } from '@/lib/prisma';
import { SalesOrderStatus, SalesOrderType, ReservationType, ReservationStatus, Prisma } from '@prisma/client';
import { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/audit';
import { InventoryService } from '@/services/inventory-service';
import { ProductionService } from '@/services/production-service';
import { checkCreditLimit } from './credit-service';

export async function getOrders(filters?: { customerId?: string, includeItems?: boolean, startDate?: Date, endDate?: Date }) {
    const where: Prisma.SalesOrderWhereInput = {};
    if (filters?.customerId) where.customerId = filters.customerId;

    if (filters?.startDate && filters?.endDate) {
        where.orderDate = {
            gte: filters.startDate,
            lte: filters.endDate
        };
    }

    const include: Prisma.SalesOrderInclude = {
        customer: true,
        sourceLocation: true,
        _count: {
            select: {
                items: true,
                productionOrders: true
            }
        }
    };

    if (filters?.includeItems) {
        include.items = {
            include: {
                productVariant: {
                    include: {
                        product: true
                    }
                }
            }
        };
    }

    return await prisma.salesOrder.findMany({
        where,
        include,
        orderBy: { orderDate: 'desc' }
    });
}

export async function getOrderById(id: string) {
    return await prisma.salesOrder.findUnique({
        where: { id },
        include: {
            customer: true,
            sourceLocation: true,
            items: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    }
                }
            },
            movements: {
                orderBy: { createdAt: 'desc' }
            },
            productionOrders: true,
            invoices: true,
            createdBy: {
                select: { name: true }
            }
        }
    });
}

export async function createOrder(data: CreateSalesOrderValues, userId: string) {
    const year = new Date().getFullYear();
    const prefix = `SO-${year}-`;

    const lastOrder = await prisma.salesOrder.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true }
    });

    let nextNumber = 1;
    if (lastOrder?.orderNumber) {
        const numPart = parseInt(lastOrder.orderNumber.replace(prefix, ''));
        if (!isNaN(numPart)) nextNumber = numPart + 1;
    }

    const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

    let totalAmount = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const itemsWithTotals = data.items.map(item => {
        const rawSubtotal = item.quantity * item.unitPrice;
        const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
        const subtotalAfterDiscount = rawSubtotal - discountAmount;
        const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
        const flowSubtotal = subtotalAfterDiscount + taxAmount;

        totalDiscount += discountAmount;
        totalTax += taxAmount;
        totalAmount += flowSubtotal;

        return {
            ...item,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
            taxAmount,
            subtotal: flowSubtotal
        };
    });

    return await prisma.salesOrder.create({
        data: {
            orderNumber,
            customerId: data.customerId ? data.customerId : undefined,
            sourceLocationId: data.sourceLocationId,
            orderDate: data.orderDate,
            expectedDate: data.expectedDate,
            orderType: data.orderType,
            notes: data.notes,
            totalAmount,
            discountAmount: totalDiscount,
            taxAmount: totalTax,
            status: SalesOrderStatus.DRAFT,
            createdById: userId,
            items: {
                create: itemsWithTotals.map(item => ({
                    productVariantId: item.productVariantId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discountPercent: item.discountPercent,
                    taxPercent: item.taxPercent,
                    taxAmount: item.taxAmount,
                    subtotal: item.subtotal
                }))
            }
        },
        include: { items: true }
    });
}

export async function updateOrder(data: UpdateSalesOrderValues, _userId: string) {
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const itemsWithTotals = data.items.map(item => {
        const rawSubtotal = item.quantity * item.unitPrice;
        const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
        const subtotalAfterDiscount = rawSubtotal - discountAmount;
        const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
        const flowSubtotal = subtotalAfterDiscount + taxAmount;

        totalDiscount += discountAmount;
        totalTax += taxAmount;
        totalAmount += flowSubtotal;

        return {
            ...item,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
            taxAmount,
            subtotal: flowSubtotal
        };
    });

    return await prisma.$transaction(async (tx) => {
        await tx.salesOrderItem.deleteMany({
            where: { salesOrderId: data.id }
        });

        return await tx.salesOrder.update({
            where: { id: data.id },
            data: {
                customerId: data.customerId,
                sourceLocationId: data.sourceLocationId,
                orderDate: data.orderDate,
                expectedDate: data.expectedDate,
                notes: data.notes,
                totalAmount,
                discountAmount: totalDiscount,
                taxAmount: totalTax,
                items: {
                    create: itemsWithTotals.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        discountPercent: item.discountPercent,
                        taxPercent: item.taxPercent,
                        taxAmount: item.taxAmount,
                        subtotal: item.subtotal
                    }))
                }
            },
            include: { items: true }
        });
    });
}

export async function confirmOrder(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: { items: true }
    });

    if (!order) throw new Error("Order not found");
    if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be confirmed");

    if (order.customerId && order.orderType === SalesOrderType.MAKE_TO_STOCK) {
        await checkCreditLimit(order.customerId, Number(order.totalAmount || 0));
    }

    let nextStatus = order.orderType === SalesOrderType.MAKE_TO_ORDER
        ? SalesOrderStatus.IN_PRODUCTION
        : SalesOrderStatus.CONFIRMED;

    const shortages: { productVariantId: string, quantity: number }[] = [];

    await prisma.$transaction(async (tx) => {
        for (const item of order.items) {
            let activeReservationAmount = 0;
            let shortageAmount = item.quantity.toNumber();

            if (order.sourceLocationId) {
                const inventory = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId: order.sourceLocationId,
                            productVariantId: item.productVariantId
                        }
                    }
                });

                const reservations = await tx.stockReservation.aggregate({
                    where: {
                        locationId: order.sourceLocationId,
                        productVariantId: item.productVariantId,
                        status: ReservationStatus.ACTIVE
                    },
                    _sum: { quantity: true }
                });

                const currentQty = inventory?.quantity?.toNumber() || 0;
                const reservedQty = reservations._sum.quantity?.toNumber() || 0;
                const available = currentQty - reservedQty;
                const demand = item.quantity.toNumber();

                if (available >= demand) {
                    activeReservationAmount = demand;
                    shortageAmount = 0;
                } else {
                    activeReservationAmount = Math.max(0, available);
                    shortageAmount = demand - activeReservationAmount;
                }

                if (activeReservationAmount > 0) {
                    await InventoryService.createStockReservation({
                        productVariantId: item.productVariantId,
                        locationId: order.sourceLocationId,
                        quantity: activeReservationAmount,
                        reservedFor: ReservationType.SALES_ORDER,
                        referenceId: order.id,
                        reservedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    }, tx);
                }
            }

            if (shortageAmount > 0) {
                shortages.push({ productVariantId: item.productVariantId, quantity: shortageAmount });
            }
        }

        if (shortages.length > 0) {
            nextStatus = SalesOrderStatus.IN_PRODUCTION;
        }

        for (const shortage of shortages) {
            const bom = await tx.bom.findFirst({
                where: { productVariantId: shortage.productVariantId, isDefault: true }
            });
            if (!bom) {
                const variant = await tx.productVariant.findUnique({ where: { id: shortage.productVariantId }, select: { name: true } });
                throw new Error(`Cannot confirm order: Default BOM not found for product "${variant?.name || 'Unknown'}" to cover shortage. Please create a BOM first.`);
            }
        }

        await tx.salesOrder.update({
            where: { id },
            data: { status: nextStatus }
        });

        await logActivity({
            userId,
            action: 'CONFIRM_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} confirmed. Status: ${nextStatus}. Shortages matched: ${shortages.length}`,
            tx
        });
    });

    if (shortages.length > 0) {
        try {
            const results = await Promise.allSettled(shortages.map(shortage =>
                ProductionService.createOrderFromSales(order.id, shortage.productVariantId, shortage.quantity)
            ));

            results.forEach((res, idx) => {
                if (res.status === 'rejected') {
                    console.error(`Failed to auto-create WO for item ${shortages[idx].productVariantId}:`, res.reason);
                }
            });
        } catch (error) {
            console.error("Auto-creation of WO failed:", error);
        }
    }
}

export async function cancelOrder(id: string, userId: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");

    if (order.status === SalesOrderStatus.SHIPPED || order.status === SalesOrderStatus.DELIVERED) {
        throw new Error("Cannot cancel shipped or delivered orders");
    }

    await prisma.$transaction(async (tx) => {
        await tx.stockReservation.updateMany({
            where: {
                referenceId: order.id,
                reservedFor: ReservationType.SALES_ORDER,
                status: ReservationStatus.ACTIVE
            },
            data: { status: ReservationStatus.CANCELLED }
        });

        await tx.salesOrder.update({
            where: { id },
            data: { status: SalesOrderStatus.CANCELLED }
        });

        await logActivity({
            userId,
            action: 'CANCEL_SALES',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} cancelled`,
            tx
        });
    });
}

export async function deleteOrder(id: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new Error("Order not found");
    if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be deleted");

    await prisma.salesOrder.delete({ where: { id } });
}
