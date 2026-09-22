import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    issueCustomerCreditInput,
    creditSignature,
    creditDate,
} from '@/lib/finance/customer-credit';
import { resolveAccount } from '@/services/accounting/account-resolver';
import {
    creditJournal,
    customerCreditDb,
    lockCreditInvoice,
    zero,
} from './customer-credit-shared';

/** Explicit Finance approval for a fully cash-settled source. No legacy evidence reconstruction. */
export async function issueCustomerCredit(input: unknown, userId: string) {
    const data = issueCustomerCreditInput.parse(input);
    const signature = creditSignature(data);
    const total = new Prisma.Decimal(data.totalAmount),
        tax = new Prisma.Decimal(data.taxAmount),
        net = total.minus(tax);
    if (total.lte(0) || net.lt(0))
        throw new BusinessRuleError('Nominal kredit/pajak tidak valid.');
    return customerCreditDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id=${data.returnId} FOR UPDATE`;
        const ret = await tx.salesReturn.findUniqueOrThrow({
            where: { id: data.returnId },
            include: {
                credit: true,
                customerCredit: true,
                items: { include: { receipt: true } },
            },
        });
        if (ret.customerCredit) {
            if (
                ret.customerCredit.status !== 'POSTED' ||
                ret.customerCredit.requestSignature !== signature
            )
                throw new BusinessRuleError(
                    'Retur sudah memiliki saldo kredit dengan instruksi berbeda atau telah dibalik.',
                );
            return { id: ret.customerCredit.id, returnId: ret.id };
        }
        if (
            !['RECEIVED', 'COMPLETED'].includes(ret.status) ||
            !ret.customerId ||
            !ret.items.length ||
            ret.items.some(
                (i) => !i.receipt || !i.receipt.quantity.equals(i.returnedQty),
            )
        )
            throw new BusinessRuleError(
                'Penerimaan retur lengkap wajib sebelum menerbitkan saldo kredit.',
            );
        if (ret.credit && ret.credit.status !== 'REVIEW_REQUIRED')
            throw new BusinessRuleError(
                'Retur sudah diproses sebagai kredit invoice. Tidak boleh digunakan dua kali.',
            );
        if (
            await tx.journalEntry.count({
                where: { referenceType: 'SALES_RETURN', referenceId: ret.id },
            })
        )
            throw new BusinessRuleError(
                'Riwayat jurnal retur ditemukan; rekonsiliasi dahulu.',
            );
        const invoice = await lockCreditInvoice(tx, data.invoiceId);
        if (
            invoice.salesOrderId !== ret.salesOrderId ||
            invoice.salesOrder.customerId !== ret.customerId
        )
            throw new BusinessRuleError(
                'Invoice sumber harus berasal dari SO dan customer retur.',
            );
        const payments = await tx.payment.aggregate({
            where: { invoiceId: invoice.id },
            _sum: { amount: true },
        });
        if (
            invoice.status !== 'PAID' ||
            !invoice.remainingAmount.isZero() ||
            !invoice.paidAmount.equals(invoice.totalAmount) ||
            !invoice.paidAmount.equals(payments._sum.amount ?? 0) ||
            !invoice.creditedAmount.isZero() ||
            !invoice.priceAdjustmentAmount.isZero()
        )
            throw new BusinessRuleError(
                'Saldo kredit ini khusus invoice yang dibayar penuh, tanpa kredit/penyesuaian lain. Cocokkan pembayaran sebelum melanjutkan.',
            );
        creditDate(data.postingDate, invoice.invoiceDate);
        creditDate(data.postingDate, ret.returnDate);
        for (const item of ret.items)
            creditDate(data.postingDate, item.receipt!.receivedAt);
        const [ar, vat, returns, liability] = await Promise.all([
            resolveAccount('accounts-receivable'),
            resolveAccount('vat-output'),
            resolveAccount('sales-return'),
            resolveAccount('customer-credit'),
        ]);
        const liabilityAccount = await tx.account.findUniqueOrThrow({
            where: { id: liability.id },
        });
        if (
            liabilityAccount.type !== 'LIABILITY' ||
            new Set([ar.id, vat.id, returns.id, liability.id]).size !== 4
        )
            throw new BusinessRuleError(
                'Petakan akun kewajiban Saldo Kredit Pelanggan yang terpisah dari piutang/kas.',
            );
        await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceType"='SALES_INVOICE' AND "referenceId"=${invoice.id} ORDER BY id FOR UPDATE`;
        const journals = await tx.journalEntry.findMany({
            where: {
                referenceType: 'SALES_INVOICE',
                referenceId: invoice.id,
                status: { not: 'VOIDED' },
            },
            include: { lines: true },
        });
        const source = journals[0];
        if (
            journals.length !== 1 ||
            source.status !== 'POSTED' ||
            !source.isAutoGenerated ||
            source.lines.some(
                (l) =>
                    l.currency !== 'IDR' ||
                    !l.exchangeRate.equals(1) ||
                    l.debit.lt(0) ||
                    l.credit.lt(0),
            ) ||
            !source.lines
                .reduce((s, l) => s.plus(l.debit).minus(l.credit), zero())
                .isZero() ||
            !source.lines
                .filter((l) => l.accountId === ar.id)
                .reduce((s, l) => s.plus(l.debit).minus(l.credit), zero())
                .equals(invoice.totalAmount)
        )
            throw new BusinessRuleError(
                'Jurnal invoice sumber belum valid; rekonsiliasi dahulu.',
            );
        const sourceTax = source.lines
            .filter((l) => l.accountId === vat.id)
            .reduce((s, l) => s.plus(l.credit).minus(l.debit), zero());
        const history = await tx.customerCreditNote.findMany({
            where: { sourceInvoiceId: invoice.id },
            select: { postingDate: true, reversedAt: true },
        });
        for (const previous of history)
            creditDate(
                data.postingDate,
                previous.reversedAt ?? previous.postingDate,
            );
        const used = await tx.customerCreditNote.aggregate({
            where: { sourceInvoiceId: invoice.id, status: 'POSTED' },
            _sum: { netAmount: true, taxAmount: true },
        });
        if (
            sourceTax.lt(0) ||
            sourceTax.gt(invoice.totalAmount) ||
            tax.plus(used._sum.taxAmount ?? 0).gt(sourceTax) ||
            net
                .plus(used._sum.netAmount ?? 0)
                .gt(invoice.totalAmount.minus(sourceTax))
        )
            throw new BusinessRuleError(
                'Kredit melebihi nilai netto/pajak invoice sumber.',
            );
        const id = randomUUID();
        const journal = await creditJournal(tx, {
            id,
            date: data.postingDate,
            reference: `CUSTOMER_CREDIT:${ret.id}`,
            description: `Saldo kredit retur ${ret.returnNumber}`,
            userId,
            lines: [
                { accountId: liability.id, debit: zero(), credit: total },
                ...(net.gt(0)
                    ? [{ accountId: returns.id, debit: net, credit: zero() }]
                    : []),
                ...(tax.gt(0)
                    ? [{ accountId: vat.id, debit: tax, credit: zero() }]
                    : []),
            ],
        });
        await tx.customerCreditNote.create({
            data: {
                id,
                salesReturnId: ret.id,
                sourceInvoiceId: invoice.id,
                customerId: ret.customerId,
                sourceJournalId: source.id,
                liabilityAccountId: liability.id,
                netAmount: net,
                taxAmount: tax,
                totalAmount: total,
                postingDate: data.postingDate,
                reason: data.reason,
                evidence: data.evidence,
                requestSignature: signature,
                journalId: journal.id,
                createdById: userId,
            },
        });
        await logActivity({
            userId,
            action: 'ISSUE_CUSTOMER_CREDIT',
            entityType: 'SalesReturn',
            entityId: ret.id,
            details: data.reason,
            changes: {
                noteId: id,
                totalAmount: total.toFixed(2),
                invoiceId: invoice.id,
                journalId: journal.id,
            },
            tx,
        });
        return { id, returnId: ret.id };
    });
}
