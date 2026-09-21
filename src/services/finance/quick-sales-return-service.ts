import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import {
    quickReturnPostSchema,
    quickReturnSelectionSchema,
    type QuickReturnSelection,
    type QuickReturnPreview,
} from '@/lib/finance/quick-sales-return';
import { prepareNewReturnCreditProposal } from './return-credit-proposal-service';
import { receiveReturnInTransaction } from './sales-return-receipt-service';
import { postManualReturnCreditInTransaction } from './manual-return-credit-service';

const hash = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zero = () => new Prisma.Decimal(0);
const tenantDb = () => {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks tenant wajib untuk retur langsung.',
        );
    return db;
};
const normalize = (selection: QuickReturnSelection): QuickReturnSelection => ({
    salesOrderId: selection.salesOrderId,
    items: selection.items
        .map((item) => ({
            ...item,
            quantity: new Prisma.Decimal(item.quantity).toString(),
        }))
        .sort((a, b) => a.productVariantId.localeCompare(b.productVariantId)),
});

/** Bounded lookups: no global customer/product master or arbitrary selling-price input. */
export async function getQuickReturnOrders(search: unknown = '') {
    const term = z.string().trim().max(100).parse(search);
    return tenantDb().salesOrder.findMany({
        where: {
            orderType: { not: 'MAKLON_JASA' },
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            ...(term
                ? { orderNumber: { contains: term, mode: 'insensitive' } }
                : {}),
            invoices: {
                some: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
            },
        },
        select: { id: true, orderNumber: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
}

export async function getQuickReturnOrderItems(orderId: unknown) {
    const order = await tenantDb().salesOrder.findUnique({
        where: { id: z.string().min(1).max(100).parse(orderId) },
        select: {
            items: {
                orderBy: { id: 'asc' },
                select: {
                    productVariantId: true,
                    productVariant: {
                        select: {
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                            product: { select: { productType: true } },
                        },
                    },
                },
            },
        },
    });
    if (!order) throw new NotFoundError('SO');
    return [
        ...new Map(
            order.items
                .filter(
                    (item) =>
                        item.productVariant.product.productType ===
                        'FINISHED_GOOD',
                )
                .map((item) => [
                    item.productVariantId,
                    {
                        productVariantId: item.productVariantId,
                        name: item.productVariant.name,
                        skuCode: item.productVariant.skuCode,
                        unit: item.productVariant.primaryUnit,
                    },
                ]),
        ).values(),
    ];
}

async function prepare(
    tx: Prisma.TransactionClient,
    selection: QuickReturnSelection,
    postingDate: Date,
) {
    const order = await tx.salesOrder.findUnique({
        where: { id: selection.salesOrderId },
        include: {
            items: {
                include: { productVariant: { include: { product: true } } },
            },
        },
    });
    if (!order) throw new NotFoundError('SO');
    if (
        !order.customerId ||
        order.orderType === 'MAKLON_JASA' ||
        ['DRAFT', 'CANCELLED'].includes(order.status)
    )
        throw new BusinessRuleError(
            'SO/customer tidak dapat dipakai untuk retur barang jadi.',
        );
    const movements = await tx.stockMovement.findMany({
        where: {
            salesOrderId: order.id,
            type: 'OUT',
            productVariantId: {
                in: selection.items.map((item) => item.productVariantId),
            },
            fromLocationId: { not: null },
            toLocationId: null,
            goodsReceiptId: null,
            productionOrderId: null,
        },
        include: { fromLocation: true },
        orderBy: { id: 'asc' },
        take: 201,
    });
    if (movements.length > 200)
        throw new BusinessRuleError(
            'Sumber pengiriman terlalu banyak. Gunakan retur dengan referensi surat jalan.',
        );
    const lines = [];
    for (const item of selection.items) {
        const matches = order.items.filter(
            (line) => line.productVariantId === item.productVariantId,
        );
        if (
            matches.length !== 1 ||
            matches[0].productVariant.product.productType !== 'FINISHED_GOOD'
        )
            throw new BusinessRuleError(
                'Produk harus barang jadi pada satu baris SO; produk ganda perlu pemeriksaan Finance.',
            );
        const candidates = movements.filter(
            (movement) => movement.productVariantId === item.productVariantId,
        );
        // No implicit FIFO: different shipment cost/location cannot be inferred from SKU alone.
        if (candidates.length !== 1)
            throw new BusinessRuleError(
                'Pengiriman produk kosong atau lebih dari satu. Gunakan alur retur dengan pilihan sumber pengiriman.',
            );
        const source = candidates[0];
        if (
            !source.fromLocation ||
            source.fromLocation.locationType !== 'INTERNAL' ||
            !['FINISHED_GOOD', 'GENERAL_PURPOSE'].includes(
                source.fromLocation.locationPurpose,
            )
        )
            throw new BusinessRuleError(
                'Gudang asal bukan lokasi persediaan barang jadi internal. Periksa lokasi pengiriman.',
            );
        const previous = await tx.salesReturnReceiptLine.aggregate({
            where: { sourceMovementId: source.id },
            _sum: { quantity: true },
        });
        if (
            (previous._sum.quantity ?? zero())
                .plus(item.quantity)
                .gt(source.quantity)
        )
            throw new BusinessRuleError(
                'Jumlah retur melebihi sisa barang yang pernah dikirim.',
            );
        lines.push({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            name: matches[0].productVariant.name,
            unit: matches[0].productVariant.primaryUnit,
            unitPrice: matches[0].unitPrice,
            source,
        });
    }
    const locations = new Set(lines.map((line) => line.source.fromLocationId));
    if (locations.size !== 1)
        throw new BusinessRuleError(
            'Gudang asal berbeda. Pisahkan retur per gudang.',
        );
    const proposal = await prepareNewReturnCreditProposal(tx, {
        salesOrderId: order.id,
        postingDate,
        items: selection.items.map((item) => ({
            productVariantId: item.productVariantId,
            returnedQty: new Prisma.Decimal(item.quantity),
        })),
    });
    if (!proposal.ready) throw new BusinessRuleError(proposal.reason);
    // Do not compound a cached/phantom payment discrepancy while simplifying the UI.
    const payments = await tx.payment.aggregate({
        where: { invoiceId: proposal.invoiceId },
        _sum: { amount: true },
    });
    const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: proposal.invoiceId },
    });
    if (!(payments._sum.amount ?? zero()).equals(invoice.paidAmount))
        throw new BusinessRuleError(
            'Saldo pembayaran invoice tidak cocok dengan transaksi pembayaran. Rekonsiliasi Finance diperlukan.',
        );
    const fingerprint = hash({
        selection,
        proposal: proposal.fingerprint,
        sources: lines.map((line) => line.source),
    });
    const preview: QuickReturnPreview = {
        fingerprint,
        invoiceNumber: proposal.invoiceNumber,
        orderNumber: proposal.orderNumber,
        totalAmount: proposal.totalAmount,
        taxAmount: proposal.taxAmount,
        remaining: proposal.remaining,
        remainingAfter: proposal.remainingAfter,
        source: proposal.source,
        locationName: lines[0].source.fromLocation!.name,
        items: lines.map(({ productVariantId, name, quantity, unit }) => ({
            productVariantId,
            name,
            quantity,
            unit,
        })),
    };
    return { order, lines, proposal, preview };
}

export async function previewQuickSalesReturn(
    input: unknown,
): Promise<QuickReturnPreview> {
    const selection = normalize(quickReturnSelectionSchema.parse(input));
    return tenantDb().$transaction(
        async (tx) =>
            (
                await prepare(
                    tx,
                    selection,
                    new Date(
                        `${toBusinessDateString(new Date())}T00:00:00+07:00`,
                    ),
                )
            ).preview,
    );
}

/** Create + receive + credit + audit share one transaction. A quote is not permission
 * to bypass receipt valuation, journal/period checks or the Finance action guard. */
export async function postQuickSalesReturn(input: unknown, userId: string) {
    const data = quickReturnPostSchema.parse(input);
    const selection = normalize(data.selection);
    const signature = hash({ selection, fingerprint: data.fingerprint });
    const evidence = `Retur langsung ${data.requestId}; persetujuan ${signature}`;
    return tenantDb().$transaction(
        async (tx) => {
            // Same request across tabs/SOs is serialized without introducing a sequence/schema.
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${data.requestId}, 0))`;
            const existing = await tx.salesReturn.findUnique({
                where: { id: data.requestId },
                include: { credit: true },
            });
            if (existing) {
                if (
                    existing.createdById !== userId ||
                    existing.salesOrderId !== selection.salesOrderId ||
                    existing.credit?.status !== 'POSTED' ||
                    existing.credit.evidenceReference !== evidence
                )
                    throw new BusinessRuleError(
                        'Permintaan ini sudah dipakai dengan data berbeda. Muat ulang; jangan mengulang retur.',
                    );
                return { id: existing.id, returnNumber: existing.returnNumber };
            }
            // Match shipment/issuance lock order: SO -> items/deliveries -> invoice -> movement.
            await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id=${selection.salesOrderId} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "SalesOrderItem" WHERE "salesOrderId"=${selection.salesOrderId} ORDER BY id FOR SHARE`;
            await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE "salesOrderId"=${selection.salesOrderId} ORDER BY id FOR SHARE`;
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "salesOrderId"=${selection.salesOrderId} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE "salesOrderId"=${selection.salesOrderId} AND type='OUT' ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT j.id FROM "JournalEntry" j JOIN "Invoice" i ON i.id=j."referenceId" WHERE i."salesOrderId"=${selection.salesOrderId} AND j."referenceType"='SALES_INVOICE' ORDER BY j.id FOR UPDATE OF j`;
            const now = new Date();
            const postingDate = new Date(
                `${toBusinessDateString(now)}T00:00:00+07:00`,
            );
            const prepared = await prepare(tx, selection, postingDate);
            if (prepared.preview.fingerprint !== data.fingerprint)
                throw new BusinessRuleError(
                    'Sumber atau saldo berubah. Periksa ulang ringkasan retur sebelum menyimpan.',
                );
            const { proposal, lines, order } = prepared;
            const returned = await tx.salesReturn.create({
                data: {
                    id: data.requestId,
                    returnNumber: `SR-${toBusinessDateString(now).replaceAll('-', '')}-${data.requestId}`,
                    salesOrderId: order.id,
                    customerId: order.customerId,
                    returnLocationId: lines[0].source.fromLocationId!,
                    status: 'CONFIRMED',
                    returnDate: postingDate,
                    createdById: userId,
                    reason: 'Retur barang baik diterima; potong invoice SO terkait.',
                    totalAmount: proposal.totalAmount,
                    items: {
                        create: lines.map((line) => ({
                            id: randomUUID(),
                            productVariantId: line.productVariantId,
                            returnedQty: line.quantity,
                            unitPrice: line.unitPrice,
                            condition: 'GOOD',
                            reason: 'OTHER',
                        })),
                    },
                },
                include: { items: true },
            });
            await logActivity({
                userId,
                action: 'CONFIRM_SALES_RETURN',
                entityType: 'SalesReturn',
                entityId: returned.id,
                toStatus: 'CONFIRMED',
                details:
                    'Retur langsung: penerimaan barang baik dan potongan disetujui Finance.',
                tx,
            });
            await receiveReturnInTransaction(
                tx,
                {
                    returnId: returned.id,
                    receivedAt: now,
                    lines: returned.items.map((item) => ({
                        returnItemId: item.id,
                        sourceMovementId: lines.find(
                            (line) =>
                                line.productVariantId === item.productVariantId,
                        )!.source.id,
                    })),
                },
                userId,
            );
            await postManualReturnCreditInTransaction(
                tx,
                {
                    returnId: returned.id,
                    invoiceId: proposal.invoiceId,
                    postingDate,
                    totalAmount: proposal.totalAmount,
                    taxAmount: proposal.taxAmount,
                    expectedRemaining: proposal.remaining,
                    reason: 'Finance menyetujui penerimaan barang baik dan potongan invoice dalam satu langkah.',
                    evidence,
                    confirmed: true,
                },
                userId,
            );
            await tx.salesReturn.update({
                where: { id: returned.id },
                data: { status: 'COMPLETED' },
            });
            await logActivity({
                userId,
                action: 'COMPLETE_SALES_RETURN',
                entityType: 'SalesReturn',
                entityId: returned.id,
                fromStatus: 'RECEIVED',
                toStatus: 'COMPLETED',
                details: evidence,
                tx,
            });
            return { id: returned.id, returnNumber: returned.returnNumber };
        },
        { timeout: 15000 },
    );
}
