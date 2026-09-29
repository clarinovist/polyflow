import { Prisma } from '@prisma/client';
import { canonicalDocument, escapeDocumentLike, normalizeDocumentSearch, normalizedDocumentPredicate } from '@/lib/bot/document-search';
import { calculatePoInvoiceTotalFromReceipts } from '@/services/purchasing/invoices-service';
import { prepareReturnCreditProposal } from './return-credit-proposal-service';
import { isPeriodOpen } from '@/services/accounting/periods-service';
import { toBusinessDateString } from '@/lib/utils/timezone';

const LIMIT = 6;
const patterns = (raw: string) => normalizeDocumentSearch(raw).map(escapeDocumentLike);

/** Query-only: caller owns a tenant-bound READ ONLY transaction. Never approve a bill. */
export async function inspectPurchaseInvoice(tx: Prisma.TransactionClient, searchTerm: string, diagnose: boolean) {
    const candidates = patterns(searchTerm);
    const exactWhere: Prisma.PurchaseInvoiceWhereInput = { OR: [
        { id: searchTerm.trim() },
        ...candidates.map(equals => ({ invoiceNumber: { equals, mode: 'insensitive' as const } })),
    ] };
    let exact = await tx.purchaseInvoice.findMany({ where: exactWhere, select: { id: true }, take: LIMIT });
    if (!exact.length && canonicalDocument(searchTerm)) {
        exact = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "PurchaseInvoice" WHERE ${normalizedDocumentPredicate(Prisma.sql`"invoiceNumber"`, searchTerm)} ORDER BY id LIMIT ${LIMIT}`);
    }
    const invoices = await tx.purchaseInvoice.findMany({
        where: exact.length ? { id: { in: exact.map(i => i.id) } } : { OR:
            candidates.map(contains => ({ invoiceNumber: { contains, mode: 'insensitive' as const } })),
        },
        select: {
            id: true, invoiceNumber: true, status: true, invoiceDate: true, dueDate: true,
            totalAmount: true, paidAmount: true,
            purchaseOrder: { select: {
                id: true, orderNumber: true, status: true, entrySource: true, commercialReviewStatus: true,
                _count: { select: { goodsReceipts: true, invoices: true } },
            } },
        }, orderBy: { invoiceNumber: 'asc' }, take: LIMIT,
    });
    // Ambiguity is not permission to diagnose the newest/first candidate.
    if (!diagnose || invoices.length !== 1) return { invoices };
    const invoice = invoices[0];
    const poId = invoice.purchaseOrder.id;
    const [receipts, receivedValue, billed, journals, payments, legacyPayments, period] = await Promise.all([
        tx.goodsReceipt.findMany({ where: { purchaseOrderId: poId }, select: { id: true, receiptNumber: true, receivedDate: true }, orderBy: { receivedDate: 'desc' }, take: 10 }),
        calculatePoInvoiceTotalFromReceipts(poId, { tx, fallbackToPoTotal: false }),
        tx.purchaseInvoice.aggregate({ where: { purchaseOrderId: poId, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true }, _count: { _all: true } }),
        tx.journalEntry.findMany({ where: { referenceType: 'PURCHASE_INVOICE', referenceId: invoice.id, status: { not: 'VOIDED' } }, select: { id: true, entryNumber: true, status: true, entryDate: true }, orderBy: { entryDate: 'desc' }, take: 10 }),
        tx.purchasePayment.aggregate({ where: { purchaseInvoiceId: invoice.id }, _sum: { amount: true }, _count: { _all: true } }),
        tx.payment.aggregate({ where: { purchaseInvoiceId: invoice.id }, _sum: { amount: true }, _count: { _all: true } }),
        isPeriodOpen(invoice.invoiceDate, tx),
    ]);
    return { invoices, diagnosis: {
        receipts, receivedValue, billedValue: billed._sum.totalAmount ?? new Prisma.Decimal(0), billedCount: billed._count._all,
        journals, payments, legacyPayments, invoicePeriodOpen: period,
        invoicePeriod: toBusinessDateString(invoice.invoiceDate).slice(0, 7),
        // This is an explanation of the current lifecycle, not a duplicated approval validator.
        draftExplanation: invoice.status !== 'DRAFT' ? null : invoice.purchaseOrder.entrySource === 'WALK_IN_RECEIPT'
            ? 'Invoice dari nota/walk-in masih menunggu approval Finance. Gunakan alur approval invoice walk-in di aplikasi; assistant tidak melakukan approval.'
            : 'Invoice masih DRAFT, tetapi bukan walk-in. Jangan memakai approval walk-in untuk memaksa status; minta Finance memeriksa asal invoice dan jurnal terkait.',
    } };
}

/** Read-only dependencies and the existing proposal selector, never a posting/dry-run mutation. */
export async function inspectSalesReturnCredit(tx: Prisma.TransactionClient, searchTerm: string, postingDate: Date) {
    const candidates = patterns(searchTerm);
    const exactWhere: Prisma.SalesReturnWhereInput = { OR: [
        { id: searchTerm.trim() },
        ...candidates.map(equals => ({ returnNumber: { equals, mode: 'insensitive' as const } })),
    ] };
    let exact = await tx.salesReturn.findMany({ where: exactWhere, select: { id: true }, take: LIMIT });
    if (!exact.length && canonicalDocument(searchTerm)) {
        exact = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "SalesReturn" WHERE ${normalizedDocumentPredicate(Prisma.sql`"returnNumber"`, searchTerm)} ORDER BY id LIMIT ${LIMIT}`);
    }
    const returns = await tx.salesReturn.findMany({
        where: exact.length ? { id: { in: exact.map(r => r.id) } } : { OR:
            candidates.map(contains => ({ returnNumber: { contains, mode: 'insensitive' as const } })),
        },
        select: {
            id: true, returnNumber: true, status: true, returnDate: true,
            salesOrder: { select: { orderNumber: true } },
            credit: { select: { status: true, mode: true } },
            customerCredit: { select: { id: true, status: true } },
            _count: { select: { items: true } },
        }, orderBy: { returnNumber: 'asc' }, take: LIMIT,
    });
    if (returns.length !== 1) return { returns };
    const returned = returns[0];
    const [periodOpen, receivedItems, proposal] = await Promise.all([
        isPeriodOpen(postingDate, tx),
        tx.salesReturnItem.count({ where: { salesReturnId: returned.id, receipt: { isNot: null } } }),
        // The Finance UI uses this selector too. A customer credit blocks reposting.
        returned.customerCredit
            ? Promise.resolve({ ready: false as const, reason: 'Retur sudah memiliki saldo kredit customer. Periksa penyelesaian yang ada; jangan posting ulang.' })
            : prepareReturnCreditProposal(tx, returned.id),
    ]);
    return { returns, diagnosis: {
        proposal, periodOpen, postingDay: toBusinessDateString(postingDate), receivedItems,
        itemCount: returned._count.items,
        scope: 'Usulan existing Finance bukan otorisasi posting. Tanggal, bukti penerimaan, snapshot, sisa alokasi, akun, dan perubahan bersamaan tetap divalidasi saat konfirmasi di aplikasi. Tidak ada perubahan stok, invoice, pembayaran, atau jurnal.',
    } };
}
