import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    calculatePriceAdjustment,
    priceAdjustmentInput,
} from '@/lib/finance/invoice-price-adjustment';
import {
    getSalesInvoiceBalance,
    getSalesInvoiceSettlementStatus,
} from '@/lib/finance/sales-return-allocation';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { generateEntryNumber } from '@/services/accounting/journal-posting';
import { requireOpenJournalPeriod } from './sales-recognition-service';
import { getPriceAdjustmentSource } from './invoice-price-source';
import { z } from 'zod';
function tenantDb() {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks tenant wajib untuk penyesuaian harga.',
        );
    return db;
}
async function lockInvoiceSource(
    tx: Prisma.TransactionClient,
    invoiceId: string,
) {
    const found = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { salesOrderId: true },
    });
    if (!found) throw new NotFoundError('Invoice');
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id=${found.salesOrderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "salesOrderId"=${found.salesOrderId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SalesOrderItem" WHERE "salesOrderId"=${found.salesOrderId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=${invoiceId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "DeliveryOrder" WHERE "salesOrderId"=${found.salesOrderId} ORDER BY id FOR SHARE`;
}
export async function postInvoicePriceAdjustment(
    input: unknown,
    userId: string,
) {
    const data = priceAdjustmentInput.parse(input);
    const signature = createHash('sha256')
        .update(
            JSON.stringify({
                ...data,
                postingDate: toBusinessDateString(data.postingDate),
            }),
        )
        .digest('hex');
    return tenantDb().$transaction(async (tx) => {
        await lockInvoiceSource(tx, data.invoiceId);
        const prior = await tx.invoicePriceAdjustment.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
        });
        if (prior) {
            if (prior.status === 'REVERSED')
                throw new BusinessRuleError('Penyesuaian sudah dibalik. Muat ulang sumber sebelum membuat persetujuan baru.');
            if (prior.requestSignature !== signature)
                throw new BusinessRuleError(
                    'Instruksi penyesuaian berbeda dari transaksi sebelumnya.',
                );
            return prior;
        }
        const source = await getPriceAdjustmentSource(tx, data.invoiceId);
        if (
            source.fingerprint !== data.sourceFingerprint ||
            !getSalesInvoiceBalance(source.invoice).equals(
                data.expectedRemaining,
            )
        )
            throw new BusinessRuleError(
                'Sumber atau saldo berubah. Muat ulang dan periksa kembali.',
            );
        const item = source.items.find(
            (i) => i.sourceItemId === data.sourceItemId,
        );
        if (
            !item ||
            new Prisma.Decimal(data.quantity).gt(item.availableQuantity) ||
            item.activeAdjustment
        )
            throw new BusinessRuleError(
                'Kuantitas melebihi sisa barang atau item sudah memiliki penyesuaian aktif.',
            );
        const amounts = calculatePriceAdjustment({
            sourceQuantity: item.quantity,
            sourceNet: item.netAmount,
            sourceTax: item.taxAmount,
            quantity: data.quantity,
            newNetUnitPrice: data.newNetUnitPrice,
        });
        const delta = new Prisma.Decimal(amounts.totalAmount),
            adjusted = source.invoice.priceAdjustmentAmount.plus(delta);
        if (
            getSalesInvoiceBalance({
                ...source.invoice,
                priceAdjustmentAmount: adjusted,
            }).lt(0)
        )
            throw new BusinessRuleError(
                'Penurunan harga melebihi sisa piutang. Pemeriksaan Finance diperlukan; tidak ada refund otomatis.',
            );
        const activeCredits = await tx.salesReturnCreditAllocation.aggregate({
            where: { invoiceId: data.invoiceId, credit: { status: 'POSTED' } },
            _sum: { netAmount: true, taxAmount: true },
        });
        const priorAdjustments = await tx.invoicePriceAdjustment.aggregate({
            where: { invoiceId: data.invoiceId, status: 'POSTED' },
            _sum: { netAmount: true, taxAmount: true },
        });
        if (
            (activeCredits._sum.taxAmount ?? new Prisma.Decimal(0)).gt(
                source.journalTax
                    .plus(priorAdjustments._sum.taxAmount ?? 0)
                    .plus(amounts.taxAmount),
            ) ||
            (activeCredits._sum.netAmount ?? new Prisma.Decimal(0)).gt(
                source.invoice.totalAmount
                    .minus(source.journalTax)
                    .plus(priorAdjustments._sum.netAmount ?? 0)
                    .plus(amounts.netAmount),
            )
        )
            throw new BusinessRuleError(
                'Penyesuaian melampaui sisa komponen netto/pajak setelah kredit retur.',
            );
        const latestAdjustment = await tx.invoicePriceAdjustment.findFirst({ where: { invoiceId: data.invoiceId }, orderBy: { createdAt: 'desc' }, select: { postingDate: true, reversedAt: true } });
        const day = toBusinessDateString(data.postingDate);
        if (latestAdjustment && day < toBusinessDateString(latestAdjustment.reversedAt ?? latestAdjustment.postingDate))
            throw new BusinessRuleError('Tanggal penyesuaian tidak boleh mendahului riwayat penyesuaian sebelumnya.');
        if (
            day < toBusinessDateString(source.invoice.invoiceDate) ||
            day > toBusinessDateString(new Date())
        )
            throw new BusinessRuleError(
                'Tanggal penyesuaian harus sesudah invoice dan tidak di masa depan.',
            );
        await requireOpenJournalPeriod(tx, data.postingDate);
        const adjustmentId = randomUUID();
        const net = new Prisma.Decimal(amounts.netAmount),
            tax = new Prisma.Decimal(amounts.taxAmount);
        const journal = await tx.journalEntry.create({
            data: {
                entryNumber: await generateEntryNumber(data.postingDate, tx),
                entryDate: data.postingDate,
                description: `Penyesuaian harga ${source.invoice.invoiceNumber}`,
                reference: `INVOICE_PRICE:${adjustmentId}`,
                referenceType: 'MANUAL_ENTRY',
                referenceId: adjustmentId,
                status: 'POSTED',
                isAutoGenerated: true,
                createdById: userId,
                approvedById: userId,
                approvedAt: new Date(),
                lines: {
                    create: [
                        {
                            accountId: source.accounts.ar,
                            debit: Prisma.Decimal.max(delta, 0),
                            credit: Prisma.Decimal.max(delta.negated(), 0),
                        },
                        {
                            accountId: source.accounts.revenue,
                            debit: Prisma.Decimal.max(net.negated(), 0),
                            credit: Prisma.Decimal.max(net, 0),
                        },
                        ...(tax.isZero()
                            ? []
                            : [
                                  {
                                      accountId: source.accounts.vat,
                                      debit: Prisma.Decimal.max(
                                          tax.negated(),
                                          0,
                                      ),
                                      credit: Prisma.Decimal.max(tax, 0),
                                  },
                              ]),
                    ],
                },
            },
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_price_ledger,price_adjustment_ledger DEFERRED`;
        const result = await tx.invoicePriceAdjustment.create({
            data: {
                id: adjustmentId,
                invoiceId: data.invoiceId,
                sourceItemId: item.sourceItemId,
                sourceJournalId: source.sourceJournalId,
                quantity: data.quantity,
                newNetUnitPrice: data.newNetUnitPrice,
                ...amounts,
                postingDate: data.postingDate,
                reason: data.reason,
                sourceEvidence: {
                    version: 1,
                    label: source.sourceLabel,
                    fingerprint: source.fingerprint,
                    item,
                    originalLines: source.originalLines,
                    remainingBefore: data.expectedRemaining,
                },
                idempotencyKey: data.idempotencyKey,
                requestSignature: signature,
                journalId: journal.id,
                createdById: userId,
            },
        });
        await tx.invoice.update({
            where: { id: data.invoiceId },
            data: {
                priceAdjustmentAmount: adjusted,
                status: getSalesInvoiceSettlementStatus({
                    ...source.invoice,
                    priceAdjustmentAmount: adjusted,
                }),
            },
        });
        await logActivity({
            userId,
            action: 'POST_INVOICE_PRICE_ADJUSTMENT',
            entityType: 'Invoice',
            entityId: data.invoiceId,
            details: data.reason,
            changes: { adjustmentId, journalId: journal.id, ...amounts },
            tx,
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_price_ledger,price_adjustment_ledger IMMEDIATE`;
        return result;
    });
}
const reversalInput = z.object({
    adjustmentId: z.string().min(1).max(100),
    reversalDate: z.coerce.date(),
    reason: z.string().trim().min(5).max(1000),
});
export async function reverseInvoicePriceAdjustment(
    input: unknown,
    userId: string,
) {
    const data = reversalInput.parse(input);
    return tenantDb().$transaction(async (tx) => {
        const found = await tx.invoicePriceAdjustment.findUnique({
            where: { id: data.adjustmentId },
        });
        if (!found) throw new NotFoundError('Penyesuaian');
        await lockInvoiceSource(tx, found.invoiceId);
        const row = await tx.invoicePriceAdjustment.findUniqueOrThrow({
            where: { id: data.adjustmentId },
        });
        if (row.status === 'REVERSED') {
            if (
                row.reversalReason !== data.reason ||
                toBusinessDateString(row.reversedAt!) !==
                    toBusinessDateString(data.reversalDate)
            )
                throw new BusinessRuleError(
                    'Penyesuaian sudah dibalik dengan instruksi berbeda.',
                );
            return row;
        }
        const day = toBusinessDateString(data.reversalDate);
        if (
            day < toBusinessDateString(row.postingDate) ||
            day > toBusinessDateString(new Date())
        )
            throw new BusinessRuleError('Tanggal pembalikan tidak valid.');
        const invoice = await tx.invoice.findUniqueOrThrow({
                where: { id: row.invoiceId },
            }),
            adjusted = invoice.priceAdjustmentAmount.minus(row.totalAmount);
        const credits = await tx.salesReturnCreditAllocation.aggregate({
            where: { invoiceId: row.invoiceId, credit: { status: 'POSTED' } },
            _sum: { netAmount: true, taxAmount: true },
        });
        const other = await tx.invoicePriceAdjustment.aggregate({
            where: {
                invoiceId: row.invoiceId,
                status: 'POSTED',
                id: { not: row.id },
            },
            _sum: { netAmount: true, taxAmount: true },
        });
        const sourceEvidence = row.sourceEvidence as Prisma.JsonObject;
        const originalLines = sourceEvidence.originalLines;
        if (!Array.isArray(originalLines))
            throw new BusinessRuleError('Bukti nilai asli belum lengkap.');
        const originalTax = originalLines.reduce<Prisma.Decimal>(
            (sum, line) =>
                sum.plus(String((line as Prisma.JsonObject).taxAmount)),
            new Prisma.Decimal(0),
        );
        if (
            (credits._sum.taxAmount ?? new Prisma.Decimal(0)).gt(
                originalTax.plus(other._sum.taxAmount ?? 0),
            ) ||
            (credits._sum.netAmount ?? new Prisma.Decimal(0)).gt(
                invoice.totalAmount
                    .minus(originalTax)
                    .plus(other._sum.netAmount ?? 0),
            )
        )
            throw new BusinessRuleError(
                'Komponen harga/pajak telah dipakai kredit retur. Rekonsiliasi sebelum pembalikan.',
            );
        if (
            getSalesInvoiceBalance({
                ...invoice,
                priceAdjustmentAmount: adjusted,
            }).lt(0)
        )
            throw new BusinessRuleError(
                'Penyesuaian telah dipakai pembayaran/kredit. Rekonsiliasi sebelum pembalikan.',
            );
        await requireOpenJournalPeriod(tx, data.reversalDate);
        const journal = await tx.journalEntry.findUniqueOrThrow({
            where: { id: row.journalId },
            include: { lines: true },
        });
        if (
            journal.status !== 'POSTED' ||
            !journal.isAutoGenerated ||
            journal.reference !== `INVOICE_PRICE:${row.id}`
        )
            throw new BusinessRuleError('Jurnal penyesuaian tidak valid.');
        const accountIds = [...new Set(journal.lines.map((l) => l.accountId))];
        if (
            (await tx.account.count({
                where: { id: { in: accountIds }, isActive: true },
            })) !== accountIds.length
        )
            throw new BusinessRuleError('Akun pembalikan tidak aktif.');
        const reverse = await tx.journalEntry.create({
            data: {
                entryNumber: await generateEntryNumber(data.reversalDate, tx),
                entryDate: data.reversalDate,
                description: `Pembalikan harga: ${data.reason}`,
                reference: `INVOICE_PRICE_REVERSAL:${row.id}`,
                referenceType: 'MANUAL_ENTRY',
                referenceId: row.id,
                status: 'POSTED',
                isAutoGenerated: true,
                createdById: userId,
                approvedById: userId,
                approvedAt: new Date(),
                lines: {
                    create: journal.lines.map((l) => ({
                        accountId: l.accountId,
                        debit: l.credit,
                        credit: l.debit,
                        currency: l.currency,
                        exchangeRate: l.exchangeRate,
                    })),
                },
            },
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_price_ledger,price_adjustment_ledger DEFERRED`;
        const result = await tx.invoicePriceAdjustment.update({
            where: { id: row.id },
            data: {
                status: 'REVERSED',
                reversedAt: data.reversalDate,
                reversedById: userId,
                reversalReason: data.reason,
                reversalJournalId: reverse.id,
            },
        });
        await tx.invoice.update({
            where: { id: row.invoiceId },
            data: {
                priceAdjustmentAmount: adjusted,
                status: getSalesInvoiceSettlementStatus({
                    ...invoice,
                    priceAdjustmentAmount: adjusted,
                }),
            },
        });
        await logActivity({
            userId,
            action: 'REVERSE_INVOICE_PRICE_ADJUSTMENT',
            entityType: 'Invoice',
            entityId: row.invoiceId,
            details: data.reason,
            changes: { adjustmentId: row.id, journalId: reverse.id },
            tx,
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_price_ledger,price_adjustment_ledger IMMEDIATE`;
        return result;
    });
}
