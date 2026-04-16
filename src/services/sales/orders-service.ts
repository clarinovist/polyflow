import { prisma } from '@/lib/core/prisma';
import { SalesOrderStatus, SalesOrderType, ReservationType, ReservationStatus, Prisma, ProductType, InvoiceStatus } from '@prisma/client';
import { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';
import { createStockReservation } from '@/services/inventory/reservation-service';
import { ProductionService } from '@/services/production/production-service';
import { checkCreditLimit } from './credit-service';
import { logger } from '@/lib/config/logger';

export async function getOrders(filters?: {
    customerId?: string,
    includeItems?: boolean,
    startDate?: Date,
    endDate?: Date,
    demandType?: 'customer' | 'legacy-internal',
    orderType?: 'MAKE_TO_STOCK' | 'MAKE_TO_ORDER' | 'MAKLON_JASA',
    paymentState?: 'outstanding'
}) {
    const where: Prisma.SalesOrderWhereInput = {};
    if (filters?.customerId) where.customerId = filters.customerId;

    if (filters?.orderType) {
        where.orderType = filters.orderType;
    }

    if (filters?.demandType === 'customer') {
        where.customerId = { not: null };
    } else if (filters?.demandType === 'legacy-internal') {
        where.customerId = null;
    }

    if (filters?.startDate && filters?.endDate) {
        where.orderDate = {
            gte: filters.startDate,
            lte: filters.endDate
        };
    }

    if (filters?.paymentState === 'outstanding') {
        where.invoices = {
            some: {
                status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] }
            }
        };
    }

    const include: Prisma.SalesOrderInclude = {
        customer: true,
        sourceLocation: true,
        invoices: {
            select: {
                id: true,
                invoiceNumber: true,
                status: true,
                totalAmount: true,
                paidAmount: true,
                invoiceDate: true,
                dueDate: true,
            },
            orderBy: { invoiceDate: 'desc' }
        },
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

    const itemsWithTotals = await Promise.all(data.items.map(async (item) => {
        const variant = await prisma.productVariant.findUnique({
            where: { id: item.productVariantId },
            include: { product: true }
        });

        if (!variant) throw new Error(`Product variant ${item.productVariantId} not found`);

        const isService = variant.product.productType === ProductType.SERVICE;
        if (isService && data.orderType !== SalesOrderType.MAKLON_JASA) {
            throw new Error(`Service item '${variant.name}' is only allowed for Maklon Jasa orders`);
        }
        if (!isService && data.orderType === SalesOrderType.MAKLON_JASA) {
            throw new Error(`Physical item '${variant.name}' is not allowed for Maklon Jasa orders. Use a Service item instead.`);
        }

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
    }));

    if (data.customerId) {
        await checkCreditLimit(data.customerId, totalAmount);
    }

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

    const itemsWithTotals = await Promise.all(data.items.map(async (item) => {
        const variant = await prisma.productVariant.findUnique({
            where: { id: item.productVariantId },
            include: { product: true }
        });

        if (!variant) throw new Error(`Product variant ${item.productVariantId} not found`);

        // Fetch current order to check orderType since it's not and update payload
        const currentOrder = await prisma.salesOrder.findUnique({ where: { id: data.id }, select: { orderType: true } });
        const effectiveOrderType = currentOrder?.orderType;

        const isService = variant.product.productType === ProductType.SERVICE;
        if (isService && effectiveOrderType !== SalesOrderType.MAKLON_JASA) {
            throw new Error(`Service item '${variant.name}' is only allowed for Maklon Jasa orders`);
        }
        if (!isService && effectiveOrderType === SalesOrderType.MAKLON_JASA) {
            throw new Error(`Physical item '${variant.name}' is not allowed for Maklon Jasa orders. Use a Service item instead.`);
        }

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
    }));

    if (data.customerId) {
        await checkCreditLimit(data.customerId, totalAmount);
    }

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
        include: { 
            items: {
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            } 
        }
    });

    if (!order) throw new Error("Order not found");
    if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be confirmed");
    if (!order.customerId) {
        throw new Error("Sales Order without customer is treated as a legacy internal stock build. Assign a customer first, or use a Production Order for internal replenishment.");
    }

    if (order.customerId && order.orderType !== SalesOrderType.MAKE_TO_ORDER) {
        await checkCreditLimit(order.customerId, Number(order.totalAmount || 0));
    }

    let nextStatus = (order.orderType === SalesOrderType.MAKE_TO_ORDER || order.orderType === SalesOrderType.MAKLON_JASA)
        ? SalesOrderStatus.IN_PRODUCTION
        : SalesOrderStatus.CONFIRMED;

    const shortages: { productVariantId: string, quantity: number }[] = [];

    await prisma.$transaction(async (tx) => {
        if (order.sourceLocationId) {
            const variantIds = order.items.map(item => item.productVariantId);
            
            // Bulk fetch inventory for all items
            const inventories = await tx.inventory.findMany({
                where: {
                    locationId: order.sourceLocationId,
                    productVariantId: { in: variantIds }
                }
            });
            const inventoryMap = new Map(inventories.map(inv => [inv.productVariantId, inv.quantity.toNumber()]));

            // Bulk fetch active reservations for all items
            const activeReservations = await tx.stockReservation.groupBy({
                by: ['productVariantId'],
                where: {
                    locationId: order.sourceLocationId,
                    productVariantId: { in: variantIds },
                    status: ReservationStatus.ACTIVE
                },
                _sum: { quantity: true }
            });
            const reservationMap = new Map(activeReservations.map(res => [res.productVariantId, res._sum.quantity?.toNumber() || 0]));

            for (const item of order.items) {
                if (item.productVariant.product.productType === ProductType.SERVICE) {
                    // SERVICE items (Maklon Jasa) don't have physical inventory or standard BOMs.
                    // WOs for Maklon must be created manually in the Production module.
                    continue;
                }
                
                let activeReservationAmount = 0;
                let shortageAmount = item.quantity.toNumber();

                const currentQty = inventoryMap.get(item.productVariantId) || 0;
                const reservedQty = reservationMap.get(item.productVariantId) || 0;
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
                    await createStockReservation({
                        productVariantId: item.productVariantId,
                        locationId: order.sourceLocationId,
                        quantity: activeReservationAmount,
                        reservedFor: ReservationType.SALES_ORDER,
                        referenceId: order.id,
                        reservedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    }, tx);
                }

                if (shortageAmount > 0) {
                    shortages.push({ productVariantId: item.productVariantId, quantity: shortageAmount });
                }
            }
        }

        if (shortages.length > 0) {
            nextStatus = SalesOrderStatus.IN_PRODUCTION;
            const shortageVariantIds = shortages.map(s => s.productVariantId);
            
            const boms = await tx.bom.findMany({
                where: { productVariantId: { in: shortageVariantIds }, isDefault: true },
                select: { productVariantId: true }
            });
            const bomVariantIds = new Set(boms.map(b => b.productVariantId));
            
            const missingBoms = shortageVariantIds.filter(id => !bomVariantIds.has(id));
            if (missingBoms.length > 0) {
                const variants = await tx.productVariant.findMany({
                    where: { id: { in: missingBoms } },
                    select: { name: true }
                });
                const names = variants.map(v => v.name).join(', ');
                throw new Error(`Cannot confirm order: Default BOM not found for products: ${names}. Please create a BOM first.`);
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
                    logger.error(`Failed to auto-create WO for item ${shortages[idx].productVariantId}`, { error: res.reason, module: 'SalesOrderService' });
                }
            });
        } catch (error) {
            logger.error("Unexpected error in WO auto-creation", { error, orderId: id, module: 'SalesOrderService' });
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
