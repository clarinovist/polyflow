import { addDays } from 'date-fns';
import {
    InvoiceStatus,
    SalesOrderStatus,
    Prisma,
} from '@prisma/client';

import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import {
    CreateInvoiceValues,
    UpdateInvoiceStatusValues,
} from '@/lib/schemas/invoice';
import { logActivity } from '@/lib/tools/audit';

import { AutoJournalService } from './auto-journal-service';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';

/**
 * Calculate sales invoice total from actual delivered/shipped quantities (not SO ordered qty).
 * Sum of (deliveredQty × unitPrice × discount × PPN) per SO item + shipping from DO.
 * Fallback to so.totalAmount when no shipments exist yet.
 */
export async function calculateSalesInvoiceTotalFromDelivered(
    salesOrderId: string,
): Promise<number> {
    const so = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: {
            totalAmount: true,
            shippingCost: true,
            items: {
                select: {
                    productVariantId: true,
                    quantity: true,
                    unitPrice: true,
                    discountPercent: true,
                    taxPercent: true,
                    ppnMode: true,
                    deliveredQty: true,
                },
            },
            deliveryOrders: {
                where: { status: { in: ['SHIPPED', 'DELIVERED'] } },
                select: {
                    totalCharge: true,
                    items: {
                        select: {
                            productVariantId: true,
                            quantity: true,
                        },
                    },
                },
            },
        },
    });

    if (!so) return 0;

    // Check if any items have been delivered
    const hasDelivered = so.items.some((item) => {
        const val = item.deliveredQty;
        return (
            (typeof val?.toNumber === 'function'
                ? val.toNumber()
                : Number(val)) > 0
        );
    });
    if (!hasDelivered) {
        const amt = so.totalAmount;
        return (
            (typeof amt?.toNumber === 'function'
                ? amt.toNumber()
                : Number(amt)) ?? 0
        );
    }

    let totalGoods = 0;
    for (const soItem of so.items) {
        const delivered =
            typeof soItem.deliveredQty?.toNumber === 'function'
                ? soItem.deliveredQty.toNumber()
                : Number(soItem.deliveredQty);
        const raw =
            delivered *
            (typeof soItem.unitPrice?.toNumber === 'function'
                ? soItem.unitPrice.toNumber()
                : Number(soItem.unitPrice));
        const discPct =
            typeof soItem.discountPercent?.toNumber === 'function'
                ? soItem.discountPercent.toNumber()
                : Number(soItem.discountPercent) || 0;
        const discount = raw * (discPct / 100);
        const afterDiscount = raw - discount;
        const taxPct =
            typeof soItem.taxPercent?.toNumber === 'function'
                ? soItem.taxPercent.toNumber()
                : Number(soItem.taxPercent) || 0;
        const ppnRes = calculatePpn(
            afterDiscount,
            taxPct,
            soItem.ppnMode as PpnMode,
        );
        totalGoods += ppnRes.total;
    }

    // Shipping from DO totalCharge sum (actual shipped) or SO shippingCost fallback
    let shipping = 0;
    if (so.deliveryOrders.length > 0) {
        for (const doRecord of so.deliveryOrders) {
            const charge = doRecord.totalCharge;
            shipping +=
                (typeof charge?.toNumber === 'function'
                    ? charge.toNumber()
                    : Number(charge)) ?? 0;
        }
    } else {
        const shipCost = so.shippingCost;
        shipping =
            (typeof shipCost?.toNumber === 'function'
                ? shipCost.toNumber()
                : Number(shipCost)) ?? 0;
    }

    return Math.round((totalGoods + shipping) * 100) / 100;
}

const ROMAN_MONTHS = [
    'I',
    'II',
    'III',
    'IV',
    'V',
    'VI',
    'VII',
    'VIII',
    'IX',
    'X',
    'XI',
    'XII',
];

function monthToRoman(month: number): string {
    return ROMAN_MONTHS[month - 1];
}

export async function generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const suffix = `/INV/${monthToRoman(now.getMonth() + 1)}/${now.getFullYear()}`;

    // Max sequence, bukan latest createdAt — nomor dari sumber luar (backfill
    // OB, import) bisa punya createdAt terbaru dengan seq kecil dan bikin
    // generator menghasilkan nomor yang sudah terpakai (P2002, lihat plan
    // docs/plan/2026-08-31-fix-invoice-number-collision.md).
    const existing = await prisma.invoice.findMany({
        where: { invoiceNumber: { endsWith: suffix } },
        select: { invoiceNumber: true },
    });

    let maxSequence = 0;
    for (const row of existing) {
        const seq = parseInt(row.invoiceNumber.split('/')[0]);
        if (!isNaN(seq) && seq > maxSequence) {
            maxSequence = seq;
        }
    }

    return `${maxSequence + 1}${suffix}`;
}

const INVOICE_NUMBER_MAX_ATTEMPTS = 3;

/**
 * Create invoice dengan retry khusus P2002 pada `invoiceNumber` (race dua
 * pembuatan bersamaan). Error lain langsung dilempar.
 */
export async function createInvoiceWithNumberRetry<T>(
    create: (invoiceNumber: string) => Promise<T>,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < INVOICE_NUMBER_MAX_ATTEMPTS; attempt++) {
        const invoiceNumber = await generateInvoiceNumber();
        try {
            return await create(invoiceNumber);
        } catch (error) {
            lastError = error;
            const isDuplicateInvoiceNumber =
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                Array.isArray(error.meta?.target) &&
                (error.meta?.target as string[]).includes('invoiceNumber');
            if (!isDuplicateInvoiceNumber) throw error;
        }
    }
    throw lastError;
}

export async function createInvoice(data: CreateInvoiceValues, userId: string) {
    const { salesOrderId, invoiceDate, dueDate, termOfPaymentDays, notes } =
        data;

    const finalDueDate =
        dueDate || addDays(invoiceDate, termOfPaymentDays || 0);

    const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: {
            id: true,
            totalAmount: true,
            orderNumber: true,
            customerId: true,
            status: true,
        },
    });

    if (!salesOrder) {
        throw new NotFoundError('Sales Order', salesOrderId);
    }

    // ── Status gate: block invoicing for quotation/draft/cancelled ──
    const nonInvoicableStatuses: SalesOrderStatus[] = [
        SalesOrderStatus.QUOTATION,
        SalesOrderStatus.QUOTATION_SENT,
        SalesOrderStatus.QUOTATION_REJECTED,
        SalesOrderStatus.QUOTATION_EXPIRED,
        SalesOrderStatus.DRAFT,
        SalesOrderStatus.CANCELLED,
    ];
    if (nonInvoicableStatuses.includes(salesOrder.status)) {
        throw new BusinessRuleError(
            `Tidak bisa membuat invoice untuk SO status ${salesOrder.status}.`,
            { salesOrderId, status: salesOrder.status },
        );
    }

    if (!salesOrder.totalAmount) {
        throw new BusinessRuleError('Sales Order tidak memiliki total amount', {
            salesOrderId,
        });
    }

    if (!salesOrder.customerId) {
        throw new BusinessRuleError(
            'Tidak dapat membuat invoice untuk Sales Order tanpa customer. Lengkapi data customer terlebih dahulu, atau gunakan Production Order untuk pembuatan stok internal.',
            { salesOrderId },
        );
    }

    // Calculate total from delivered qty (fallback to SO total if no deliveries yet)
    const calculatedTotal =
        await calculateSalesInvoiceTotalFromDelivered(salesOrderId);

    const { invoice, invoiceNumber } = await createInvoiceWithNumberRetry(
        async (num) => {
            const created = await prisma.invoice.create({
                data: {
                    invoiceNumber: num,
                    salesOrderId,
                    invoiceDate,
                    dueDate: finalDueDate,
                    termOfPaymentDays: termOfPaymentDays || 0,
                    totalAmount: calculatedTotal,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    notes,
                },
            });
            return { invoice: created, invoiceNumber: num };
        },
    );

    await logActivity({
        userId,
        action: 'CREATE_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: `Invoice ${invoiceNumber} created for Order ${salesOrder.orderNumber} (total from delivered: ${calculatedTotal})`,
    });

    await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(
        (error) => {
            logger.error('Failed to generate auto-journal for invoice', {
                error,
                invoiceId: invoice.id,
                module: 'FinanceInvoiceService',
            });
        },
    );

    return invoice;
}

export async function updateInvoiceStatus(
    data: UpdateInvoiceStatusValues,
    userId: string,
    tx?: Prisma.TransactionClient,
): Promise<void> {
    if (!tx) return prisma.$transaction(db => updateInvoiceStatus(data, userId, db));
    const { lockSalesInvoice, postSalesInvoiceJournal, requireOpenJournalPeriod, RECOGNIZED_INVOICE_STATUSES } = await import('./sales-recognition-service');
    const { id, status, paidAmount } = data;
    const invoice = await lockSalesInvoice(tx, id);
    if (invoice.status === 'DRAFT' && invoice.salesOrder.entrySource === 'EMERGENCY_DISPATCH' &&
        (RECOGNIZED_INVOICE_STATUSES as readonly string[]).includes(status)) {
        throw new BusinessRuleError(
            'Invoice masih DRAFT. Finance harus approve terlebih dahulu sebelum bisa dibayar.',
            { invoiceId: id, currentStatus: invoice.status, targetStatus: status }, 'INVOICE_DRAFT',
        );
    }
    if (status === 'DRAFT' && invoice.status !== 'DRAFT') {
        throw new BusinessRuleError('Invoice yang sudah dikonfirmasi tidak dapat dikembalikan ke DRAFT.', { invoiceId: id }, 'INVALID_STATUS_TRANSITION');
    }
    await tx.invoice.update({ where: { id }, data: { status, ...(paidAmount !== undefined && { paidAmount }) } });
    if ((RECOGNIZED_INVOICE_STATUSES as readonly string[]).includes(status)) {
        await postSalesInvoiceJournal(tx, id, userId);
    } else if (status === 'CANCELLED') {
        const journals = await tx.journalEntry.findMany({
            where: { referenceId: id, referenceType: 'SALES_INVOICE', status: { not: 'VOIDED' } },
            select: { entryDate: true },
        });
        for (const journal of journals) await requireOpenJournalPeriod(tx, journal.entryDate);
        await tx.journalEntry.updateMany({
            where: { referenceId: id, referenceType: 'SALES_INVOICE', status: { not: 'VOIDED' } },
            data: { status: 'VOIDED' },
        });
    }
    await logActivity({
        userId, action: 'UPDATE_INVOICE', entityType: 'Invoice', entityId: id,
        details: `Invoice ${invoice.invoiceNumber} status updated to ${status}`,
        fromStatus: invoice.status, toStatus: status, tx,
    });
}

export async function createDraftInvoiceFromOrder(
    salesOrderId: string,
    userId: string,
) {
    const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
        select: {
            id: true,
            totalAmount: true,
            orderNumber: true,
            customerId: true,
            customer: { select: { paymentTermDays: true } },
        },
    });

    if (!salesOrder || !salesOrder.totalAmount || !salesOrder.customerId) {
        return;
    }

    // Calculate total from delivered qty
    const calculatedTotal =
        await calculateSalesInvoiceTotalFromDelivered(salesOrderId);

    const existingInvoice = await prisma.invoice.findFirst({
        where: { salesOrderId },
    });

    // Upsert: if DRAFT invoice exists, sync totalAmount from delivered qty
    if (existingInvoice) {
        if (existingInvoice.status === 'DRAFT') {
            const existingTotal = existingInvoice.totalAmount.toNumber();
            if (Math.abs(existingTotal - calculatedTotal) > 0.01) {
                await prisma.invoice.update({
                    where: { id: existingInvoice.id },
                    data: { totalAmount: calculatedTotal },
                });
                await logActivity({
                    userId,
                    action: 'SYNC_INVOICE_FROM_DELIVERED',
                    entityType: 'Invoice',
                    entityId: existingInvoice.id,
                    details: `Invoice ${existingInvoice.invoiceNumber} total updated from ${existingTotal} to ${calculatedTotal} based on delivered quantities`,
                });
            }
            return {
                ...existingInvoice,
                totalAmount: { toNumber: () => calculatedTotal } as never,
            };
        }
        if (
            existingInvoice.status === 'UNPAID' ||
            existingInvoice.status === 'PARTIAL' ||
            existingInvoice.status === 'OVERDUE'
        ) {
            // #3: delivered increased after invoice locked — don't overwrite, but emit warning + create second DRAFT for remaining.
            // Caller (delivery commit) will log mismatch; second draft creation attempted via createSecondaryInvoiceIfNeeded below.
            const existingTotal = existingInvoice.totalAmount.toNumber();
            if (calculatedTotal > existingTotal + 0.01) {
                // There's additional delivered value not covered by existing locked invoice → create supplementary DRAFT
                const remaining = calculatedTotal - existingTotal;
                try {
                    const termOfPaymentDays =
                        salesOrder.customer?.paymentTermDays ?? 30;
                    const invoiceDate = new Date();
                    const dueDate = addDays(invoiceDate, termOfPaymentDays);
                    const { supplementary, invoiceNumber } =
                        await createInvoiceWithNumberRetry(async (num) => {
                            const created = await prisma.invoice.create({
                                data: {
                                    invoiceNumber: num,
                                    salesOrderId,
                                    invoiceDate,
                                    dueDate,
                                    termOfPaymentDays,
                                    totalAmount: remaining,
                                    paidAmount: 0,
                                    status: InvoiceStatus.DRAFT,
                                    notes: `Suplementer: tambahan kirim setelah invoice ${existingInvoice.invoiceNumber} (sisa ${remaining}) — SO ${salesOrder.orderNumber}`,
                                },
                            });
                            return {
                                supplementary: created,
                                invoiceNumber: num,
                            };
                        });
                    await logActivity({
                        userId,
                        action: 'CREATE_SUPPLEMENTARY_INVOICE',
                        entityType: 'Invoice',
                        entityId: supplementary.id,
                        details: `Supplementary invoice ${invoiceNumber} for remaining ${remaining} after ${existingInvoice.invoiceNumber} (total delivered now ${calculatedTotal})`,
                    });
                    await AutoJournalService.handleSalesInvoiceCreated(
                        supplementary.id,
                    ).catch((err) => {
                        logger.error(
                            'Auto-Journal failed for supplementary invoice',
                            {
                                error: err,
                                invoiceId: supplementary.id,
                                module: 'FinanceInvoiceService',
                            },
                        );
                    });
                } catch (e) {
                    logger.error('Failed to create supplementary invoice', {
                        error: e,
                        salesOrderId,
                        module: 'FinanceInvoiceService',
                    });
                }
            }
        }
        return existingInvoice;
    }

    const termOfPaymentDays = salesOrder.customer?.paymentTermDays ?? 30;
    const invoiceDate = new Date();
    const dueDate = addDays(invoiceDate, termOfPaymentDays);

    const { invoice, invoiceNumber } = await createInvoiceWithNumberRetry(
        async (num) => {
            const created = await prisma.invoice.create({
                data: {
                    invoiceNumber: num,
                    salesOrderId,
                    invoiceDate,
                    dueDate,
                    termOfPaymentDays,
                    totalAmount: calculatedTotal,
                    paidAmount: 0,
                    status: InvoiceStatus.DRAFT,
                    notes: `System generated draft invoice for Order ${salesOrder.orderNumber} (based on delivered quantities)`,
                },
            });
            return { invoice: created, invoiceNumber: num };
        },
    );

    await logActivity({
        userId,
        action: 'AUTO_GENERATE_INVOICE',
        entityType: 'Invoice',
        entityId: invoice.id,
        details: `Automated draft invoice ${invoiceNumber} generated for shipped Order ${salesOrder.orderNumber} (total from delivered: ${calculatedTotal})`,
    });

    await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(
        (error) => {
            logger.error('Failed to generate auto-journal for invoice', {
                error,
                invoiceId: invoice.id,
                module: 'FinanceInvoiceService',
            });
        },
    );

    return invoice;
}

export async function updateSalesInvoiceDueDate(
    id: string,
    data: { dueDate?: Date; termOfPaymentDays?: number; invoiceDate?: Date },
    userId: string,
) {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Invoice', id);

    if (
        existing.status === InvoiceStatus.PAID ||
        existing.status === InvoiceStatus.CANCELLED
    ) {
        throw new BusinessRuleError(
            'Tidak dapat mengubah tanggal jatuh tempo invoice yang sudah LUNAS atau DIBATALKAN',
        );
    }

    let finalDueDate = data.dueDate;
    if (!finalDueDate) {
        const invDate = data.invoiceDate ?? existing.invoiceDate;
        const term = data.termOfPaymentDays ?? existing.termOfPaymentDays;
        finalDueDate = addDays(invDate, term);
    }

    const updated = await prisma.invoice.update({
        where: { id },
        data: {
            ...(data.invoiceDate && { invoiceDate: data.invoiceDate }),
            dueDate: finalDueDate,
            ...(data.termOfPaymentDays != null && {
                termOfPaymentDays: data.termOfPaymentDays,
            }),
        },
    });

    await logActivity({
        userId,
        action: 'UPDATE_SALES_INVOICE_DUE_DATE',
        entityType: 'Invoice',
        entityId: id,
        details: `Due date changed to ${finalDueDate.toISOString()} term ${updated.termOfPaymentDays} days`,
    });

    return updated;
}
