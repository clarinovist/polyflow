import { Prisma, type JournalLine } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { isPeriodOpen } from '@/services/accounting/periods-service';

export const RECOGNIZED_INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'] as const;

export async function lockSalesInvoice(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { salesOrder: { select: { entrySource: true } } },
    });
    if (!invoice) throw new NotFoundError('Invoice', id);
    if (invoice.status === 'CANCELLED') {
        throw new BusinessRuleError('Invoice dibatalkan tidak dapat diakui atau dibayar.', { invoiceId: id }, 'INVOICE_CANCELLED');
    }
    return invoice;
}

export async function requireOpenJournalPeriod(tx: Prisma.TransactionClient, date: Date) {
    const [year, month] = toBusinessDateString(date).split('-').map(Number);
    await tx.$queryRaw`SELECT id FROM "FiscalPeriod" WHERE year = ${year} AND month = ${month} FOR SHARE`;
    if (!(await isPeriodOpen(date, tx))) {
        throw new BusinessRuleError('Periode jurnal sudah ditutup atau belum tersedia. Periksa periode buku sebelum melanjutkan.', { entryDate: date }, 'FISCAL_PERIOD_CLOSED');
    }
}

function validateAmounts(
    lines: Pick<JournalLine, 'accountId' | 'debit' | 'credit'>[],
    total: Prisma.Decimal,
    arAccountId: string,
) {
    const invalidLine = lines.some(line => !line.debit.isFinite() || !line.credit.isFinite() || line.debit.isNegative() || line.credit.isNegative());
    const debit = lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
    const credit = lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
    const ar = lines.filter(line => line.accountId === arAccountId)
        .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), new Prisma.Decimal(0));
    if (invalidLine || !total.isFinite() || total.lte(0) || debit.minus(credit).abs().gt('0.01') || ar.minus(total).abs().gt('0.01')) {
        throw new BusinessRuleError('Nominal jurnal penjualan tidak cocok dengan invoice. Rekonsiliasi jurnal terlebih dahulu; pembayaran belum disimpan.', undefined, 'SALES_JOURNAL_AMOUNT_MISMATCH');
    }
}

/** Caller owns the transaction: recognition must commit or roll back with its source. */
export async function postSalesInvoiceJournal(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    userId = 'system',
): Promise<{ action: 'exists' | 'promoted'; journalId: string }> {
    const invoice = await lockSalesInvoice(tx, invoiceId);
    await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceType" = 'SALES_INVOICE' AND "referenceId" = ${invoiceId} AND status <> 'VOIDED' FOR UPDATE`;
    const journals = await tx.journalEntry.findMany({
        where: { referenceType: 'SALES_INVOICE', referenceId: invoiceId, status: { not: 'VOIDED' } },
        include: { lines: true },
    });
    if (journals.length !== 1) {
        throw new BusinessRuleError(
            journals.length ? 'Ditemukan lebih dari satu jurnal penjualan aktif. Rekonsiliasi dahulu.' : 'Jurnal penjualan belum tersedia. Periksa pembentukan jurnal invoice terlebih dahulu; transaksi belum disimpan.',
            { invoiceId }, journals.length ? 'SALES_JOURNAL_DUPLICATE' : 'SALES_JOURNAL_MISSING',
        );
    }
    const journal = journals[0];
    if (invoice.status === 'DRAFT') return { action: 'exists', journalId: journal.id };
    const ar = await resolveAccount('accounts-receivable');
    validateAmounts(journal.lines, invoice.totalAmount, ar.id);
    if (journal.status === 'POSTED') return { action: 'exists', journalId: journal.id };
    await requireOpenJournalPeriod(tx, journal.entryDate);
    const result = await tx.journalEntry.updateMany({
        where: { id: journal.id, status: 'DRAFT' },
        data: { status: 'POSTED', approvedById: userId, approvedAt: new Date() },
    });
    if (result.count !== 1) throw new BusinessRuleError('Status jurnal berubah. Muat ulang dan coba lagi.', { invoiceId }, 'SALES_JOURNAL_CHANGED');
    await logActivity({
        userId, action: 'POST_SALES_INVOICE_JOURNAL', entityType: 'JournalEntry', entityId: journal.id,
        details: `Pengakuan penjualan invoice ${invoice.invoiceNumber}`,
        fromStatus: 'DRAFT', toStatus: 'POSTED', tx,
    });
    return { action: 'promoted', journalId: journal.id };
}
