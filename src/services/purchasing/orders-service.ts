import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { PurchaseOrderStatus, Prisma } from '@prisma/client';
import {
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
} from '@/lib/schemas/purchasing';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';
import { PURCHASE_ORDERS_LIST_ROUTE } from '@/lib/constants/performance';
import {
    clampPurchasingPage,
    createPurchasingPage,
    normalizePurchasingPagination,
    type PurchasingPage,
    type PurchasingPaginationInput,
    type PurchasingSortDirection,
} from '@/lib/purchasing/paged-list';

export async function createOrder(
    data: CreatePurchaseOrderValues,
    userId: string,
) {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;

    const lastOrder = await prisma.purchaseOrder.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
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

    const itemsWithTotals = data.items.map((item) => {
        const rawSubtotal = item.quantity * item.unitPrice;
        const discountAmount =
            rawSubtotal * ((item.discountPercent || 0) / 100);
        const subtotalAfterDiscount = rawSubtotal - discountAmount;
        const ppnMode = (item.ppnMode || 'EXCLUDE') as PpnMode;
        const ppnResult = calculatePpn(
            subtotalAfterDiscount,
            item.taxPercent || 0,
            ppnMode,
        );

        totalDiscount += discountAmount;
        totalTax += ppnResult.taxAmount;
        totalAmount += ppnResult.total;

        return {
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
            taxAmount: ppnResult.taxAmount,
            subtotal: ppnResult.total,
            dppOtherAmount: item.dppOtherAmount || null,
            ppnMode: ppnMode,
        };
    });

    const shippingCost = data.shippingCost || 0;
    const finalTotal = totalAmount + shippingCost;

    return await prisma.purchaseOrder.create({
        data: {
            orderNumber,
            supplierId: data.supplierId,
            orderDate: data.orderDate,
            expectedDate: data.expectedDate,
            deliveryAddress: data.deliveryAddress || null,
            notes: data.notes,
            totalAmount: finalTotal,
            discountAmount: totalDiscount,
            taxAmount: totalTax,
            shippingCost: shippingCost > 0 ? shippingCost : null,
            status: PurchaseOrderStatus.DRAFT,
            createdById: userId,
            items: {
                create: itemsWithTotals,
            },
        },
        include: { items: true, supplier: true },
    });
}

export async function updateOrder(data: UpdatePurchaseOrderValues) {
    // Load current order with items and invoices for validation
    const currentOrder = await prisma.purchaseOrder.findUnique({
        where: { id: data.id },
        include: {
            items: true,
            invoices: { select: { id: true, status: true } },
        },
    });

    if (!currentOrder) throw new NotFoundError('Purchase Order', data.id);

    const status = currentOrder.status;

    // === STATUS-BASED VALIDATION ===

    // DRAFT: can edit everything freely
    // SENT: can edit prices/notes/shipping, but NOT quantities for invoiced items
    // PARTIAL_RECEIVED: stricter — received items are locked
    // RECEIVED/CANCELLED: no editing allowed
    if (status === 'RECEIVED' || status === 'CANCELLED') {
        throw new BusinessRuleError(
            `Cannot edit Purchase Order with status ${status}.`,
            { status, orderId: data.id },
            'INVALID_ORDER_STATUS',
        );
    }

    const hasInvoices = currentOrder.invoices.length > 0;

    // Build a map of existing items by id for comparison
    const existingItemsMap = new Map(
        currentOrder.items.map((item) => [item.id, item]),
    );

    // Validate each submitted item
    for (const submittedItem of data.items) {
        const existingItem = submittedItem.id
            ? existingItemsMap.get(submittedItem.id)
            : undefined;

        if (existingItem) {
            const receivedQty = Number(existingItem.receivedQty);

            // If item has been received, quantity cannot be reduced below receivedQty
            if (receivedQty > 0 && submittedItem.quantity < receivedQty) {
                throw new BusinessRuleError(
                    `Qty cannot be less than ${receivedQty} (already received).`,
                    {
                        productVariantId: existingItem.productVariantId,
                        receivedQty,
                        submittedQty: submittedItem.quantity,
                    },
                );
            }

            // If item has been received and PO is SENT, quantity cannot change at all
            if (
                receivedQty > 0 &&
                status === 'SENT' &&
                submittedItem.quantity !== Number(existingItem.quantity)
            ) {
                throw new BusinessRuleError(
                    'Qty for received items cannot be changed when PO status is SENT.',
                    {
                        productVariantId: existingItem.productVariantId,
                        orderId: data.id,
                    },
                );
            }

            // If invoices exist, unit price cannot change (would mismatch invoice)
            if (
                hasInvoices &&
                submittedItem.unitPrice !== Number(existingItem.unitPrice)
            ) {
                throw new BusinessRuleError(
                    'Unit price cannot be changed because invoices already exist for this order.',
                    { orderId: data.id },
                );
            }
        }
    }

    // === CALCULATE TOTALS ===
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const itemsWithTotals = data.items.map((item) => {
        const rawSubtotal = item.quantity * item.unitPrice;
        const discountAmount =
            rawSubtotal * ((item.discountPercent || 0) / 100);
        const subtotalAfterDiscount = rawSubtotal - discountAmount;
        const ppnMode = (item.ppnMode || 'EXCLUDE') as PpnMode;
        const ppnResult = calculatePpn(
            subtotalAfterDiscount,
            item.taxPercent || 0,
            ppnMode,
        );

        totalDiscount += discountAmount;
        totalTax += ppnResult.taxAmount;
        totalAmount += ppnResult.total;

        return {
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
            taxAmount: ppnResult.taxAmount,
            subtotal: ppnResult.total,
            dppOtherAmount: item.dppOtherAmount || null,
            ppnMode: ppnMode,
        };
    });

    const shippingCost = data.shippingCost || 0;
    const finalTotal = totalAmount + shippingCost;

    // === APPLY CHANGES ===
    // For received items: preserve their receivedQty by updating in-place
    // For new/removed items: handle carefully

    return await prisma.$transaction(async (tx) => {
        // Delete only items that are NOT received (received items stay)
        const unreceivedItemIds = currentOrder.items
            .filter((item) => Number(item.receivedQty) === 0)
            .map((item) => item.id);

        if (unreceivedItemIds.length > 0) {
            await tx.purchaseOrderItem.deleteMany({
                where: { id: { in: unreceivedItemIds } },
            });
        }

        // Create new item entries (including updated ones)
        // Preserve receivedQty for items that existed before
        const itemsToCreate = itemsWithTotals.map((item) => {
            const existingItem = data.items.find(
                (di) => di.productVariantId === item.productVariantId,
            );
            const existingRecord = existingItem?.id
                ? existingItemsMap.get(existingItem.id)
                : undefined;

            return {
                ...item,
                // Preserve receivedQty if item was carried over
                receivedQty: existingRecord ? existingRecord.receivedQty : 0,
            };
        });

        return await tx.purchaseOrder.update({
            where: { id: data.id },
            data: {
                supplierId: data.supplierId,
                orderDate: data.orderDate,
                expectedDate: data.expectedDate,
                deliveryAddress: data.deliveryAddress || null,
                notes: data.notes,
                totalAmount: finalTotal,
                discountAmount: totalDiscount,
                taxAmount: totalTax,
                shippingCost: shippingCost > 0 ? shippingCost : null,
                items: {
                    create: itemsToCreate,
                },
            },
            include: { items: true, supplier: true },
        });
    });
}

export async function updateOrderStatus(
    id: string,
    status: PurchaseOrderStatus,
    userId: string,
) {
    const existing = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, status: true, orderNumber: true },
    });
    if (!existing) throw new NotFoundError('Purchase Order', id);

    const order = await prisma.purchaseOrder.update({
        where: { id },
        data: { status },
    });

    await logActivity({
        userId,
        action: 'UPDATE_STATUS_PURCHASE',
        entityType: 'PurchaseOrder',
        entityId: id,
        details: `Updated PO ${order.orderNumber} status to ${status}`,
        fromStatus: existing.status as unknown as string,
        toStatus: status as unknown as string,
    });

    return order;
}

export async function deleteOrder(id: string, userId: string) {
    const order = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { goodsReceipts: true, invoices: true },
    });

    if (!order) {
        throw new NotFoundError('Purchase Order', id);
    }

    if (order.status !== 'DRAFT' && order.status !== 'CANCELLED') {
        throw new BusinessRuleError(
            'Only DRAFT or CANCELLED orders can be deleted.',
            { status: order.status, orderId: id },
            'INVALID_ORDER_STATUS',
        );
    }

    if (order.goodsReceipts.length > 0) {
        throw new BusinessRuleError(
            'Cannot delete order with existing goods receipts.',
            { goodsReceiptCount: order.goodsReceipts.length, orderId: id },
        );
    }

    if (order.invoices.length > 0) {
        throw new BusinessRuleError(
            'Cannot delete order with existing invoices.',
            { invoiceCount: order.invoices.length, orderId: id },
        );
    }

    return await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({
            where: { purchaseOrderId: id },
        });

        await tx.purchaseOrder.delete({
            where: { id },
        });

        await logActivity({
            userId,
            action: 'DELETE_PURCHASE',
            entityType: 'PurchaseOrder',
            entityId: id,
            details: `Deleted PO ${order.orderNumber}`,
            tx,
        });

        return { success: true, orderNumber: order.orderNumber };
    });
}

const purchaseOrderListInclude = {
    supplier: true,
    _count: { select: { items: true } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderListItem = Prisma.PurchaseOrderGetPayload<{
    include: typeof purchaseOrderListInclude;
}>;

export const PURCHASE_ORDER_SORTS = [
    'orderDate',
    'supplier',
    'status',
    'totalAmount',
] as const;
export type PurchaseOrderSort = (typeof PURCHASE_ORDER_SORTS)[number];

export interface PurchaseOrderPageInput extends PurchasingPaginationInput {
    search?: string;
    supplierId?: string;
    status?: PurchaseOrderStatus | PurchaseOrderStatus[];
    startDate?: Date;
    endDate?: Date;
    sort?: PurchaseOrderSort;
    direction?: PurchasingSortDirection;
}

function getPurchaseOrderOrderBy(
    sort: PurchaseOrderSort = 'orderDate',
    direction: PurchasingSortDirection = 'desc',
): Prisma.PurchaseOrderOrderByWithRelationInput[] {
    const primary: Prisma.PurchaseOrderOrderByWithRelationInput =
        sort === 'supplier'
            ? { supplier: { name: direction } }
            : { [sort]: direction };

    return [primary, { id: direction }];
}

function buildPurchaseOrderWhere(
    filters: Omit<PurchaseOrderPageInput, 'page' | 'pageSize'> = {},
): Prisma.PurchaseOrderWhereInput {
    const search = filters.search?.trim();

    return {
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.status
            ? {
                  status: Array.isArray(filters.status)
                      ? { in: filters.status }
                      : filters.status,
              }
            : {}),
        ...(filters.startDate || filters.endDate
            ? {
                  orderDate: {
                      ...(filters.startDate ? { gte: filters.startDate } : {}),
                      ...(filters.endDate ? { lte: filters.endDate } : {}),
                  },
              }
            : {}),
        ...(search
            ? {
                  OR: [
                      {
                          orderNumber: {
                              contains: search,
                              mode: Prisma.QueryMode.insensitive,
                          },
                      },
                      {
                          supplier: {
                              is: {
                                  name: {
                                      contains: search,
                                      mode: Prisma.QueryMode.insensitive,
                                  },
                              },
                          },
                      },
                  ],
              }
            : {}),
    };
}

function recordPurchaseOrderListMetric(queryStartedAt: number) {
    const durationMs = Math.round(performance.now() - queryStartedAt);
    prisma.performanceMetric
        .create({ data: { route: PURCHASE_ORDERS_LIST_ROUTE, durationMs } })
        .catch((error) =>
            logger.error('Failed to record performance metric', {
                module: 'purchasing',
                error,
            }),
        );
}

export async function getPurchaseOrders(filters?: {
    supplierId?: string;
    status?: PurchaseOrderStatus | PurchaseOrderStatus[];
}) {
    const where = buildPurchaseOrderWhere(filters);
    const queryStartedAt = performance.now();
    const orders = await prisma.purchaseOrder.findMany({
        where,
        include: purchaseOrderListInclude,
        orderBy: { createdAt: 'desc' },
    });

    recordPurchaseOrderListMetric(queryStartedAt);
    return orders;
}

export async function getPurchaseOrdersPage(
    filters: PurchaseOrderPageInput = {},
): Promise<PurchasingPage<PurchaseOrderListItem>> {
    const pagination = normalizePurchasingPagination(filters);
    const where = buildPurchaseOrderWhere(filters);
    const queryStartedAt = performance.now();
    const totalCount = await prisma.purchaseOrder.count({ where });
    const page = clampPurchasingPage(
        pagination.page,
        totalCount,
        pagination.pageSize,
    );
    const items = await prisma.purchaseOrder.findMany({
        where,
        include: purchaseOrderListInclude,
        orderBy: getPurchaseOrderOrderBy(filters.sort, filters.direction),
        skip: (page - 1) * pagination.pageSize,
        take: pagination.pageSize,
    });

    recordPurchaseOrderListMetric(queryStartedAt);
    return createPurchasingPage(items, totalCount, page, pagination.pageSize);
}

export async function getPurchaseOrderById(id: string) {
    return await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
            supplier: true,
            items: {
                include: {
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                            standardCost: true,
                        },
                    },
                },
            },
            goodsReceipts: {
                include: {
                    createdBy: { select: { name: true } },
                    location: { select: { name: true } },
                },
            },
            invoices: true,
            createdBy: { select: { name: true } },
        },
    });
}
