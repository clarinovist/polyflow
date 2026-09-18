import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { getSalesInvoiceBalance } from '@/lib/finance/sales-return-allocation';
import { AutoJournalService } from './auto-journal-service';
import { lockSalesInvoice, postSalesInvoiceJournal, requireOpenJournalPeriod } from './sales-recognition-service';

const paymentInputSchema = z.object({
    invoiceId: z.string().min(1),
    amount: z.number().positive().max(Number.MAX_SAFE_INTEGER / 100).multipleOf(0.01),
    paymentDate: z.coerce.date(),
    journalDate: z.coerce.date().optional(),
    method: z.string().min(1),
    notes: z.string().optional(),
    referenceNumber: z.string().nullable().optional(),
    destinationBank: z.string().nullable().optional(),
});

export type CustomerPaymentInput = {
    invoiceId: string; amount: number; paymentDate: Date | string;
    method: string; notes?: string; journalDate?: Date | string;
    referenceNumber?: string | null; destinationBank?: string | null;
};

/** Sequence allocation belongs outside this transaction; all financial writes belong inside. */
export async function recordCustomerPaymentInTransaction(
    tx: Prisma.TransactionClient,
    input: CustomerPaymentInput,
    paymentNumber: string,
    userId: string,
) {
    const parsed = paymentInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Nominal pembayaran harus positif dan tanggal pembayaran harus valid.');
    const data = parsed.data;
    if (data.method.trim().toLowerCase() === 'barter') {
        throw new BusinessRuleError(
            'Barter hanya dapat dicatat melalui transaksi settlement barter.',
            undefined,
            'BARTER_PAYMENT_REQUIRES_SETTLEMENT',
        );
    }
    const invoice = await lockSalesInvoice(tx, data.invoiceId);
    if (invoice.status === 'DRAFT' && invoice.salesOrder.entrySource === 'EMERGENCY_DISPATCH') {
        throw new BusinessRuleError('Invoice masih DRAFT. Finance harus approve terlebih dahulu sebelum bisa dibayar.', { invoiceId: invoice.id }, 'INVOICE_DRAFT');
    }
    await requireOpenJournalPeriod(tx, data.paymentDate);
    if (data.journalDate) await requireOpenJournalPeriod(tx, data.journalDate);
    const remaining = getSalesInvoiceBalance(invoice);
    if (remaining.lte(0) || new Prisma.Decimal(data.amount).gt(remaining)) {
        throw new BusinessRuleError('Pembayaran melebihi sisa tagihan atau invoice sudah lunas.', { invoiceId: invoice.id }, 'PAYMENT_EXCEEDS_BALANCE');
    }
    const paidAmount = invoice.paidAmount.plus(data.amount);
    const status = getSalesInvoiceBalance({ ...invoice, paidAmount }).equals(0) ? 'PAID' : 'PARTIAL';
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, status } });
    await postSalesInvoiceJournal(tx, invoice.id, userId);
    const payment = await tx.payment.create({
        data: {
            paymentNumber, invoiceId: invoice.id, amount: data.amount,
            paymentDate: data.paymentDate, method: data.method, notes: data.notes,
            referenceNumber: data.referenceNumber, destinationBank: data.destinationBank,
        },
    });
    await AutoJournalService.handleSalesPayment(payment.id, data.amount, data.method, data.journalDate, tx);
    await logActivity({
        userId, action: 'RECORD_CUSTOMER_PAYMENT', entityType: 'Invoice', entityId: invoice.id,
        details: `Recorded payment ${paymentNumber} of ${data.amount}; sales and receipt journals verified in transaction`,
        fromStatus: invoice.status, toStatus: status, tx,
    });
    return payment;
}
