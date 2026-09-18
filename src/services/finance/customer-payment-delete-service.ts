import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { getSalesInvoiceSettlementStatus } from '@/lib/finance/sales-return-allocation';
import { logActivity } from '@/lib/tools/audit';
import {
    lockSalesInvoice,
    requireOpenJournalPeriod,
} from './sales-recognition-service';

/** Customer payment deletion shares Invoice locking with credits, payments and barter. */
export async function deleteCustomerPaymentInTransaction(
    tx: Prisma.TransactionClient,
    paymentId: string,
    userId: string,
) {
    const pointer = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { invoiceId: true },
    });
    if (!pointer?.invoiceId) throw new NotFoundError('Payment');
    const invoice = await lockSalesInvoice(tx, pointer.invoiceId);
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== invoice.id)
        throw new NotFoundError('Payment');
    if (payment.barterSettlementId)
        throw new BusinessRuleError(
            'Gunakan Batalkan Barter untuk pembayaran settlement.',
            undefined,
            'BARTER_PAYMENT_DELETE_FORBIDDEN',
        );
    const journals = await tx.journalEntry.findMany({
        where: { referenceId: paymentId, referenceType: 'SALES_PAYMENT' },
        include: {
            lines: {
                include: {
                    bankReconciliationItems: { select: { id: true }, take: 1 },
                },
            },
        },
    });
    await requireOpenJournalPeriod(tx, payment.paymentDate);
    if (journals.length !== 1 || journals[0].status !== 'POSTED') throw new BusinessRuleError('Jurnal pembayaran hilang/ambigu. Rekonsiliasi sebelum menghapus.');
    for (const journal of journals) {
        await requireOpenJournalPeriod(tx, journal.entryDate);
        if (
            journal.lines.some(
                (line) =>
                    line.reconciledAt || line.bankReconciliationItems.length,
            )
        ) {
            throw new BusinessRuleError(
                'Pembayaran sudah direkonsiliasi. Lepaskan rekonsiliasi terlebih dahulu.',
            );
        }
    }
    const paidAmount = invoice.paidAmount.minus(payment.amount);
    if (paidAmount.lt(0))
        throw new BusinessRuleError(
            'Saldo pembayaran tidak sesuai. Rekonsiliasi sebelum menghapus.',
        );
    const status = getSalesInvoiceSettlementStatus({ ...invoice, paidAmount });
    await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount, status },
    });
    await tx.journalLine.deleteMany({
        where: {
            journalEntry: {
                referenceId: paymentId,
                referenceType: 'SALES_PAYMENT',
            },
        },
    });
    await tx.journalEntry.deleteMany({
        where: { referenceId: paymentId, referenceType: 'SALES_PAYMENT' },
    });
    await tx.salesRemittanceItem.updateMany({
        where: { paymentId },
        data: { paymentId: null },
    });
    await tx.purchaseRemittanceItem.updateMany({
        where: { paymentId },
        data: { paymentId: null },
    });
    await tx.payment.delete({ where: { id: paymentId } });
    await logActivity({
        userId,
        action: 'DELETE_PAYMENT',
        entityType: 'Payment',
        entityId: paymentId,
        details: `Deleted customer payment ${payment.paymentNumber}; return credits preserved`,
        tx,
    });
}
