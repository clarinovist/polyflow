import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { resolveByPatterns } from '@/services/accounting/account-resolver';

const SAMPLE_LIMIT = 20;
const invoiceSelect = {
    id: true,
    invoiceNumber: true,
    status: true,
    totalAmount: true,
    paidAmount: true,
    creditedAmount: true,
    invoiceDate: true,
    dueDate: true,
    salesOrder: { select: { customer: { select: { name: true } } } },
} satisfies Prisma.InvoiceSelect;
type Invoice = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;
type Journal = Prisma.JournalEntryGetPayload<{ include: { lines: true } }>;
type Payment = Prisma.PaymentGetPayload<object>;

export async function findInvoices(
    tx: Prisma.TransactionClient,
    searchTerm: string,
) {
    // Prisma's insensitive equals uses ILIKE too: escape literal wildcards in BOTH paths.
    const contains = searchTerm.replace(/[\\%_]/g, '\\$&');
    const exactWhere: Prisma.InvoiceWhereInput = {
        OR: [
            { id: searchTerm },
            { invoiceNumber: { equals: contains, mode: 'insensitive' } },
        ],
    };
    const exact = await tx.invoice.findMany({
        where: exactWhere,
        select: invoiceSelect,
        orderBy: { id: 'asc' },
        take: 6,
    });
    if (exact.length)
        return selection(
            exact,
            exact.length < 6
                ? exact.length
                : await tx.invoice.count({ where: exactWhere }),
        );
    const where: Prisma.InvoiceWhereInput = {
        OR: [
            { invoiceNumber: { contains, mode: 'insensitive' } },
            {
                salesOrder: {
                    customer: { name: { contains, mode: 'insensitive' } },
                },
            },
        ],
    };
    const total = await tx.invoice.count({ where });
    const invoices = await tx.invoice.findMany({
        where,
        select: invoiceSelect,
        orderBy: [{ invoiceNumber: 'asc' }, { id: 'asc' }],
        take: 5,
    });
    return selection(invoices, total);
}

function selection(invoices: Invoice[], total: number) {
    return {
        kind:
            total === 0
                ? ('missing' as const)
                : total === 1
                  ? ('selected' as const)
                  : ('ambiguous' as const),
        invoices,
        total,
        truncated: total > invoices.length,
    };
}

function periodKey(date: Date) {
    return toBusinessDateString(date).slice(0, 7);
}
function sum(lines: Journal['lines'], field: 'debit' | 'credit') {
    return lines.reduce(
        (total, line) => total.plus(line[field]),
        new Prisma.Decimal(0),
    );
}
function differs(a: Prisma.Decimal, b: Prisma.Decimal) {
    return a.minus(b).abs().gt('0.01');
}

function paymentIssues(invoice: Invoice, total: Prisma.Decimal) {
    const recognized = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'].includes(
        invoice.status,
    );
    const paid = invoice.paidAmount;
    const settled = paid.plus(invoice.creditedAmount ?? 0);
    const statusMismatch =
        recognized &&
        ((invoice.status === 'PAID' && differs(settled, invoice.totalAmount)) ||
            (invoice.status !== 'PAID' && settled.gte(invoice.totalAmount)) ||
            (invoice.status === 'PARTIAL' && settled.lte(0)) ||
            (invoice.status === 'UNPAID' && settled.gt(0)));
    return [
        ...(!total.eq(paid) ? ['PAYMENT_TOTAL_MISMATCH'] : []),
        ...(statusMismatch ? ['INVOICE_STATUS_MISMATCH'] : []),
        ...(total.plus(invoice.creditedAmount ?? 0).gt(invoice.totalAmount) || settled.gt(invoice.totalAmount)
            ? ['OVERPAYMENT']
            : []),
        ...(total.lt(0) || paid.lt(0) ? ['NEGATIVE_PAYMENT'] : []),
        ...(!recognized && total.gt(0)
            ? ['PAYMENT_ON_UNRECOGNIZED_INVOICE']
            : []),
    ];
}

function journalIssues(
    journal: Journal,
    invoice: Invoice,
    payments: Payment[],
    arId?: string,
) {
    const isSale = journal.referenceType === 'SALES_INVOICE';
    const isBarter = journal.referenceType === 'BARTER_SETTLEMENT';
    const source = isSale
        ? invoice
        : isBarter
          ? payments.find((p) => p.barterSettlementId === journal.referenceId)
          : payments.find((p) => p.id === journal.referenceId);
    if (!source) return [`JOURNAL_SOURCE_UNKNOWN:${journal.id}`];
    const expectedAmount = isSale
        ? invoice.totalAmount
        : (source as Payment).amount;
    const expectedDate = isSale
        ? invoice.invoiceDate
        : (source as Payment).paymentDate;
    const arLines = journal.lines.filter((l) => l.accountId === arId);
    const ar = isSale
        ? sum(arLines, 'debit').minus(sum(arLines, 'credit'))
        : sum(arLines, 'credit').minus(sum(arLines, 'debit'));
    const shouldPost =
        !isSale || !['DRAFT', 'CANCELLED'].includes(invoice.status);
    return [
        ...(shouldPost && journal.status !== 'POSTED'
            ? [`JOURNAL_NOT_POSTED:${journal.id}`]
            : []),
        ...(isSale &&
        ['DRAFT', 'CANCELLED'].includes(invoice.status) &&
        journal.status === 'POSTED'
            ? [`UNRECOGNIZED_INVOICE_POSTED:${journal.id}`]
            : []),
        ...(differs(
            sum(journal.lines, 'debit'),
            sum(journal.lines, 'credit'),
        ) || !journal.lines.length
            ? [`JOURNAL_UNBALANCED:${journal.id}`]
            : []),
        ...(journal.lines.some((l) => l.debit.lt(0) || l.credit.lt(0))
            ? [`JOURNAL_NEGATIVE_LINE:${journal.id}`]
            : []),
        ...(arId && differs(ar, expectedAmount)
            ? [`JOURNAL_AR_MISMATCH:${journal.id}`]
            : []),
        ...(toBusinessDateString(journal.entryDate) !==
        toBusinessDateString(expectedDate)
            ? [`JOURNAL_DATE_MISMATCH:${journal.id}`]
            : []),
    ];
}

async function loadPeriods(tx: Prisma.TransactionClient, dates: Date[]) {
    const keys = [...new Set(dates.map(periodKey))].sort();
    const periods = await tx.fiscalPeriod.findMany({
        where: {
            OR: keys.map((key) => {
                const [year, month] = key.split('-').map(Number);
                return { year, month };
            }),
        },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    return keys.map((key) => ({
        key,
        status:
            periods.find(
                (p) => `${p.year}-${String(p.month).padStart(2, '0')}` === key,
            )?.status ?? 'MISSING',
    }));
}

async function arCandidate(tx: Prisma.TransactionClient) {
    // Never use resolveAccount here: its main-DB mapping/cache bypasses this read-only snapshot.
    try {
        return await resolveByPatterns('accounts-receivable', tx);
    } catch (error) {
        if (error instanceof NotFoundError) return undefined;
        throw error;
    }
}

async function inspectInvoice(tx: Prisma.TransactionClient, invoice: Invoice) {
    const aggregate = await tx.payment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
        _count: { _all: true },
    });
    const payments = await tx.payment.findMany({
        where: { invoiceId: invoice.id },
        orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
        take: SAMPLE_LIMIT,
    });
    const barterSettlementIds = payments
        .filter((payment) => payment.barterSettlementId)
        .map((payment) => payment.barterSettlementId as string);
    const where: Prisma.JournalEntryWhereInput = {
        status: { not: 'VOIDED' },
        OR: [
            { referenceType: 'SALES_INVOICE', referenceId: invoice.id },
            {
                referenceType: 'SALES_PAYMENT',
                referenceId: {
                    in: payments
                        .filter((payment) => !payment.barterSettlementId)
                        .map((p) => p.id),
                },
            },
            {
                referenceType: 'BARTER_SETTLEMENT',
                referenceId: { in: barterSettlementIds },
            },
        ],
    };
    const journalCount = await tx.journalEntry.count({ where });
    const journals = await tx.journalEntry.findMany({
        where,
        include: { lines: true },
        orderBy: [
            { referenceType: 'asc' },
            { entryDate: 'asc' },
            { id: 'asc' },
        ],
        take: SAMPLE_LIMIT,
    });
    const periods = await loadPeriods(tx, [
        invoice.invoiceDate,
        ...payments.map((p) => p.paymentDate),
        ...journals.map((j) => j.entryDate),
    ]);
    const ar = await arCandidate(tx);
    const sales = journals.filter((j) => j.referenceType === 'SALES_INVOICE');
    const paymentTotal = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const truncated =
        aggregate._count._all > payments.length ||
        journalCount > journals.length;
    const { collectBarterHealth } = await import('./barter-health-service');
    const barterHealth = await Promise.all([...new Set(barterSettlementIds)].map(id => collectBarterHealth(tx, undefined, id)));
    const issues = [
        ...barterHealth.flatMap((health, index) => health.scanned !== 1 ? [`BARTER_HEADER_INVALID:${[...new Set(barterSettlementIds)][index]}`] : health.issues.map(issue => `BARTER_${issue.reason}:${issue.id}`)),
        ...paymentIssues(invoice, paymentTotal),
        ...(!ar ? ['AR_ACCOUNT_UNRESOLVED'] : []),
        ...(!sales.length && journalCount === journals.length
            ? ['SALES_JOURNAL_MISSING']
            : []),
        ...(sales.length > 1 ? ['SALES_JOURNAL_DUPLICATE'] : []),
        ...payments.flatMap((p) => {
            const count = p.barterSettlementId
                ? journals.filter(
                      (j) =>
                          j.referenceType === 'BARTER_SETTLEMENT' &&
                          j.referenceId === p.barterSettlementId,
                  ).length
                : journals.filter(
                      (j) =>
                          j.referenceType === 'SALES_PAYMENT' &&
                          j.referenceId === p.id,
                  ).length;
            return count > 1
                ? [`PAYMENT_JOURNAL_DUPLICATE:${p.id}`]
                : !count && journalCount === journals.length
                  ? [`PAYMENT_JOURNAL_MISSING:${p.id}`]
                  : [];
        }),
        ...journals.flatMap((j) => journalIssues(j, invoice, payments, ar?.id)),
        ...periods
            .filter((p) => p.status === 'MISSING')
            .map((p) => `PERIOD_MISSING:${p.key}`),
    ];
    return {
        paymentTotal: Number(paymentTotal),
        paymentCount: aggregate._count._all,
        payments,
        journals,
        journalCount,
        periods,
        ar,
        issues,
        truncated,
    };
}

export async function diagnoseInvoice(
    tx: Prisma.TransactionClient,
    searchTerm: string,
) {
    const selection = await findInvoices(tx, searchTerm);
    if (selection.kind !== 'selected')
        return { selection, diagnosis: undefined };
    return {
        selection,
        diagnosis: await inspectInvoice(tx, selection.invoices[0]),
    };
}
