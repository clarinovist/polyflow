import { prisma } from '@/lib/core/prisma';
import {
    OrderEntrySource,
    CommercialReviewStatus,
    SalesOrderStatus,
    SalesOrderType,
} from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';
import { checkCreditLimit } from './credit-service';
import { confirmOrder } from './orders-service';
import { createDeliveryOrderFromSalesOrder } from './delivery-fulfillment-service';

const CONFIRMABLE_STATUSES: SalesOrderStatus[] = [
    SalesOrderStatus.CONFIRMED,
    SalesOrderStatus.IN_PRODUCTION,
    SalesOrderStatus.READY_TO_SHIP,
];

export interface WalkInDispatchItem {
    productVariantId: string;
    quantity: number;
    isFreeItem?: boolean;
}

export interface WalkInDispatchInput {
    customerId: string;
    sourceLocationId: string;
    sourceReference: string;
    notes?: string;
    items: WalkInDispatchItem[];
    idempotencyKey: string;
}

export interface WalkInDispatchResult {
    salesOrder: {
        id: string;
        orderNumber: string;
        status: SalesOrderStatus;
        commercialReviewStatus: CommercialReviewStatus;
    };
    deliveryOrder: {
        id: string;
        orderNumber: string;
    } | null;
    needsApproval: boolean;
}

/**
 * Resolve server-side price for a customer product.
 * Priority: CustomerProductPrice → ProductVariant.sellPrice → ProductVariant.price
 * Returns 0 if no price found.
 */
async function resolveCustomerPrice(
    customerId: string,
    productVariantId: string,
): Promise<number> {
    const customerPrice = await prisma.customerProductPrice.findFirst({
        where: {
            customerId,
            productVariantId,
            isActive: true,
        },
        select: { unitPrice: true },
    });
    if (customerPrice && customerPrice.unitPrice.toNumber() > 0) {
        return customerPrice.unitPrice.toNumber();
    }

    const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        select: { sellPrice: true, price: true },
    });
    if (variant?.sellPrice != null && Number(variant.sellPrice) > 0) {
        return Number(variant.sellPrice);
    }
    if (variant?.price != null && Number(variant.price) > 0) {
        return Number(variant.price);
    }

    return 0;
}

/**
 * Create an emergency dispatch: SO (+ optional DO) for customer walk-in.
 * Idempotent: same idempotencyKey returns existing result.
 */
export async function createWalkInDispatch(
    data: WalkInDispatchInput,
    userId: string,
): Promise<WalkInDispatchResult> {
    if (!data.items.length) {
        throw new BusinessRuleError(
            'Minimal satu item harus diisi.',
            undefined,
            'WALK_IN_EMPTY_ITEMS',
        );
    }

    // Idempotency check
    const existingSO = await prisma.salesOrder.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
        include: {
            deliveryOrders: {
                select: { id: true, orderNumber: true },
                take: 1,
            },
        },
    });
    if (existingSO) {
        logger.info('Walk-in dispatch idempotency hit', {
            salesOrderId: existingSO.id,
            idempotencyKey: data.idempotencyKey,
            module: 'WalkInDispatch',
        });
        return {
            salesOrder: existingSO,
            deliveryOrder: existingSO.deliveryOrders[0] ?? null,
            needsApproval:
                existingSO.commercialReviewStatus ===
                CommercialReviewStatus.PENDING,
        };
    }

    // Validate customer
    const customer = await prisma.customer.findUnique({
        where: { id: data.customerId },
        select: { id: true, name: true, lifecycleStatus: true },
    });
    if (!customer) {
        throw new BusinessRuleError(
            'Customer tidak ditemukan.',
            { customerId: data.customerId },
            'CUSTOMER_NOT_FOUND',
        );
    }
    if (customer.lifecycleStatus !== 'ACTIVE') {
        throw new BusinessRuleError(
            'Customer tidak aktif. Hubungi Sales untuk aktivasi.',
            { customerId: data.customerId, status: customer.lifecycleStatus },
            'CUSTOMER_NOT_ACTIVE',
        );
    }

    // Validate location
    const location = await prisma.location.findUnique({
        where: { id: data.sourceLocationId },
        select: { id: true, name: true },
    });
    if (!location) {
        throw new BusinessRuleError(
            'Lokasi sumber tidak ditemukan.',
            { sourceLocationId: data.sourceLocationId },
            'LOCATION_NOT_FOUND',
        );
    }

    // Resolve prices server-side
    const resolvedItems = await Promise.all(
        data.items.map(async (item) => {
            if (item.isFreeItem) {
                return {
                    ...item,
                    unitPrice: 0,
                };
            }
            const unitPrice = await resolveCustomerPrice(
                data.customerId,
                item.productVariantId,
            );
            if (unitPrice <= 0) {
                throw new BusinessRuleError(
                    `Harga untuk produk ${item.productVariantId} tidak ditemukan. Hubungi Sales untuk pengaturan harga.`,
                    { productVariantId: item.productVariantId },
                    'PRICE_NOT_FOUND',
                );
            }
            return {
                ...item,
                unitPrice,
            };
        }),
    );

    // Determine if we can proceed immediately or need approval
    const allPricesValid = resolvedItems.every(
        (i) => i.isFreeItem || i.unitPrice > 0,
    );

    // Credit check
    const totalAmount = resolvedItems.reduce(
        (sum, i) => sum + i.unitPrice * i.quantity,
        0,
    );
    let creditOk = true;
    try {
        await checkCreditLimit(data.customerId, totalAmount);
    } catch {
        creditOk = false;
    }

    const needsApproval = !allPricesValid || !creditOk;

    // Create SO
    const soNotes = [
        '[EMERGENCY_DISPATCH]',
        `Ref: ${data.sourceReference}`,
        data.notes?.trim() || null,
    ]
        .filter(Boolean)
        .join('\n');

    // Generate order number
    const now = new Date();
    const year = now.getFullYear();
    const count = await prisma.salesOrder.count({
        where: {
            createdAt: {
                gte: new Date(year, 0, 1),
                lt: new Date(year + 1, 0, 1),
            },
        },
    });
    const orderNumber = `SO-${year}-${(count + 1).toString().padStart(4, '0')}`;

    const so = await prisma.salesOrder.create({
        data: {
            orderNumber,
            customerId: data.customerId,
            sourceLocationId: data.sourceLocationId,
            orderDate: now,
            orderType: SalesOrderType.MAKE_TO_STOCK,
            status: needsApproval
                ? SalesOrderStatus.DRAFT
                : SalesOrderStatus.CONFIRMED,
            entrySource: OrderEntrySource.EMERGENCY_DISPATCH,
            sourceReference: data.sourceReference,
            commercialReviewStatus: needsApproval
                ? CommercialReviewStatus.PENDING
                : CommercialReviewStatus.NOT_REQUIRED,
            idempotencyKey: data.idempotencyKey,
            notes: soNotes,
            createdById: userId,
            items: {
                create: resolvedItems.map((item) => ({
                    productVariantId: item.productVariantId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    isFreeItem: item.isFreeItem ?? false,
                    subtotal: item.unitPrice * item.quantity,
                })),
            },
        },
        include: {
            items: true,
        },
    });

    if (needsApproval) {
        logger.info('Walk-in dispatch needs approval', {
            salesOrderId: so.id,
            creditOk,
            allPricesValid,
            module: 'WalkInDispatch',
        });
        return {
            salesOrder: so,
            deliveryOrder: null,
            needsApproval: true,
        };
    }

    // For immediate path: confirm the SO (reserves stock)
    try {
        await confirmOrder(so.id, userId);
    } catch (err) {
        logger.error('Walk-in confirmOrder failed', {
            error: err,
            salesOrderId: so.id,
            module: 'WalkInDispatch',
        });
        // SO is still DRAFT — return it so user can see the issue
        return {
            salesOrder: so,
            deliveryOrder: null,
            needsApproval: false,
        };
    }

    // Create DO from confirmed SO
    try {
        const doResult = await createDeliveryOrderFromSalesOrder({
            salesOrderId: so.id,
            sourceLocationId: data.sourceLocationId,
            userId,
        });

        return {
            salesOrder: so,
            deliveryOrder: doResult,
            needsApproval: false,
        };
    } catch (err) {
        logger.error('Walk-in createDO failed after SO confirmed', {
            error: err,
            salesOrderId: so.id,
            module: 'WalkInDispatch',
        });
        // SO confirmed but DO failed — return SO so user can retry DO
        return {
            salesOrder: so,
            deliveryOrder: null,
            needsApproval: false,
        };
    }
}

/**
 * Approve an emergency dispatch SO → create DO.
 */
export async function approveWalkInDispatch(
    salesOrderId: string,
    userId: string,
) {
    const so = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: {
            items: true,
            deliveryOrders: { select: { id: true, orderNumber: true } },
        },
    });
    if (!so) {
        throw new BusinessRuleError(
            'Sales Order tidak ditemukan.',
            { salesOrderId },
            'SO_NOT_FOUND',
        );
    }
    if (so.entrySource !== 'EMERGENCY_DISPATCH') {
        throw new BusinessRuleError(
            'SO ini bukan emergency dispatch.',
            { salesOrderId },
            'NOT_EMERGENCY_DISPATCH',
        );
    }
    if (so.commercialReviewStatus !== 'PENDING') {
        throw new BusinessRuleError(
            `SO sudah ${so.commercialReviewStatus}.`,
            { salesOrderId, status: so.commercialReviewStatus },
            'ALREADY_REVIEWED',
        );
    }

    // Check if DO already exists (idempotent)
    if (so.deliveryOrders.length > 0) {
        return { salesOrder: so, deliveryOrder: so.deliveryOrders[0] };
    }

    // Mark as approved
    await prisma.salesOrder.update({
        where: { id: salesOrderId },
        data: {
            commercialReviewStatus: CommercialReviewStatus.APPROVED,
        },
    });

    // Confirm SO only if still DRAFT; skip if already confirmed/in production
    if (so.status === SalesOrderStatus.DRAFT) {
        await confirmOrder(salesOrderId, userId);
    } else if (!CONFIRMABLE_STATUSES.includes(so.status)) {
        throw new BusinessRuleError(
            `SO berstatus ${so.status} tidak bisa di-approve.`,
            { salesOrderId, status: so.status },
            'SO_NOT_APPROVABLE',
        );
    }

    // Create DO
    if (!so.sourceLocationId) {
        throw new BusinessRuleError(
            'SO tidak memiliki lokasi sumber.',
            { salesOrderId },
            'MISSING_SOURCE_LOCATION',
        );
    }

    const doResult = await createDeliveryOrderFromSalesOrder({
        salesOrderId,
        sourceLocationId: so.sourceLocationId,
        userId,
    });

    return { salesOrder: so, deliveryOrder: doResult };
}

/**
 * Reject an emergency dispatch SO.
 */
export async function rejectWalkInDispatch(
    salesOrderId: string,
    _userId: string,
    _reason?: string,
) {
    const so = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: { id: true, entrySource: true, commercialReviewStatus: true },
    });
    if (!so) {
        throw new BusinessRuleError(
            'Sales Order tidak ditemukan.',
            { salesOrderId },
            'SO_NOT_FOUND',
        );
    }
    if (so.entrySource !== 'EMERGENCY_DISPATCH') {
        throw new BusinessRuleError(
            'SO ini bukan emergency dispatch.',
            { salesOrderId },
            'NOT_EMERGENCY_DISPATCH',
        );
    }

    const updated = await prisma.salesOrder.update({
        where: { id: salesOrderId },
        data: {
            commercialReviewStatus: CommercialReviewStatus.REJECTED,
            status: SalesOrderStatus.CANCELLED,
        },
    });

    return updated;
}
