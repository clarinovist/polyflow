import { prisma } from '@/lib/core/prisma';
import {
    PurchaseOrderStatus,
    OrderEntrySource,
    CommercialReviewStatus,
} from '@prisma/client';
import {
    CreateWalkInReceiptValues,
    CreatePurchaseOrderValues,
    CreateGoodsReceiptValues,
} from '@/lib/schemas/purchasing';
import { createOrder, updateOrderStatus } from './orders-service';
import { createGoodsReceipt } from './receipts-service';
import { BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';
import { WALK_IN_NOTE_PREFIX } from '@/lib/purchasing/walk-in';

export {
    WALK_IN_NOTE_PREFIX,
    isWalkInPurchaseOrderNotes,
} from '@/lib/purchasing/walk-in';

const WALK_IN_LOCATIONS_BLOCKED = ['SCRAP', 'CUSTOMER_OWNED'];

export async function listReceivablePurchaseOrders() {
    return prisma.purchaseOrder.findMany({
        where: {
            status: {
                in: [
                    PurchaseOrderStatus.SENT,
                    PurchaseOrderStatus.PARTIAL_RECEIVED,
                ],
            },
        },
        select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            expectedDate: true,
            status: true,
            notes: true,
            entrySource: true,
            sourceReference: true,
            commercialReviewStatus: true,
            supplier: { select: { name: true, code: true } },
            items: {
                select: {
                    id: true,
                    quantity: true,
                    receivedQty: true,
                    productVariant: {
                        select: {
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                        },
                    },
                },
            },
            _count: { select: { items: true } },
        },
        orderBy: [{ expectedDate: 'asc' }, { orderDate: 'desc' }],
    });
}

export async function getGoodsReceiptsForDay(day: Date = new Date()) {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    return prisma.goodsReceipt.findMany({
        where: {
            receivedDate: { gte: start, lte: end },
            isMaklon: false,
        },
        select: {
            id: true,
            receiptNumber: true,
            receivedDate: true,
            notes: true,
            purchaseOrder: {
                select: {
                    id: true,
                    orderNumber: true,
                    notes: true,
                    entrySource: true,
                    sourceReference: true,
                    supplier: { select: { name: true } },
                },
            },
        },
        orderBy: { receivedDate: 'desc' },
    });
}

/**
 * Resolve unit cost from explicit value, last PO price, or standardCost.
 * Returns null if no price found — caller must reject (V1 requires cost > 0).
 */
async function resolveUnitCost(
    productVariantId: string,
    supplierId: string,
    explicit: number,
): Promise<number> {
    if (explicit > 0) return explicit;

    const lastItem = await prisma.purchaseOrderItem.findFirst({
        where: {
            productVariantId,
            purchaseOrder: { supplierId },
        },
        orderBy: { purchaseOrder: { orderDate: 'desc' } },
        select: { unitPrice: true },
    });
    if (lastItem && lastItem.unitPrice.toNumber() > 0) {
        return lastItem.unitPrice.toNumber();
    }

    const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        select: { standardCost: true },
    });
    if (variant?.standardCost != null && Number(variant.standardCost) > 0) {
        return Number(variant.standardCost);
    }

    return 0;
}

/**
 * Create a walk-in receipt: auto PO (SENT → RECEIVED via GR) + goods receipt.
 * Idempotent: same idempotencyKey returns existing result.
 */
export async function createWalkInReceipt(
    data: CreateWalkInReceiptValues,
    userId: string,
) {
    if (!data.items.length) {
        throw new BusinessRuleError(
            'Minimal satu item harus diisi.',
            undefined,
            'WALK_IN_EMPTY_ITEMS',
        );
    }

    // Blocked locations
    // (validate location exists and is not blocked)
    const location = await prisma.location.findUnique({
        where: { id: data.locationId },
        select: { id: true, name: true },
    });
    if (!location) {
        throw new BusinessRuleError(
            'Lokasi gudang tidak ditemukan.',
            { locationId: data.locationId },
            'LOCATION_NOT_FOUND',
        );
    }
    if (WALK_IN_LOCATIONS_BLOCKED.includes(location.name)) {
        throw new BusinessRuleError(
            'Lokasi SCRAP atau CUSTOMER_OWNED tidak diterima untuk walk-in.',
            { locationId: data.locationId },
            'LOCATION_BLOCKED',
        );
    }

    // Idempotency check: if PO with this key already exists, return it
    const existingPO = await prisma.purchaseOrder.findFirst({
        where: { idempotencyKey: data.idempotencyKey },
        include: {
            goodsReceipts: { select: { id: true, receiptNumber: true } },
            supplier: { select: { id: true, name: true } },
        },
    });
    if (existingPO) {
        logger.info('Walk-in receipt idempotency hit', {
            purchaseOrderId: existingPO.id,
            idempotencyKey: data.idempotencyKey,
            module: 'WalkInReceipt',
        });
        return {
            purchaseOrder: existingPO,
            goodsReceipt: existingPO.goodsReceipts[0] ?? null,
        };
    }

    const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
        select: { id: true, name: true },
    });
    if (!supplier) {
        throw new BusinessRuleError(
            'Supplier tidak ditemukan.',
            { supplierId: data.supplierId },
            'SUPPLIER_NOT_FOUND',
        );
    }

    // Resolve and validate all item costs (V1: must be > 0)
    const resolvedItems = await Promise.all(
        data.items.map(async (item) => {
            const unitCost = await resolveUnitCost(
                item.productVariantId,
                data.supplierId,
                item.unitCost,
            );
            if (unitCost <= 0) {
                throw new BusinessRuleError(
                    `Harga item ${item.productVariantId} tidak ditemukan. Masukkan harga secara manual.`,
                    { productVariantId: item.productVariantId },
                    'WALK_IN_COST_REQUIRED',
                );
            }
            return {
                productVariantId: item.productVariantId,
                quantity: item.receivedQty,
                unitPrice: unitCost,
                receivedQty: item.receivedQty,
                unitCost,
            };
        }),
    );

    const poNotes = [
        WALK_IN_NOTE_PREFIX,
        `No.nota: ${data.supplierRefNo}`,
        data.notes?.trim() || null,
    ]
        .filter(Boolean)
        .join('\n');

    const orderInput: CreatePurchaseOrderValues = {
        supplierId: data.supplierId,
        orderDate: data.receivedDate,
        expectedDate: data.receivedDate,
        deliveryAddress: undefined as unknown as string,
        notes: poNotes,
        shippingCost: 0,
        items: resolvedItems.map((i) => ({
            productVariantId: i.productVariantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountPercent: 0,
            taxPercent: 0,
            dppOtherAmount: null,
            ppnMode: 'EXCLUDE',
        })),
    };

    let order: Awaited<ReturnType<typeof createOrder>>;
    try {
        order = await createOrder(orderInput, userId);
    } catch (err) {
        logger.error('Walk-in createOrder failed', {
            error: err,
            module: 'WalkInReceipt',
        });
        throw err;
    }

    // Set walk-in metadata on PO
    await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: {
            entrySource: OrderEntrySource.WALK_IN_RECEIPT,
            sourceReference: data.supplierRefNo,
            idempotencyKey: data.idempotencyKey,
        },
    });

    // Force SENT so status machine matches planned receive path before GR.
    await updateOrderStatus(order.id, PurchaseOrderStatus.SENT, userId);

    // Map created PO item IDs by productVariantId
    const poItemMap = new Map(
        (order.items || []).map((item) => [item.productVariantId, item.id]),
    );

    const grInput: CreateGoodsReceiptValues = {
        purchaseOrderId: order.id,
        isMaklon: false,
        receivedDate: data.receivedDate,
        locationId: data.locationId,
        notes: `Nota: ${data.supplierRefNo}${data.notes ? ` | ${data.notes}` : ''}`,
        items: resolvedItems.map((i) => ({
            purchaseOrderItemId: poItemMap.get(i.productVariantId),
            productVariantId: i.productVariantId,
            receivedQty: i.receivedQty,
            unitCost: i.unitCost,
        })),
    };

    try {
        const receipt = await createGoodsReceipt(grInput, userId);

        return {
            purchaseOrder: order,
            goodsReceipt: receipt,
        };
    } catch (err) {
        logger.error('Walk-in createGoodsReceipt failed after PO created', {
            error: err,
            module: 'WalkInReceipt',
            purchaseOrderId: order.id,
        });
        throw err;
    }
}

/**
 * Finance approval: approve walk-in purchase invoice → UNPAID.
 * Idempotent: if already UNPAID/PAID, returns existing.
 */
export async function approveWalkInInvoice(
    invoiceId: string,
    _userId: string,
) {
    const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: {
            purchaseOrder: {
                select: {
                    id: true,
                    entrySource: true,
                    commercialReviewStatus: true,
                },
            },
        },
    });
    if (!invoice) {
        throw new BusinessRuleError(
            'Invoice tidak ditemukan.',
            { invoiceId },
            'INVOICE_NOT_FOUND',
        );
    }
    if (invoice.purchaseOrder.entrySource !== 'WALK_IN_RECEIPT') {
        throw new BusinessRuleError(
            'Invoice ini bukan walk-in.',
            { invoiceId },
            'NOT_WALK_IN_INVOICE',
        );
    }
    if (
        invoice.status === 'UNPAID' ||
        invoice.status === 'PARTIAL' ||
        invoice.status === 'PAID'
    ) {
        return invoice; // already approved
    }
    if (invoice.status !== 'DRAFT') {
        throw new BusinessRuleError(
            `Invoice berstatus ${invoice.status} tidak bisa di-approve.`,
            { invoiceId, status: invoice.status },
            'INVOICE_NOT_APPROVABLE',
        );
    }

    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseInvoice.update({
            where: { id: invoiceId },
            data: { status: 'UNPAID' },
        });

        // Mark PO commercial review as approved
        await tx.purchaseOrder.update({
            where: { id: invoice.purchaseOrder.id },
            data: {
                commercialReviewStatus: CommercialReviewStatus.APPROVED,
            },
        });

        return updated;
    });

    // Sync journal status
    try {
        const { AutoJournalService } = await import(
            '@/services/finance/auto-journal-service'
        );
        await AutoJournalService.handlePurchaseInvoiceCreated(invoiceId);
    } catch (err) {
        logger.error('Auto-Journal sync failed on walk-in invoice approve', {
            error: err,
            invoiceId,
            module: 'WalkInReceipt',
        });
    }

    return result;
}

/**
 * Finance rejection: reject walk-in purchase invoice.
 * Requires reversal flow if stock already moved.
 */
export async function rejectWalkInInvoice(
    invoiceId: string,
    _userId: string,
    _reason?: string,
) {
    const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: {
            purchaseOrder: {
                select: {
                    id: true,
                    orderNumber: true,
                    entrySource: true,
                },
            },
        },
    });
    if (!invoice) {
        throw new BusinessRuleError(
            'Invoice tidak ditemukan.',
            { invoiceId },
            'INVOICE_NOT_FOUND',
        );
    }
    if (invoice.purchaseOrder.entrySource !== 'WALK_IN_RECEIPT') {
        throw new BusinessRuleError(
            'Invoice ini bukan walk-in.',
            { invoiceId },
            'NOT_WALK_IN_INVOICE',
        );
    }
    if (invoice.status === 'CANCELLED') {
        return invoice; // already rejected
    }

    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseInvoice.update({
            where: { id: invoiceId },
            data: { status: 'CANCELLED' },
        });

        await tx.purchaseOrder.update({
            where: { id: invoice.purchaseOrder.id },
            data: {
                commercialReviewStatus: CommercialReviewStatus.REJECTED,
            },
        });

        return updated;
    });

    return result;
}
