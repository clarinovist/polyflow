import type { Prisma, PrismaClient } from '@prisma/client';

export const BARTER_HEALTH_LIMIT = 200;
type Db = Prisma.TransactionClient | PrismaClient;
export type BarterSettlementIssue = {
    id: string;
    settlementNumber: string;
    reason: string;
};

/** Bounded page, including child evidence. Caller must surface truncation, not claim all healthy. */
export async function collectBarterHealth(
    db: Db,
    afterId?: string,
    settlementId?: string,
) {
    const rows = await db.barterSettlement.findMany({
        where: {
            status: 'POSTED',
            ...(settlementId
                ? { id: settlementId }
                : afterId
                  ? { id: { gt: afterId } }
                  : {}),
        },
        orderBy: { id: 'asc' },
        take: BARTER_HEALTH_LIMIT + 1,
        include: {
            payments: { take: 4 },
            invoice: { select: { paidAmount: true, totalAmount: true, creditedAmount: true, priceAdjustmentAmount: true } },
            purchaseInvoice: {
                select: { paidAmount: true, totalAmount: true },
            },
        },
    });
    const page = rows.slice(0, BARTER_HEALTH_LIMIT);
    const issues: BarterSettlementIssue[] = [];
    for (const s of page) {
        const report = (reason: string) =>
            issues.push({
                id: s.id,
                settlementNumber: s.settlementNumber,
                reason,
            });
        const hasCash = s.cashAmount.gt(0);
        const legs = s.payments;
        const ar = legs.find((p) => p.barterLeg === 'AR_OFFSET');
        const ap = legs.find((p) => p.barterLeg === 'AP_OFFSET');
        const cash = legs.find((p) => p.barterLeg === 'AP_CASH');
        if (
            legs.length !== (hasCash ? 3 : 2) ||
            !ar ||
            !ap ||
            ar.id !== s.arPaymentId ||
            ap.id !== s.apOffsetPaymentId ||
            ar.invoiceId !== s.invoiceId ||
            ap.purchaseInvoiceId !== s.purchaseInvoiceId ||
            !ar.amount.eq(s.barterAmount) ||
            !ap.amount.eq(s.barterAmount) ||
            ar.method !== 'Barter' ||
            ap.method !== 'Barter'
        )
            report('OFFSET_LEGS_INVALID');
        if (
            hasCash &&
            (!cash ||
                cash.id !== s.apCashPaymentId ||
                cash.purchaseInvoiceId !== s.purchaseInvoiceId ||
                !cash.amount.eq(s.cashAmount) ||
                cash.method !== s.cashMethod ||
                cash.paymentDate.getTime() !== s.cashPaymentDate?.getTime())
        )
            report('CASH_LEG_INVALID');
        // Aggregate all active payments for these two invoices in SQL; never load their full histories.
        const [arSum, apSum, journals, recognition] = await Promise.all([
            db.payment.aggregate({
                where: { invoiceId: s.invoiceId },
                _sum: { amount: true },
            }),
            db.payment.aggregate({
                where: { purchaseInvoiceId: s.purchaseInvoiceId },
                _sum: { amount: true },
            }),
            db.journalEntry.findMany({
                where: {
                    status: { not: 'VOIDED' },
                    OR: [
                        {
                            referenceType: 'BARTER_SETTLEMENT',
                            referenceId: s.id,
                        },
                        ...(hasCash
                            ? [
                                  {
                                      referenceType:
                                          'PURCHASE_PAYMENT' as const,
                                      referenceId: s.apCashPaymentId,
                                  },
                              ]
                            : []),
                    ],
                },
                orderBy: { id: 'asc' },
                take: 4,
                include: {
                    lines: {
                        take: 5,
                        include: {
                            account: {
                                select: { isCashAccount: true, type: true },
                            },
                        },
                    },
                },
            }),
            db.journalEntry.findMany({
                where: {
                    status: 'POSTED',
                    OR: [
                        {
                            referenceType: 'SALES_INVOICE',
                            referenceId: s.invoiceId,
                        },
                        {
                            referenceType: 'PURCHASE_INVOICE',
                            referenceId: s.purchaseInvoiceId,
                        },
                    ],
                },
                take: 3,
                include: {
                    lines: {
                        where: {
                            account: {
                                OR: [{ type: 'ASSET' }, { type: 'LIABILITY' }],
                            },
                        },
                        take: 50,
                    },
                },
            }),
        ]);
        const arAccountIds = recognition
            .filter((j) => j.referenceType === 'SALES_INVOICE')
            .flatMap((j) =>
                j.lines.filter((l) => l.debit.gt(0)).map((l) => l.accountId),
            );
        const apAccountIds = recognition
            .filter((j) => j.referenceType === 'PURCHASE_INVOICE')
            .flatMap((j) =>
                j.lines.filter((l) => l.credit.gt(0)).map((l) => l.accountId),
            );
        if (
            !s.invoice.paidAmount.eq(arSum._sum.amount ?? 0) ||
            !s.purchaseInvoice.paidAmount.eq(apSum._sum.amount ?? 0) ||
            s.invoice.paidAmount.plus(s.invoice.creditedAmount ?? 0).gt(s.invoice.totalAmount.plus(s.invoice.priceAdjustmentAmount ?? 0)) ||
            s.purchaseInvoice.paidAmount.gt(s.purchaseInvoice.totalAmount)
        )
            report('BALANCE_MISMATCH');
        for (const kind of hasCash ? ['offset', 'cash'] : ['offset']) {
            const offset = kind === 'offset';
            const entries = journals.filter(
                (j) =>
                    j.referenceType ===
                    (offset ? 'BARTER_SETTLEMENT' : 'PURCHASE_PAYMENT'),
            );
            if (entries.length !== 1 || entries[0].status !== 'POSTED') {
                report(
                    `${offset ? 'OFFSET' : 'CASH'}_JOURNAL_${entries.length > 1 ? 'DUPLICATE' : 'MISSING'}`,
                );
                continue;
            }
            const j = entries[0];
            const amount = offset ? s.barterAmount : s.cashAmount;
            const debit = j.lines.filter((l) => l.debit.gt(0));
            const credit = j.lines.filter((l) => l.credit.gt(0));
            if (
                j.id !== (offset ? s.offsetJournalId : s.cashJournalId) ||
                j.entryDate.getTime() !==
                    (offset ? s.barterDate : s.cashPaymentDate)?.getTime() ||
                j.lines.length !== 2 ||
                debit.length !== 1 ||
                credit.length !== 1 ||
                !debit[0]?.debit.eq(amount) ||
                !credit[0]?.credit.eq(amount) ||
                debit[0]?.account.type !== 'LIABILITY' ||
                debit[0]?.account.isCashAccount ||
                !apAccountIds.includes(debit[0]?.accountId) ||
                (offset && !arAccountIds.includes(credit[0]?.accountId)) ||
                credit[0]?.account.type !== 'ASSET' ||
                credit[0]?.account.isCashAccount !== !offset ||
                (!offset && credit[0]?.accountId !== s.cashAccountId) ||
                j.lines.some(
                    (l) =>
                        l.debit.lt(0) ||
                        l.credit.lt(0) ||
                        (l.debit.gt(0) && l.credit.gt(0)),
                )
            )
                report(`${offset ? 'OFFSET' : 'CASH'}_JOURNAL_INVALID`);
        }
    }
    return {
        issues,
        scanned: page.length,
        truncated: rows.length > BARTER_HEALTH_LIMIT,
        nextCursor: rows.length > BARTER_HEALTH_LIMIT ? page.at(-1)!.id : null,
    };
}
