import { addDays } from 'date-fns';
import { InvoiceStatus, SalesOrderStatus, Prisma } from '@prisma/client';

import { prisma, getTenantDbFromContext } from '@/lib/core/prisma';

function invoiceWriter() {
    const db = getTenantDbFromContext();
    if (!db) throw new BusinessRuleError('Konteks tenant wajib untuk penerbitan/perubahan invoice.');
    return db;
}
import { NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import {
    CreateInvoiceValues,
    UpdateInvoiceStatusValues,
} from '@/lib/schemas/invoice';
import { logActivity } from '@/lib/tools/audit';

import { AutoJournalService } from './auto-journal-service';
import { captureInvoiceReturnBasis, refreshDraftInvoiceReturnBasis } from './invoice-return-basis-capture';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import {
    calculateInvoiceRounding,
    invoiceAmountsForPolicy,
} from '@/lib/finance/invoice-rounding';

/**
 * Calculate sales invoice total from actual delivered/shipped quantities (not SO ordered qty).
 * Sum of (deliveredQty × unitPrice × discount × PPN) per SO item + shipping from DO.
 * Fallback to so.totalAmount when no shipments exist yet.
 */
export async function calculateSalesInvoiceTotalFromDelivered(
    salesOrderId: string,
    db: Prisma.TransactionClient = prisma,
): Promise<number> {
    const so = await db.salesOrder.findUnique({
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

/** Invoice, rounded receivable, journal and audit must commit together. */
async function persistNewInvoice(
    tx: Prisma.TransactionClient,
    data: Prisma.InvoiceUncheckedCreateInput,
    userId: string,
    action: string,
    details: string,
) {
    const invoice = await tx.invoice.create({ data });
    await AutoJournalService.handleSalesInvoiceCreated(invoice.id, { tx });
    await captureInvoiceReturnBasis(tx, invoice.id);
    await logActivity({
        userId,
        action,
        entityType: 'Invoice',
        entityId: invoice.id,
        details,
        tx,
    });
    return invoice;
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

    return createInvoiceWithNumberRetry((num) =>
        invoiceWriter().$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${salesOrderId} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "salesOrderId" = ${salesOrderId} ORDER BY id FOR UPDATE`;
            const existing = await tx.invoice.findMany({ where: { salesOrderId, status: { not: 'CANCELLED' } }, include: { _count: { select: { priceAdjustments: { where: { status: 'POSTED' } } } } } });
            if (existing.some(invoice => Number(invoice.priceAdjustmentAmount ?? 0) !== 0 || (invoice._count?.priceAdjustments ?? 0) > 0)) throw new BusinessRuleError('SO memiliki penyesuaian harga invoice aktif. Periksa Finance sebelum menerbitkan invoice tambahan agar selisih tidak ditagihkan dua kali.');
            if (existing.some(invoice => invoice.status === 'DRAFT')) throw new BusinessRuleError('Selesaikan invoice draft yang ada sebelum menerbitkan invoice baru.');
            const cumulativeTotal = await calculateSalesInvoiceTotalFromDelivered(salesOrderId, tx);
            const committed = existing.reduce((sum, invoice) => sum.plus(invoice.totalAmount).minus(invoice.roundingAmount ?? 0), new Prisma.Decimal(0));
            const calculatedTotal = new Prisma.Decimal(cumulativeTotal).minus(committed).toNumber();
            if (calculatedTotal <= 0) throw new BusinessRuleError('Nilai pengiriman sudah ditagihkan; tidak membuat invoice duplikat.');
            const amounts = calculateInvoiceRounding(calculatedTotal);
            return persistNewInvoice(
                tx,
                {
                    invoiceNumber: num,
                    salesOrderId,
                    invoiceDate,
                    dueDate: finalDueDate,
                    termOfPaymentDays: termOfPaymentDays || 0,
                    ...amounts,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    notes,
                },
                userId,
                'CREATE_INVOICE',
                `Invoice ${num} created for Order ${salesOrder.orderNumber} (base: ${calculatedTotal}, rounding: ${amounts.roundingAmount}, total: ${amounts.totalAmount})`,
            );
        }),
    );
}

export async function updateInvoiceStatus(
    data: UpdateInvoiceStatusValues,
    userId: string,
    tx?: Prisma.TransactionClient,
): Promise<void> {
    if (!tx)
        return invoiceWriter().$transaction((db) =>
            updateInvoiceStatus(data, userId, db),
        );
    const {
        lockSalesInvoice,
        postSalesInvoiceJournal,
        requireOpenJournalPeriod,
        RECOGNIZED_INVOICE_STATUSES,
    } = await import('./sales-recognition-service');
    const { id, status, paidAmount } = data;
    const invoice = await lockSalesInvoice(tx, id);
    if (Number(invoice.creditedAmount ?? 0) > 0 || Number(invoice.priceAdjustmentAmount ?? 0) !== 0) {
        const { getSalesInvoiceSettlementStatus } = await import('@/lib/finance/sales-return-allocation');
        if (status === 'CANCELLED' || status === 'DRAFT' || paidAmount !== undefined || status !== getSalesInvoiceSettlementStatus(invoice)) {
            throw new BusinessRuleError('Invoice dengan kredit retur harus dikoreksi melalui transaksi sumber, bukan override status/pembayaran.');
        }
    }
    if (
        invoice.status === 'DRAFT' &&
        invoice.salesOrder.entrySource === 'EMERGENCY_DISPATCH' &&
        (RECOGNIZED_INVOICE_STATUSES as readonly string[]).includes(status)
    ) {
        throw new BusinessRuleError(
            'Invoice masih DRAFT. Finance harus approve terlebih dahulu sebelum bisa dibayar.',
            {
                invoiceId: id,
                currentStatus: invoice.status,
                targetStatus: status,
            },
            'INVOICE_DRAFT',
        );
    }
    if (status === 'DRAFT' && invoice.status !== 'DRAFT') {
        throw new BusinessRuleError(
            'Invoice yang sudah dikonfirmasi tidak dapat dikembalikan ke DRAFT.',
            { invoiceId: id },
            'INVALID_STATUS_TRANSITION',
        );
    }
    await tx.invoice.update({
        where: { id },
        data: { status, ...(paidAmount !== undefined && { paidAmount }) },
    });
    if ((RECOGNIZED_INVOICE_STATUSES as readonly string[]).includes(status)) {
        await postSalesInvoiceJournal(tx, id, userId);
    } else if (status === 'CANCELLED') {
        const journals = await tx.journalEntry.findMany({
            where: {
                referenceId: id,
                referenceType: 'SALES_INVOICE',
                status: { not: 'VOIDED' },
            },
            select: { entryDate: true },
        });
        for (const journal of journals)
            await requireOpenJournalPeriod(tx, journal.entryDate);
        await tx.journalEntry.updateMany({
            where: {
                referenceId: id,
                referenceType: 'SALES_INVOICE',
                status: { not: 'VOIDED' },
            },
            data: { status: 'VOIDED' },
        });
    }
    await logActivity({
        userId,
        action: 'UPDATE_INVOICE',
        entityType: 'Invoice',
        entityId: id,
        details: `Invoice ${invoice.invoiceNumber} status updated to ${status}`,
        fromStatus: invoice.status,
        toStatus: status,
        tx,
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

    return createInvoiceWithNumberRetry((num) =>
        invoiceWriter().$transaction(async (tx) => {
            // Serialize draft/supplementary generation and lock invoices against payment/approval.
            await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${salesOrderId} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "salesOrderId" = ${salesOrderId} ORDER BY id FOR UPDATE`;
            const calculatedTotal =
                await calculateSalesInvoiceTotalFromDelivered(salesOrderId, tx);
            const invoices = await tx.invoice.findMany({
                where: { salesOrderId, status: { not: 'CANCELLED' } },
                orderBy: { createdAt: 'asc' },
                include: { _count: { select: { priceAdjustments: { where: { status: 'POSTED' } } } } },
            });
            if (invoices.some(invoice => Number(invoice.priceAdjustmentAmount ?? 0) !== 0 || (invoice._count?.priceAdjustments ?? 0) > 0)) throw new BusinessRuleError('SO memiliki penyesuaian harga invoice aktif. Periksa Finance sebelum menerbitkan invoice tambahan agar selisih tidak ditagihkan dua kali.');
            const draft = invoices.find(
                (invoice) => invoice.status === 'DRAFT',
            );
            const committedBase = invoices
                .filter((invoice) => invoice.id !== draft?.id)
                .reduce(
                    (sum, invoice) =>
                        sum
                            .plus(invoice.totalAmount.toNumber())
                            .minus(invoice.roundingAmount ?? 0),
                    new Prisma.Decimal(0),
                );
            const remaining = Prisma.Decimal.max(
                0,
                new Prisma.Decimal(calculatedTotal).minus(committedBase),
            ).toNumber();

            if (draft) {
                const amounts = invoiceAmountsForPolicy(
                    remaining,
                    draft.roundingAmount,
                );
                const changed =
                    !new Prisma.Decimal(draft.totalAmount.toNumber()).eq(
                        amounts.totalAmount,
                    ) ||
                    ('roundingAmount' in amounts &&
                        Number(draft.roundingAmount) !==
                            amounts.roundingAmount);
                if (!changed) {
                    // Composition may change while total stays equal; refresh issuance evidence too.
                    if (draft.roundingAmount != null) await refreshDraftInvoiceReturnBasis(tx, draft.id);
                    return draft;
                }
                const updated = await tx.invoice.update({
                    where: { id: draft.id },
                    data: amounts,
                });
                if (draft.roundingAmount != null) {
                    await AutoJournalService.handleSalesInvoiceCreated(
                        draft.id,
                        { tx, refreshDraft: true },
                    );
                    await refreshDraftInvoiceReturnBasis(tx, draft.id);
                }
                await logActivity({
                    userId,
                    action: 'SYNC_INVOICE_FROM_DELIVERED',
                    entityType: 'Invoice',
                    entityId: draft.id,
                    details: `Invoice ${draft.invoiceNumber} total updated from ${draft.totalAmount} to ${amounts.totalAmount} (base: ${remaining})`,
                    tx,
                });
                return updated;
            }
            if (invoices.length > 0 && remaining <= 0) return invoices[0];

            const amounts = calculateInvoiceRounding(remaining);
            const termOfPaymentDays =
                salesOrder.customer?.paymentTermDays ?? 30;
            const invoiceDate = new Date();
            const supplementary = invoices.length > 0;
            return persistNewInvoice(
                tx,
                {
                    invoiceNumber: num,
                    salesOrderId,
                    invoiceDate,
                    dueDate: addDays(invoiceDate, termOfPaymentDays),
                    termOfPaymentDays,
                    ...amounts,
                    paidAmount: 0,
                    status: InvoiceStatus.DRAFT,
                    notes: supplementary
                        ? `Suplementer: tambahan kirim — SO ${salesOrder.orderNumber}`
                        : `System generated draft invoice for Order ${salesOrder.orderNumber} (based on delivered quantities)`,
                },
                userId,
                supplementary
                    ? 'CREATE_SUPPLEMENTARY_INVOICE'
                    : 'AUTO_GENERATE_INVOICE',
                `Invoice ${num} for Order ${salesOrder.orderNumber} (base: ${remaining}, rounding: ${amounts.roundingAmount}, total: ${amounts.totalAmount})`,
            );
        }),
    );
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
