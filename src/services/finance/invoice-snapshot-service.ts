import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    invoiceSnapshotSchema,
    readInvoiceSnapshot,
    type InvoiceSnapshot,
} from '@/lib/finance/invoice-snapshot';

const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const cash = (value: Prisma.Decimal.Value) =>
    dec(value).toDecimalPlaces(2).toFixed(2);
const incompatible = () =>
    new BusinessRuleError(
        'Atribusi invoice lama tidak tersedia atau berubah. Rekonsiliasi Finance diperlukan sebelum pengiriman/invoice tambahan.',
        {},
        'INVOICE_SNAPSHOT_REVIEW_REQUIRED',
    );

export async function assertInvoiceAllocationKnown(
    tx: Prisma.TransactionClient,
    salesOrderId: string,
) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "salesOrderId" = ${salesOrderId} ORDER BY id FOR UPDATE`;
    const invoices = await tx.invoice.findMany({
        where: { salesOrderId, status: { not: 'CANCELLED' } },
        include: {
            _count: {
                select: { priceAdjustments: { where: { status: 'POSTED' } } },
            },
        },
    });
    if (
        invoices.some(
            (invoice) =>
                Number(invoice.priceAdjustmentAmount ?? 0) !== 0 ||
                (invoice._count?.priceAdjustments ?? 0) > 0,
        )
    ) {
        throw new BusinessRuleError(
            'SO memiliki penyesuaian harga invoice aktif. Periksa Finance sebelum revisi atau pengiriman tambahan.',
        );
    }
    for (const invoice of invoices) {
        const snapshot = readInvoiceSnapshot(invoice.commercialSnapshot);
        if (!snapshot) throw incompatible();
    }
}

/** Caller owns SO -> Invoice locks. Delta is per source item, not a monetary guess. */
export async function buildInvoiceSnapshot(
    tx: Prisma.TransactionClient,
    salesOrderId: string,
    existing: { id: string; status: string; commercialSnapshot?: unknown }[],
    draftId?: string,
): Promise<InvoiceSnapshot> {
    const order = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: {
            customer: true,
            items: {
                orderBy: { id: 'asc' },
                include: { productVariant: { include: { product: true } } },
            },
            deliveryOrders: {
                where: {
                    stockCommittedAt: { not: null },
                    status: { notIn: ['CANCELLED', 'RETURNED'] },
                },
                select: { totalCharge: true },
            },
        },
    });
    if (!order) throw new NotFoundError('Sales Order', salesOrderId);
    const delivered = order.items.some((item) => item.deliveredQty.gt(0));
    const basis =
        delivered || order.deliveryOrders.length > 0 ? 'DELIVERED' : 'ORDERED';
    const prior = existing
        .filter((i) => i.id !== draftId)
        .map((i) => {
            const snap = readInvoiceSnapshot(i.commercialSnapshot);
            if (!snap) throw incompatible();
            return snap;
        });
    // A legacy draft may be recaptured only when it is the sole draft: it has not been issued yet.
    if (existing.some((i) => i.status === 'DRAFT' && i.id !== draftId))
        throw new BusinessRuleError(
            'Lebih dari satu draft invoice. Rekonsiliasi dahulu.',
        );
    const committedItems = prior.flatMap((s) => s.items);
    if (
        committedItems.some(
            (item) =>
                !order.items.some(
                    (current) =>
                        current.id === item.sourceItemId &&
                        current.productVariantId === item.productVariantId,
                ),
        )
    )
        throw incompatible();
    const items: InvoiceSnapshot['items'] = [];
    for (const item of order.items) {
        const quantity =
            basis === 'DELIVERED' ? item.deliveredQty : item.quantity;
        const allocated = committedItems.filter(
            (i) => i.sourceItemId === item.id,
        );
        if (
            allocated.some(
                (i) =>
                    i.productVariantId !== item.productVariantId ||
                    !dec(i.unitPrice).eq(item.unitPrice) ||
                    i.discountPercent !== Number(item.discountPercent ?? 0) ||
                    i.taxPercent !== Number(item.taxPercent ?? 0) ||
                    i.ppnMode !== item.ppnMode,
            )
        )
            throw incompatible();
        const billedQty = allocated.reduce(
            (sum, i) => sum.plus(i.quantity),
            dec(0),
        );
        // Pre-invoiced ORDERED quantities can exceed initial partial deliveries; do not credit or rebill them.
        if (quantity.lt(billedQty)) {
            if (
                prior.some(
                    (s) =>
                        s.basis === 'ORDERED' &&
                        s.items.some((i) => i.sourceItemId === item.id),
                )
            )
                continue;
            throw incompatible();
        }
        const remaining = quantity.minus(billedQty);
        if (remaining.isZero()) continue;
        const discountPercent = Number(item.discountPercent ?? 0);
        const taxPercent = Number(item.taxPercent ?? 0);
        const raw = quantity.times(item.unitPrice);
        const discount = raw.times(discountPercent).div(100).toDecimalPlaces(2);
        const afterDiscount = raw.minus(discount).toDecimalPlaces(2);
        const net =
            item.ppnMode === 'INCLUDE'
                ? afterDiscount
                      .div(dec(1).plus(dec(taxPercent).div(100)))
                      .toDecimalPlaces(2)
                : afterDiscount;
        const tax =
            item.ppnMode === 'INCLUDE'
                ? afterDiscount.minus(net)
                : net.times(taxPercent).div(100).toDecimalPlaces(2);
        const delta = (
            amount: Prisma.Decimal,
            field: 'netAmount' | 'taxAmount' | 'discountAmount',
        ) => {
            const result = amount.minus(
                allocated.reduce((sum, i) => sum.plus(i[field]), dec(0)),
            );
            if (result.isNegative()) throw incompatible();
            return cash(result);
        };
        const netAmount = delta(net, 'netAmount');
        const taxAmount = delta(tax, 'taxAmount');
        const factor = item.conversionFactorSnapshot ?? dec(1);
        if (!factor.gt(0)) throw incompatible();
        items.push({
            sourceItemId: item.id,
            productVariantId: item.productVariantId,
            name: item.productVariant.name,
            skuCode: item.productVariant.skuCode,
            unit: item.productVariant.primaryUnit,
            quantity: remaining.toNumber(),
            unitPrice: cash(item.unitPrice),
            discountPercent,
            taxPercent,
            ppnMode: item.ppnMode,
            netAmount,
            taxAmount,
            discountAmount: delta(discount, 'discountAmount'),
            totalAmount: cash(dec(netAmount).plus(taxAmount)),
            enteredUnit: item.enteredUnit ?? item.productVariant.primaryUnit,
            conversionFactor: factor.toNumber(),
            enteredQuantity: remaining
                .div(factor)
                .toDecimalPlaces(4)
                .toNumber(),
            enteredUnitPrice: cash(
                item.enteredUnitPrice ?? item.unitPrice.times(factor),
            ),
            revenueAccountId: item.productVariant.revenueAccountId,
            product: {
                id: item.productVariant.productId,
                name: item.productVariant.product.name,
                revenueAccountId: item.productVariant.product.revenueAccountId,
            },
        });
    }
    const cumulativeShipping =
        basis === 'DELIVERED'
            ? order.deliveryOrders.reduce(
                  (sum, d) => sum.plus(d.totalCharge ?? 0),
                  dec(0),
              )
            : dec(order.shippingCost ?? 0);
    const allocatedShipping = prior.reduce(
        (sum, s) => sum.plus(s.shippingAmount),
        dec(0),
    );
    if (
        cumulativeShipping.lt(allocatedShipping) &&
        !prior.some((s) => s.basis === 'ORDERED')
    )
        throw incompatible();
    const shipping = Prisma.Decimal.max(
        0,
        cumulativeShipping.minus(allocatedShipping),
    );
    const sum = (field: 'totalAmount' | 'taxAmount' | 'discountAmount') =>
        items.reduce((s, i) => s.plus(i[field]), dec(0));
    return invoiceSnapshotSchema.parse({
        version: 1,
        basis,
        orderNumber: order.orderNumber,
        customer: order.customer
            ? {
                  name: order.customer.name,
                  billingAddress: order.customer.billingAddress,
                  taxId: order.customer.taxId,
                  phone: order.customer.phone,
                  email: order.customer.email,
              }
            : null,
        items,
        shippingAmount: cash(shipping),
        taxAmount: cash(sum('taxAmount')),
        discountAmount: cash(sum('discountAmount')),
        commercialTotal: cash(sum('totalAmount').plus(shipping)),
    });
}
