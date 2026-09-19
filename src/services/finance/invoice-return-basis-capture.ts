import { Prisma } from '@prisma/client';
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';
import { buildInvoiceReturnBasis } from './invoice-return-basis';
import { readInvoiceSnapshot } from '@/lib/finance/invoice-snapshot';

/** A draft can be reissued, but a recognized invoice's historical basis cannot be replaced. */
export async function refreshDraftInvoiceReturnBasis(
    tx: Prisma.TransactionClient,
    invoiceId: string,
) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { status: true, creditedAmount: true },
    });
    if (!invoice || invoice.status !== 'DRAFT' || invoice.creditedAmount.gt(0))
        throw new BusinessRuleError(
            'Snapshot invoice yang diakui tidak boleh diubah.',
        );
    if (await tx.salesReturnCreditAllocation.count({ where: { invoiceId } }))
        throw new BusinessRuleError('Snapshot sudah dipakai kredit retur.');
    await tx.invoiceReturnBasisLine.deleteMany({ where: { invoiceId } });
    return captureInvoiceReturnBasis(tx, invoiceId);
}

/** Call only inside NEW invoice issuance tx, after its journal is created; never as legacy repair. */
export async function captureInvoiceReturnBasis(
    tx: Prisma.TransactionClient,
    invoiceId: string,
): Promise<'EXISTS' | 'CAPTURED' | 'REVIEW_REQUIRED'> {
    if (
        (
            await tx.invoiceReturnBasisLine.findMany({
                where: { invoiceId },
                select: { id: true },
            })
        ).length
    )
        return 'EXISTS';
    const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            salesOrder: {
                include: {
                    items: true,
                    deliveryOrders: {
                        where: { status: { in: ['SHIPPED', 'DELIVERED'] } },
                        select: { totalCharge: true },
                    },
                },
            },
        },
    });
    if (!invoice)
        throw new BusinessRuleError('Invoice sumber tidak ditemukan.');
    const snapshot = readInvoiceSnapshot(invoice.commercialSnapshot);
    if (snapshot) {
        // Shipping-only supplementary invoices have no returnable goods basis.
        if (snapshot.items.length === 0) return 'REVIEW_REQUIRED';
        const journals = await tx.journalEntry.findMany({
            where: {
                referenceType: 'SALES_INVOICE',
                referenceId: invoiceId,
                status: { not: 'VOIDED' },
            },
            include: {
                lines: { include: { account: { select: { type: true } } } },
            },
        });
        if (journals.length !== 1)
            throw new BusinessRuleError(
                'Jurnal sumber snapshot invoice tidak tersedia atau ambigu.',
            );
        const journal = journals[0];
        const tax = journal.lines
            .filter((line) => line.account.type === 'LIABILITY')
            .reduce(
                (sum, line) => sum.plus(line.credit).minus(line.debit),
                new Prisma.Decimal(0),
            );
        const lines = snapshot.items.map((item) => ({
            sourceItemId: item.sourceItemId,
            productVariantId: item.productVariantId,
            quantity: String(item.quantity),
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            discountAmount: item.discountAmount,
        }));
        const evidence = {
            totalAmount: invoice.totalAmount.toFixed(2),
            roundingAmount: new Prisma.Decimal(
                invoice.roundingAmount ?? 0,
            ).toFixed(2),
            shippingAmount: snapshot.shippingAmount,
            journalTaxAmount: tax.toFixed(2),
            lines,
        };
        buildInvoiceReturnBasis(evidence);
        await tx.invoiceReturnBasisLine.createMany({
            data: lines.map((line) => ({
                ...line,
                invoiceId,
                sourceJournalId: journal.id,
                sourceEvidence: {
                    version: 1,
                    capturedAtInvoiceCreation: true,
                    commercialSnapshotVersion: 1,
                    invoiceTotal: evidence.totalAmount,
                    shippingAmount: evidence.shippingAmount,
                    roundingAmount: evidence.roundingAmount,
                    journalTaxAmount: evidence.journalTaxAmount,
                },
            })),
        });
        return 'CAPTURED';
    }
    const other = await tx.invoice.findMany({
        where: {
            salesOrderId: invoice.salesOrderId,
            id: { not: invoiceId },
            status: { not: 'CANCELLED' },
        },
        include: { returnBasisLines: true },
    });
    // Never reconstruct a prior invoice's quantity/value from today's SO.
    if (
        other.some(
            (prior) =>
                !prior.returnBasisLines?.length ||
                prior.returnBasisLines.some((line) => {
                    const evidence = line.sourceEvidence;
                    return (
                        !evidence ||
                        typeof evidence !== 'object' ||
                        Array.isArray(evidence) ||
                        evidence.version !== 1 ||
                        evidence.capturedAtInvoiceCreation !== true
                    );
                }),
        )
    )
        return 'REVIEW_REQUIRED';
    const journals = await tx.journalEntry.findMany({
        where: {
            referenceType: 'SALES_INVOICE',
            referenceId: invoiceId,
            status: { not: 'VOIDED' },
        },
        include: {
            lines: { include: { account: { select: { type: true } } } },
        },
    });
    if (journals.length !== 1) return 'REVIEW_REQUIRED';
    const journal = journals[0];
    const hasDelivered = invoice.salesOrder.items.some((item) =>
        item.deliveredQty.gt(0),
    );
    const cumulativeLines = invoice.salesOrder.items.flatMap((item) => {
        const quantity = hasDelivered ? item.deliveredQty : item.quantity;
        if (quantity.lte(0)) return [];
        const raw = quantity.mul(item.unitPrice);
        const discount = raw.mul(item.discountPercent ?? 0).div(100);
        const discounted = raw.minus(discount);
        const rate = new Prisma.Decimal(item.taxPercent ?? 0).div(100);
        const net =
            item.ppnMode === 'INCLUDE'
                ? discounted.div(rate.plus(1)).toDecimalPlaces(2)
                : discounted.toDecimalPlaces(2);
        const tax =
            item.ppnMode === 'INCLUDE'
                ? discounted.minus(net).toDecimalPlaces(2)
                : discounted.mul(rate).toDecimalPlaces(2);
        return [
            {
                sourceItemId: item.id,
                productVariantId: item.productVariantId,
                quantity: quantity.toString(),
                netAmount: net.toFixed(2),
                taxAmount: tax.toFixed(2),
                discountAmount: discount.toFixed(2),
            },
        ];
    });
    const previousLines = other.flatMap((prior) => prior.returnBasisLines);
    if (
        previousLines.some(
            (prior) =>
                !cumulativeLines.some(
                    (line) =>
                        line.sourceItemId === prior.sourceItemId &&
                        line.productVariantId === prior.productVariantId,
                ),
        )
    )
        return 'REVIEW_REQUIRED';
    if (
        previousLines.some((prior) => {
            const current = cumulativeLines.find(
                (line) => line.sourceItemId === prior.sourceItemId,
            )!;
            const captured = previousLines
                .filter((line) => line.sourceItemId === prior.sourceItemId)
                .reduce(
                    (sum, line) => sum.plus(line.quantity),
                    new Prisma.Decimal(0),
                );
            return captured.gt(current.quantity);
        })
    )
        return 'REVIEW_REQUIRED';
    const lines = cumulativeLines
        .map((line) => {
            const prior = previousLines.filter(
                (previous) => previous.sourceItemId === line.sourceItemId,
            );
            const residual = (
                key: 'quantity' | 'netAmount' | 'taxAmount' | 'discountAmount',
            ) =>
                prior.reduce(
                    (amount, previous) => amount.minus(previous[key]),
                    new Prisma.Decimal(line[key]),
                );
            return {
                ...line,
                quantity: residual('quantity').toString(),
                netAmount: residual('netAmount').toFixed(2),
                taxAmount: residual('taxAmount').toFixed(2),
                discountAmount: residual('discountAmount').toFixed(2),
            };
        })
        .filter(
            (line) =>
                new Prisma.Decimal(line.quantity).gt(0) ||
                [line.netAmount, line.taxAmount, line.discountAmount].some(
                    (value) => !new Prisma.Decimal(value).isZero(),
                ),
        );
    const cumulativeShipping = invoice.salesOrder.deliveryOrders.length
        ? invoice.salesOrder.deliveryOrders.reduce(
              (sum, delivery) => sum.plus(delivery.totalCharge ?? 0),
              new Prisma.Decimal(0),
          )
        : new Prisma.Decimal(invoice.salesOrder.shippingCost ?? 0);
    const previousShipping = other.reduce((sum, prior) => {
        const evidence = prior.returnBasisLines[0]
            .sourceEvidence as Prisma.JsonObject;
        const shipping =
            typeof evidence.shippingAmount === 'string' &&
            /^\d+(\.\d{1,2})?$/.test(evidence.shippingAmount)
                ? new Prisma.Decimal(evidence.shippingAmount)
                : new Prisma.Decimal(NaN);
        return sum.plus(shipping);
    }, new Prisma.Decimal(0));
    const shipping = cumulativeShipping.minus(previousShipping);
    if (!shipping.isFinite() || shipping.lt(0)) return 'REVIEW_REQUIRED';
    const tax = journal.lines
        .filter((line) => line.account.type === 'LIABILITY')
        .reduce(
            (sum, line) => sum.plus(line.credit).minus(line.debit),
            new Prisma.Decimal(0),
        );
    const evidence = {
        totalAmount: invoice.totalAmount.toFixed(2),
        roundingAmount: new Prisma.Decimal(invoice.roundingAmount ?? 0).toFixed(
            2,
        ),
        shippingAmount: shipping.toFixed(2),
        journalTaxAmount: tax.toFixed(2),
        lines,
    };
    try {
        buildInvoiceReturnBasis(evidence);
    } catch (error) {
        if (
            error instanceof BusinessRuleError ||
            error instanceof ValidationError
        )
            return 'REVIEW_REQUIRED';
        throw error;
    }
    await tx.invoiceReturnBasisLine.createMany({
        data: lines.map((line) => ({
            ...line,
            invoiceId,
            sourceJournalId: journal.id,
            sourceEvidence: {
                version: 1,
                capturedAtInvoiceCreation: true,
                invoiceTotal: evidence.totalAmount,
                shippingAmount: evidence.shippingAmount,
                roundingAmount: evidence.roundingAmount,
                journalTaxAmount: evidence.journalTaxAmount,
            },
        })),
    });
    return 'CAPTURED';
}
