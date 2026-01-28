import { prisma } from '@/lib/prisma';
import { SalesOrderStatus, MovementType, SalesOrderType, ReservationType, ReservationStatus, Prisma } from '@prisma/client';
import { CreateSalesOrderValues, UpdateSalesOrderValues } from '@/lib/schemas/sales';
import { logActivity } from '@/lib/audit';
import { formatRupiah } from '@/lib/utils';
import { InventoryService } from './inventory-service';
import { InvoiceService } from './invoice-service';

export class SalesService {

    /**
     * Get All Sales Orders (Optimized)
     */
    static async getOrders(filters?: { customerId?: string, includeItems?: boolean }) {
        const where: Prisma.SalesOrderWhereInput = {};
        if (filters?.customerId) where.customerId = filters.customerId;

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

        const orders = await prisma.salesOrder.findMany({
            where,
            include,
            orderBy: { orderDate: 'desc' }
        });

        return orders;
    }

    /**
     * Get Sales Order by ID (Optimized)
     */
    static async getOrderById(id: string) {
        const order = await prisma.salesOrder.findUnique({
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

        return order;
    }

    static async createOrder(data: CreateSalesOrderValues, userId: string) {
        // Generate Order Number: SO-YYYY-XXXX
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

        // Calculate totals
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

    static async updateOrder(data: UpdateSalesOrderValues, _userId: string) {
        // Recalculate totals
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

        // Transaction to update order and replace items
        return await prisma.$transaction(async (tx) => {
            // 1. Delete existing items
            await tx.salesOrderItem.deleteMany({
                where: { salesOrderId: data.id }
            });

            // 2. Update order and recreate items
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

    static async confirmOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be confirmed");

        // Credit Limit Check (for Make to Stock)
        if (order.customerId && order.orderType === SalesOrderType.MAKE_TO_STOCK) {
            await this.checkCreditLimit(order.customerId, Number(order.totalAmount || 0));
        }

        // Handle MTO vs MTS status
        const nextStatus = order.orderType === SalesOrderType.MAKE_TO_ORDER
            ? SalesOrderStatus.IN_PRODUCTION
            : SalesOrderStatus.CONFIRMED;

        await prisma.$transaction(async (tx) => {
            // Make to Stock Logic
            if (order.sourceLocationId && order.orderType === SalesOrderType.MAKE_TO_STOCK) {
                for (const item of order.items) {
                    // Check Physical Stock directly using tx
                    const inventory = await tx.inventory.findUnique({
                        where: {
                            locationId_productVariantId: {
                                locationId: order.sourceLocationId,
                                productVariantId: item.productVariantId
                            }
                        }
                    });

                    // Check Existing Reservations
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

                    let activeReservationAmount = 0;

                    if (available >= demand) {
                        activeReservationAmount = demand;
                    } else {
                        // Partial reservation
                        activeReservationAmount = Math.max(0, available);
                    }

                    // Create Active Reservation (if any)
                    // Note: Shortages are no longer handled by SalesService. 
                    // They will be picked up by the Planning/MRP process.
                    if (activeReservationAmount > 0) {
                        await InventoryService.createStockReservation({
                            productVariantId: item.productVariantId,
                            locationId: order.sourceLocationId,
                            quantity: activeReservationAmount,
                            reservedFor: ReservationType.SALES_ORDER,
                            referenceId: order.id,
                            reservedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 Days
                        }, tx);
                    }
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
                details: `Sales Order ${order.orderNumber} confirmed. Status: ${nextStatus}`,
                tx
            });
        });

    }

    private static async checkCreditLimit(customerId: string, newAmount: number) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                salesOrders: { where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] } } } // Exclude DELIVERED/CANCELLED/DRAFT
            }
        });

        if (customer && customer.creditLimit && customer.creditLimit.toNumber() > 0) {
            // Unpaid Invoices
            const unpaidInvoices = await prisma.invoice.findMany({
                where: {
                    salesOrder: { customerId: customerId },
                    status: { in: ['UNPAID', 'PARTIAL'] }
                }
            });

            const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)), 0);

            // Active Orders NOT yet invoiced. 
            // Simplified: Just sum all active orders total. 
            // Double counting risk: if an order is SHIPPED and has an INVOICE, we count both?
            // Correction: If an order has an invoice, the invoice covers the debt.
            // We should only count Active Orders that do NOT have a linked Invoice.

            // Re-fetch orders with invoice check
            const activeOrders = await prisma.salesOrder.findMany({
                where: {
                    customerId: customerId,
                    status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] },
                    invoices: { none: {} } // No invoices created yet
                }
            });

            const activeOrderTotal = activeOrders.reduce((sum, so) => sum + Number(so.totalAmount || 0), 0);
            const currentExposure = unpaidTotal + activeOrderTotal;
            const newExposure = currentExposure + newAmount;

            if (newExposure > customer.creditLimit.toNumber()) {
                throw new Error(`Credit Limit Exceeded. Limit: ${formatRupiah(customer.creditLimit.toNumber())}, Exposure: ${formatRupiah(currentExposure)}, New: ${formatRupiah(newAmount)}`);
            }
        }
    }

    static async markReadyToShip(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");

        if (order.status !== SalesOrderStatus.IN_PRODUCTION && order.status !== SalesOrderStatus.CONFIRMED) {
            throw new Error(`Order must be IN_PRODUCTION or CONFIRMED. Got: ${order.status}`);
        }

        await prisma.salesOrder.update({
            where: { id },
            data: { status: SalesOrderStatus.READY_TO_SHIP }
        });

        await logActivity({
            userId,
            action: 'UPDATE_SALES_STATUS',
            entityType: 'SalesOrder',
            entityId: id,
            details: `Sales Order ${order.orderNumber} marked as Ready to Ship`
        });
    }

    static async shipOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.READY_TO_SHIP) {
            throw new Error("Order must be CONFIRMED or READY_TO_SHIP to be shipped");
        }
        if (!order.sourceLocationId) throw new Error("Source location is missing");

        await prisma.$transaction(async (tx) => {
            // Deduct Stock & Handle Reservations
            for (const item of order.items) {
                const qty = item.quantity.toNumber();
                const locationId = order.sourceLocationId!;

                // 1. Check & Deduct (Using Service)
                // Note: If we reserved stock, "validateAndLockStock" might fail if it treats reservations as "unavailable".
                // We need to clarify if "validateAndLockStock" takes "my reservation" into account.
                // Currently InventoryService.validateAndLockStock subtracts ALL reservations from Physical.
                // So if I reserved 10, Physical 10, ValidAndLock sees 0 available.
                // This is correct for NEW allocations. But for FULFILLING a reservation, we need to bypass the reservation check OR cancel the reservation first.
                // STRATEGY: Find and mark reservation as Fulfilled/Consumed first (making it inactive), THEN deduct stock.

                // Find active reservations for this item/order
                const reservations = await tx.stockReservation.findMany({
                    where: {
                        referenceId: order.id,
                        productVariantId: item.productVariantId,
                        status: ReservationStatus.ACTIVE
                    }
                });

                let needed = qty;
                for (const res of reservations) {
                    if (needed <= 0) break;
                    const resQty = res.quantity.toNumber();
                    // We consume this reservation
                    const consume = Math.min(resQty, needed);

                    // Reduce reservation qty or mark fulfilled
                    // If fully consumed
                    if (consume >= resQty) {
                        await tx.stockReservation.update({ where: { id: res.id }, data: { status: ReservationStatus.FULFILLED } });
                    } else {
                        await tx.stockReservation.update({ where: { id: res.id }, data: { quantity: { decrement: consume } } });
                    }

                    needed -= consume;
                }

                // Now that reservation is cleared (inactive), "Available" will go up by that amount.
                // So we can safely use deductStock or validateAndLock.
                // Use explicit steps:

                // 1. Lock
                await InventoryService.validateAndLockStock(tx, locationId, item.productVariantId, qty);

                // 2. Deduct
                await InventoryService.deductStock(tx, locationId, item.productVariantId, qty);

                // 3. Create Movement
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.OUT,
                        productVariantId: item.productVariantId,
                        fromLocationId: locationId,
                        quantity: qty,
                        salesOrderId: order.id,
                        createdById: userId,
                        reference: `Shipment for ${order.orderNumber}`,
                        createdAt: new Date()
                    }
                });
            }

            // ... (existing stock movement logic)

            // 4. Create Delivery Order Record
            const lastDo = await tx.deliveryOrder.findFirst({
                orderBy: { createdAt: 'desc' }
            });

            const year = new Date().getFullYear();
            let nextDoNumber = 1;
            if (lastDo?.orderNumber?.startsWith(`DO-${year}-`)) {
                const parts = lastDo.orderNumber.split('-');
                if (parts.length === 3) {
                    nextDoNumber = parseInt(parts[2]) + 1;
                }
            }
            const doNumber = `DO-${year}-${nextDoNumber.toString().padStart(4, '0')}`;

            await tx.deliveryOrder.create({
                data: {
                    orderNumber: doNumber,
                    salesOrderId: order.id,
                    sourceLocationId: order.sourceLocationId!,
                    status: 'SHIPPED', // Since we are in shipOrder action
                    deliveryDate: new Date(),
                    createdById: userId,
                    items: {
                        create: order.items.map(item => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            notes: item.id // storing SO item ID reference optionally or just null
                        }))
                    }
                }
            });

            await tx.salesOrder.update({
                where: { id },
                data: { status: SalesOrderStatus.SHIPPED }
            });

            // Trigger automated draft invoice
            await InvoiceService.createDraftInvoiceFromOrder(id, userId);

            await logActivity({
                userId,
                action: 'SHIP_SALES',
                entityType: 'SalesOrder',
                entityId: id,
                details: `Sales Order ${order.orderNumber} shipped. Created Delivery Order ${doNumber}`,
                tx
            });
        });
    }

    static async deliverOrder(orderId: string, _userId: string) {
        await prisma.salesOrder.update({
            where: { id: orderId },
            data: { status: SalesOrderStatus.DELIVERED }
        });
        // Log not shown for brevity, reusing existing pattern
    }

    static async cancelOrder(id: string, userId: string) {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");

        if (order.status === SalesOrderStatus.SHIPPED || order.status === SalesOrderStatus.DELIVERED) {
            throw new Error("Cannot cancel shipped or delivered orders");
        }

        await prisma.$transaction(async (tx) => {
            // Cancel Reservations
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
    static async deleteOrder(id: string) {
        const order = await prisma.salesOrder.findUnique({ where: { id } });
        if (!order) throw new Error("Order not found");
        if (order.status !== SalesOrderStatus.DRAFT) throw new Error("Only draft orders can be deleted");

        await prisma.salesOrder.delete({ where: { id } });
    }
}

