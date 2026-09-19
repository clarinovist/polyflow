import { Prisma } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { manualReturnCreditSchema } from '@/lib/finance/manual-return-credit';
import {
    getSalesInvoiceBalance,
    getSalesInvoiceSettlementStatus,
} from '@/lib/finance/sales-return-allocation';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { generateEntryNumber } from '@/services/accounting/journal-posting';
import {
    lockSalesInvoice,
    requireOpenJournalPeriod,
} from './sales-recognition-service';

const zero = () => new Prisma.Decimal(0);
const ledgerConstraints = Prisma.raw(
    'invoice_return_credit_ledger, return_credit_ledger, return_allocation_ledger, manual_credit_shape, manual_allocation_shape',
);

/** Approval is enforced by the Finance action; always use the tenant-bound client here. */
export async function postManualReturnCredit(input: unknown, userId: string) {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks tenant wajib untuk kredit retur manual.',
        );
    return db.$transaction((tx) =>
        postManualReturnCreditInTransaction(tx, input, userId),
    );
}

/** Explicit monetary approval, not reconstructed historical evidence. No stock or Payment writes. */
export async function postManualReturnCreditInTransaction(
    tx: Prisma.TransactionClient,
    input: unknown,
    userId: string,
) {
    const data = manualReturnCreditSchema.parse(input);
    const totalAmount = new Prisma.Decimal(data.totalAmount);
    const taxAmount = new Prisma.Decimal(data.taxAmount);
    const netAmount = totalAmount.minus(taxAmount);
    const expectedRemaining = new Prisma.Decimal(data.expectedRemaining);
    const day = toBusinessDateString(data.postingDate);
    await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${data.returnId} FOR UPDATE`;
    const returned = await tx.salesReturn.findUnique({
        where: { id: data.returnId },
        include: {
            salesOrder: { select: { customerId: true } },
            items: { include: { receipt: true } },
            credit: { include: { allocations: true } },
        },
    });
    if (!returned) throw new NotFoundError('Retur');
    if (
        !['RECEIVED', 'COMPLETED'].includes(returned.status) ||
        !returned.items.length
    )
        throw new BusinessRuleError(
            'Barang retur harus diterima sebelum persetujuan kredit manual.',
        );
    const prior = returned.credit;
    if (prior?.status === 'REVERSED')
        throw new BusinessRuleError(
            'Kredit sudah dibalik; riwayat tidak dapat diposting ulang.',
        );
    if (prior?.status === 'POSTED') {
        if (
            prior.mode !== 'MANUAL' ||
            prior.allocations.length !== 1 ||
            prior.allocations[0].invoiceId !== data.invoiceId ||
            !prior.totalAmount.equals(totalAmount) ||
            !prior.taxAmount.equals(taxAmount) ||
            !prior.manualRemainingBefore?.equals(expectedRemaining) ||
            prior.approvalReason !== data.reason ||
            prior.evidenceReference !== data.evidence ||
            toBusinessDateString(prior.postedAt!) !== day
        )
            throw new BusinessRuleError(
                'Retur sudah dikreditkan dengan instruksi berbeda. Muat ulang; jangan posting kedua kali.',
            );
        return prior;
    }
    // Even voided legacy history requires reconciliation. Manual approval never adopts or replays it.
    if (
        await tx.journalEntry.findFirst({
            where: { referenceType: 'SALES_RETURN', referenceId: returned.id },
        })
    )
        throw new BusinessRuleError(
            'Jurnal retur lama ditemukan. Perlu rekonsiliasi sebelum kredit manual; jangan posting ulang.',
        );
    // Match issuance's SO -> invoice order, keeping customer attribution stable.
    await tx.$queryRaw`SELECT id FROM "SalesOrder" WHERE id=${returned.salesOrderId} FOR SHARE`;
    const invoice = await lockSalesInvoice(tx, data.invoiceId);
    const sourceOrder = await tx.salesOrder.findUnique({
        where: { id: returned.salesOrderId },
        select: { customerId: true },
    });
    if (
        invoice.salesOrderId !== returned.salesOrderId ||
        !returned.customerId ||
        returned.customerId !== sourceOrder?.customerId
    )
        throw new BusinessRuleError(
            'Invoice dan retur harus berasal dari SO dan customer yang sama.',
        );
    if (!['UNPAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status))
        throw new BusinessRuleError(
            'Pilih invoice yang sudah diakui dan masih memiliki piutang.',
        );
    if (
        day > toBusinessDateString(new Date()) ||
        day < toBusinessDateString(returned.returnDate) ||
        day < toBusinessDateString(invoice.invoiceDate) ||
        returned.items.some(
            (item) =>
                item.receipt &&
                day < toBusinessDateString(item.receipt.receivedAt),
        )
    )
        throw new BusinessRuleError(
            'Tanggal posting harus sesudah dokumen/penerimaan dan tidak di masa depan.',
        );
    const remaining = getSalesInvoiceBalance(invoice);
    if (!remaining.equals(expectedRemaining))
        throw new BusinessRuleError(
            'Saldo invoice berubah. Muat ulang dan periksa kembali nominal sebelum menyetujui.',
        );
    if (remaining.lte(0) || totalAmount.gt(remaining))
        throw new BusinessRuleError(
            'Kredit melebihi sisa piutang. Tidak ada refund otomatis.',
        );
    const [ar, vat, returnAccount] = await Promise.all([
        resolveAccount('accounts-receivable'),
        resolveAccount('vat-output'),
        resolveAccount('sales-return'),
    ]);
    if (
        (await tx.account.count({
            where: {
                id: { in: [ar.id, vat.id, returnAccount.id] },
                isActive: true,
            },
        })) !== 3
    )
        throw new BusinessRuleError(
            'Akun jurnal retur belum valid atau tidak aktif.',
        );
    await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=${invoice.id} ORDER BY id FOR UPDATE`;
    const sources = await tx.journalEntry.findMany({
        where: {
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            status: { not: 'VOIDED' },
        },
        include: { lines: true },
    });
    if (sources.length !== 1)
        throw new BusinessRuleError(
            'Jurnal invoice asal hilang atau ganda. Rekonsiliasi terlebih dahulu.',
        );
    const source = sources[0];
    const debit = source.lines.reduce(
        (sum, line) => sum.plus(line.debit),
        zero(),
    );
    const credit = source.lines.reduce(
        (sum, line) => sum.plus(line.credit),
        zero(),
    );
    const sourceAr = source.lines
        .filter((line) => line.accountId === ar.id)
        .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), zero());
    const sourceTax = source.lines
        .filter((line) => line.accountId === vat.id)
        .reduce((sum, line) => sum.plus(line.credit).minus(line.debit), zero());
    if (
        source.status !== 'POSTED' ||
        !source.isAutoGenerated ||
        !debit.equals(credit) ||
        !sourceAr.equals(invoice.totalAmount) ||
        sourceTax.lt(0) ||
        sourceTax.gt(invoice.totalAmount) ||
        source.lines.some(
            (line) =>
                line.currency !== 'IDR' ||
                !line.exchangeRate.equals(1) ||
                line.debit.lt(0) ||
                line.credit.lt(0),
        )
    )
        throw new BusinessRuleError(
            'Jurnal pengakuan invoice tidak sesuai. Rekonsiliasi sebelum persetujuan manual.',
        );
    const active = await tx.salesReturnCreditAllocation.aggregate({
        where: { invoiceId: invoice.id, credit: { status: 'POSTED' } },
        _sum: { taxAmount: true, netAmount: true },
    });
    const priceChanges = await tx.invoicePriceAdjustment.aggregate({ where: { invoiceId: invoice.id, status: 'POSTED' }, _sum: { netAmount: true, taxAmount: true } });
    if (
        taxAmount.plus(active._sum.taxAmount ?? 0).gt(sourceTax.plus(priceChanges._sum.taxAmount ?? 0)) ||
        netAmount
            .plus(active._sum.netAmount ?? 0)
            .gt(invoice.totalAmount.minus(sourceTax).plus(priceChanges._sum.netAmount ?? 0))
    )
        throw new BusinessRuleError(
            'Komponen netto/pajak melebihi sisa nilai invoice asal. Periksa rincian Finance.',
        );
    await requireOpenJournalPeriod(tx, data.postingDate);
    const journal = await tx.journalEntry.create({
        data: {
            entryNumber: await generateEntryNumber(data.postingDate, tx),
            entryDate: data.postingDate,
            description: `Kredit retur manual ${returned.returnNumber}`,
            reference: returned.returnNumber,
            referenceType: 'SALES_RETURN',
            referenceId: returned.id,
            status: 'POSTED',
            isAutoGenerated: true,
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date(),
            lines: {
                create: [
                    { accountId: ar.id, debit: zero(), credit: totalAmount },
                    ...(netAmount.gt(0)
                        ? [
                              {
                                  accountId: returnAccount.id,
                                  debit: netAmount,
                                  credit: zero(),
                              },
                          ]
                        : []),
                    ...(taxAmount.gt(0)
                        ? [
                              {
                                  accountId: vat.id,
                                  debit: taxAmount,
                                  credit: zero(),
                              },
                          ]
                        : []),
                ],
            },
        },
    });
    await tx.$executeRaw`SET CONSTRAINTS ${ledgerConstraints} DEFERRED`;
    const values = {
        status: 'POSTED' as const,
        mode: 'MANUAL' as const,
        reviewReason: null,
        approvalReason: data.reason,
        evidenceReference: data.evidence,
        approvedById: userId,
        approvedAt: new Date(),
        manualRemainingBefore: remaining,
        postedAt: data.postingDate,
        netAmount,
        taxAmount,
        totalAmount,
        journalId: journal.id,
        allocations: {
            create: {
                invoiceId: invoice.id,
                manualSourceJournalId: source.id,
                netAmount,
                taxAmount,
                totalAmount,
                discountAmount: zero(),
            },
        },
    };
    const result = await tx.salesReturnCredit.upsert({
        where: { salesReturnId: returned.id },
        create: { salesReturnId: returned.id, createdById: userId, ...values },
        update: values,
    });
    const creditedAmount = invoice.creditedAmount.plus(totalAmount);
    await tx.invoice.update({
        where: { id: invoice.id },
        data: {
            creditedAmount,
            status: getSalesInvoiceSettlementStatus({
                ...invoice,
                creditedAmount,
            }),
        },
    });
    await logActivity({
        userId,
        action: 'POST_MANUAL_SALES_RETURN_CREDIT',
        entityType: 'SalesReturn',
        entityId: returned.id,
        details: data.reason,
        changes: {
            creditId: result.id,
            invoiceId: invoice.id,
            sourceJournalId: source.id,
            journalId: journal.id,
            totalAmount: totalAmount.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            evidenceReference: data.evidence,
        },
        tx,
    });
    // Force deferred checks inside the callback, not a COMMIT error Prisma may obscure.
    await tx.$executeRaw`SET CONSTRAINTS ${ledgerConstraints} IMMEDIATE`;
    return result;
}
