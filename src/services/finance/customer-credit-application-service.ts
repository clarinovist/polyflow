import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    applyCustomerCreditInput,
    creditSignature,
    creditDate,
    creditBalance,
    reverseCustomerCreditInput,
} from '@/lib/finance/customer-credit';
import {
    getSalesInvoiceBalance,
    getSalesInvoiceSettlementStatus,
} from '@/lib/finance/sales-return-allocation';
import { resolveAccount } from '@/services/accounting/account-resolver';
import {
    customerCreditDb,
    creditJournal,
    lockCreditInvoice,
    reverseCreditJournal,
    zero,
} from './customer-credit-shared';

export async function applyCustomerCredit(input: unknown, userId: string) {
    const data = applyCustomerCreditInput.parse(input),
        signature = creditSignature(data);
    const amount = new Prisma.Decimal(data.totalAmount);
    if (amount.lte(0))
        throw new BusinessRuleError('Nominal pemakaian harus positif.');
    return customerCreditDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CustomerCreditNote" WHERE id=${data.noteId} FOR UPDATE`;
        const note = await tx.customerCreditNote.findUniqueOrThrow({
            where: { id: data.noteId },
            include: { applications: true },
        });
        const prior = await tx.customerCreditApplication.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
        });
        if (prior) {
            if (
                prior.status !== 'POSTED' ||
                prior.requestSignature !== signature
            )
                throw new BusinessRuleError(
                    'Instruksi berbeda atau pemakaian sudah dibalik.',
                );
            return {
                id: note.id,
                applicationId: prior.id,
                returnId: note.salesReturnId,
            };
        }
        if (note.status !== 'POSTED')
            throw new BusinessRuleError('Saldo kredit sudah dibalik.');
        const invoice = await lockCreditInvoice(tx, data.invoiceId);
        if (
            invoice.id === note.sourceInvoiceId ||
            !invoice.salesOrder.customerId ||
            !['UNPAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status)
        )
            throw new BusinessRuleError(
                'Pilih invoice lain yang masih memiliki piutang.',
            );
        let customerLinkId: string | null = null;
        if (invoice.salesOrder.customerId !== note.customerId) {
            const [from, to] = [
                invoice.salesOrder.customerId,
                note.customerId,
            ].sort();
            const link = await tx.customerCreditLink.findFirst({
                where: {
                    fromCustomerId: from,
                    toCustomerId: to,
                    revokedAt: null,
                },
            });
            if (!link)
                throw new BusinessRuleError(
                    'Customer berbeda. Admin harus memverifikasi dua master sebagai pelanggan yang sama.',
                );
            await tx.$queryRaw`SELECT id FROM "CustomerCreditLink" WHERE id=${link.id} FOR SHARE`;
            if (
                (
                    await tx.customerCreditLink.findUniqueOrThrow({
                        where: { id: link.id },
                    })
                ).revokedAt
            )
                throw new BusinessRuleError(
                    'Verifikasi customer telah dicabut.',
                );
            customerLinkId = link.id;
        }
        const balance = creditBalance(note.totalAmount, note.applications),
            remaining = getSalesInvoiceBalance(invoice);
        if (
            !balance.equals(data.expectedBalance) ||
            !remaining.equals(data.expectedInvoiceBalance)
        )
            throw new BusinessRuleError(
                'Saldo kredit/tagihan berubah. Muat ulang sebelum konfirmasi.',
            );
        if (amount.gt(balance) || amount.gt(remaining))
            throw new BusinessRuleError(
                'Nominal melebihi saldo kredit atau sisa tagihan.',
            );
        creditDate(data.postingDate, note.postingDate);
        creditDate(data.postingDate, invoice.invoiceDate);
        for (const a of note.applications)
            creditDate(data.postingDate, a.reversedAt ?? a.postingDate);
        const ar = await resolveAccount('accounts-receivable');
        await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=${invoice.id} ORDER BY id FOR UPDATE`;
        const sources = await tx.journalEntry.findMany({
            where: {
                referenceType: 'SALES_INVOICE',
                referenceId: invoice.id,
                status: { not: 'VOIDED' },
            },
            include: { lines: true },
        });
        if (
            sources.length !== 1 ||
            sources[0].status !== 'POSTED' ||
            !sources[0].isAutoGenerated ||
            sources[0].lines.some(
                (l) =>
                    l.currency !== 'IDR' ||
                    !l.exchangeRate.equals(1) ||
                    l.debit.lt(0) ||
                    l.credit.lt(0),
            ) ||
            !sources[0].lines
                .reduce((sum, l) => sum.plus(l.debit).minus(l.credit), zero())
                .isZero() ||
            !sources[0].lines
                .filter((l) => l.accountId === ar.id)
                .reduce((sum, l) => sum.plus(l.debit).minus(l.credit), zero())
                .equals(invoice.totalAmount)
        )
            throw new BusinessRuleError(
                'Jurnal invoice tujuan belum valid. Rekonsiliasi sebelum pemakaian kredit.',
            );
        const payments = await tx.payment.aggregate({
            where: { invoiceId: invoice.id },
            _sum: { amount: true },
        });
        if (!invoice.paidAmount.equals(payments._sum.amount ?? 0))
            throw new BusinessRuleError(
                'Pembayaran invoice tujuan tidak sesuai ledger.',
            );
        const id = randomUUID();
        const journal = await creditJournal(tx, {
            id,
            date: data.postingDate,
            reference: `CUSTOMER_CREDIT_APPLY:${id}`,
            description: `Pemakaian kredit ke ${invoice.invoiceNumber}`,
            userId,
            lines: [
                {
                    accountId: note.liabilityAccountId,
                    debit: amount,
                    credit: zero(),
                },
                { accountId: ar.id, debit: zero(), credit: amount },
            ],
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_return_credit_ledger, customer_credit_application_ledger DEFERRED`;
        await tx.customerCreditApplication.create({
            data: {
                id,
                noteId: note.id,
                invoiceId: invoice.id,
                sourceJournalId: sources[0].id,
                customerLinkId,
                totalAmount: amount,
                postingDate: data.postingDate,
                reason: data.reason,
                idempotencyKey: data.idempotencyKey,
                requestSignature: signature,
                journalId: journal.id,
                createdById: userId,
            },
        });
        const creditedAmount = invoice.creditedAmount.plus(amount);
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
            action: 'APPLY_CUSTOMER_CREDIT',
            entityType: 'Invoice',
            entityId: invoice.id,
            details: data.reason,
            changes: {
                noteId: note.id,
                applicationId: id,
                amount: amount.toFixed(2),
                customerLinkId,
                journalId: journal.id,
            },
            tx,
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_return_credit_ledger, customer_credit_application_ledger IMMEDIATE`;
        return { id: note.id, applicationId: id, returnId: note.salesReturnId };
    });
}

export async function reverseCustomerCreditApplication(
    input: unknown,
    userId: string,
) {
    const data = reverseCustomerCreditInput.parse(input);
    const db = customerCreditDb();
    return db.$transaction(async (tx) => {
        const found = await tx.customerCreditApplication.findUniqueOrThrow({
            where: { id: data.id },
        });
        await tx.$queryRaw`SELECT id FROM "CustomerCreditNote" WHERE id=${found.noteId} FOR UPDATE`;
        const app = await tx.customerCreditApplication.findUniqueOrThrow({
            where: { id: data.id },
            include: { note: true },
        });
        if (app.status === 'REVERSED') {
            if (
                app.reversalReason !== data.reason ||
                app.reversedAt?.getTime() !== data.reversalDate.getTime()
            )
                throw new BusinessRuleError('Instruksi pembalikan berbeda.');
            return { id: app.noteId, returnId: app.note.salesReturnId };
        }
        creditDate(data.reversalDate, app.postingDate);
        const history = await tx.customerCreditApplication.findMany({
            where: { noteId: app.noteId },
            select: { postingDate: true, reversedAt: true },
        });
        for (const event of history)
            creditDate(
                data.reversalDate,
                event.reversedAt ?? event.postingDate,
            );
        const invoice = await lockCreditInvoice(tx, app.invoiceId);
        const journal = await reverseCreditJournal(tx, {
            journalId: app.journalId,
            id: app.id,
            date: data.reversalDate,
            reason: data.reason,
            userId,
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_return_credit_ledger, customer_credit_application_ledger DEFERRED`;
        await tx.customerCreditApplication.update({
            where: { id: app.id },
            data: {
                status: 'REVERSED',
                reversedAt: data.reversalDate,
                reversedById: userId,
                reversalReason: data.reason,
                reversalJournalId: journal.id,
            },
        });
        const creditedAmount = invoice.creditedAmount.minus(app.totalAmount);
        if (creditedAmount.lt(0))
            throw new BusinessRuleError('Saldo invoice tidak sesuai ledger.');
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
            action: 'REVERSE_CUSTOMER_CREDIT_APPLICATION',
            entityType: 'Invoice',
            entityId: invoice.id,
            details: data.reason,
            changes: { applicationId: app.id, journalId: journal.id },
            tx,
        });
        await tx.$executeRaw`SET CONSTRAINTS invoice_return_credit_ledger, customer_credit_application_ledger IMMEDIATE`;
        return { id: app.noteId, returnId: app.note.salesReturnId };
    });
}

export async function reverseCustomerCreditNote(
    input: unknown,
    userId: string,
) {
    const data = reverseCustomerCreditInput.parse(input);
    return customerCreditDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CustomerCreditNote" WHERE id=${data.id} FOR UPDATE`;
        const note = await tx.customerCreditNote.findUniqueOrThrow({
            where: { id: data.id },
            include: { applications: true },
        });
        if (note.status === 'REVERSED') {
            if (
                note.reversalReason !== data.reason ||
                note.reversedAt?.getTime() !== data.reversalDate.getTime()
            )
                throw new BusinessRuleError('Instruksi pembalikan berbeda.');
            return { id: note.id, returnId: note.salesReturnId };
        }
        if (note.applications.some((a) => a.status === 'POSTED'))
            throw new BusinessRuleError(
                'Balikkan seluruh pemakaian kredit dahulu.',
            );
        creditDate(data.reversalDate, note.postingDate);
        for (const a of note.applications)
            creditDate(data.reversalDate, a.reversedAt ?? a.postingDate);
        const journal = await reverseCreditJournal(tx, {
            journalId: note.journalId,
            id: note.id,
            date: data.reversalDate,
            reason: data.reason,
            userId,
        });
        await tx.customerCreditNote.update({
            where: { id: note.id },
            data: {
                status: 'REVERSED',
                reversedAt: data.reversalDate,
                reversedById: userId,
                reversalReason: data.reason,
                reversalJournalId: journal.id,
            },
        });
        await logActivity({
            userId,
            action: 'REVERSE_CUSTOMER_CREDIT_NOTE',
            entityType: 'SalesReturn',
            entityId: note.salesReturnId,
            details: data.reason,
            changes: { noteId: note.id, journalId: journal.id },
            tx,
        });
        return { id: note.id, returnId: note.salesReturnId };
    });
}
