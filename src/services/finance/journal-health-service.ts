import type { Prisma, PrismaClient, ReferenceType } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Finance journal health: documents that should carry a JournalEntry but
 * don't (or whose AR/AP leg doesn't match the document amount).
 *
 * Every query runs on the explicitly-passed client (`db`) — never the ambient
 * prisma proxy — so this works both inside tenant-scoped app requests AND in
 * the cron/digest path where the tenant client is resolved directly (see the
 * note in lib/findings/finding-sync.ts).
 */

export type MissingInvoiceIssue = {
    id: string;
    invoiceNumber: string;
    status: string;
    invoiceDate: Date;
    totalAmount: number;
    customerName: string | null;
};

export type ShortfallIssue = {
    id: string;
    invoiceNumber: string;
    arDebit: number;
    totalAmount: number;
    difference: number;
};

export type MissingPaymentIssue = {
    id: string;
    paymentNumber: string | null;
    paymentDate: Date;
    amount: number;
    method: string | null;
};

export type MissingVatInvoiceIssue = {
    id: string;
    invoiceNumber: string;
    status: string;
    invoiceDate: Date;
    totalAmount: number;
    derivedTaxAmount: number;
};

export type NonVatInvoiceStat = {
    count: number;
    totalAmount: number;
};

export type FinanceJournalIssues = {
    arAccountCode: string | null;
    apAccountCode: string | null;
    salesInvoicesMissing: MissingInvoiceIssue[];
    salesInvoiceShortfalls: ShortfallIssue[];
    salesPaymentsMissing: MissingPaymentIssue[];
    purchaseInvoicesMissingVat: MissingVatInvoiceIssue[];
    purchaseInvoicesNonVat: NonVatInvoiceStat;
    purchasePaymentsMissing: MissingPaymentIssue[];
};

const CONTROL_ACCOUNT_PATTERNS = {
    ar: [
        { code: '11210' },
        { code: '1-115b' },
        { code: '1-115' },
        { name: { contains: 'Piutang Dagang', mode: 'insensitive' as const } },
    ],
    ap: [
        { code: '21100' },
        { code: '2-110b' },
        { code: '2-110' },
        { name: { contains: 'Hutang Dagang', mode: 'insensitive' as const } },
        { name: { contains: 'Utang Dagang', mode: 'insensitive' as const } },
    ],
};

async function findControlAccount(db: Db, side: 'ar' | 'ap') {
    return db.account.findFirst({
        where: { OR: CONTROL_ACCOUNT_PATTERNS[side] },
        select: { id: true, code: true },
        orderBy: { code: 'asc' },
    });
}

type JournalRef = { referenceId: string | null; status: string };

async function loadJournalIndex(
    db: Db,
    referenceType: ReferenceType,
): Promise<Map<string, { statuses: Set<string> }>> {
    const journals = await db.journalEntry.findMany({
        where: {
            referenceType,
            referenceId: { not: null },
            status: { not: 'VOIDED' },
        },
        select: { referenceId: true, status: true },
    });
    const index = new Map<string, { statuses: Set<string> }>();
    for (const j of journals as JournalRef[]) {
        if (!j.referenceId) continue;
        const entry = index.get(j.referenceId) ?? { statuses: new Set() };
        entry.statuses.add(j.status);
        index.set(j.referenceId, entry);
    }
    return index;
}

async function loadArDebitByInvoice(
    db: Db,
    arAccountId: string,
): Promise<Map<string, number>> {
    const groups = await db.journalLine.groupBy({
        by: ['journalEntryId'],
        where: { accountId: arAccountId, debit: { gt: 0 } },
        _sum: { debit: true },
    });
    if (groups.length === 0) return new Map();
    const entries = await db.journalEntry.findMany({
        where: {
            id: { in: groups.map((g) => g.journalEntryId) },
            referenceType: 'SALES_INVOICE',
            referenceId: { not: null },
            status: { not: 'VOIDED' },
        },
        select: { id: true, referenceId: true },
    });
    const sumsByEntry = new Map(
        groups.map((g) => [g.journalEntryId, Number(g._sum.debit ?? 0)]),
    );
    const byInvoice = new Map<string, number>();
    for (const entry of entries) {
        if (!entry.referenceId) continue;
        const sum = sumsByEntry.get(entry.id) ?? 0;
        byInvoice.set(entry.referenceId, (byInvoice.get(entry.referenceId) ?? 0) + sum);
    }
    return byInvoice;
}

export async function collectFinanceJournalIssues(
    db: Db,
): Promise<FinanceJournalIssues> {
    const [arAccount, apAccount] = await Promise.all([
        findControlAccount(db, 'ar'),
        findControlAccount(db, 'ap'),
    ]);

    const [
        salesInvoiceJournalIndex,
        salesPaymentJournalIndex,
        purchaseInvoiceJournalIndex,
        purchasePaymentJournalIndex,
        invoices,
        payments,
        purchaseInvoices,
    ] = await Promise.all([
        loadJournalIndex(db, 'SALES_INVOICE'),
        loadJournalIndex(db, 'SALES_PAYMENT'),
        loadJournalIndex(db, 'PURCHASE_INVOICE'),
        loadJournalIndex(db, 'PURCHASE_PAYMENT'),
        db.invoice.findMany({
            where: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
            select: {
                id: true,
                invoiceNumber: true,
                status: true,
                invoiceDate: true,
                totalAmount: true,
                salesOrder: { select: { customer: { select: { name: true } } } },
            },
        }),
        db.payment.findMany({
            where: { invoiceId: { not: null }, amount: { gt: 0 } },
            select: {
                id: true,
                paymentNumber: true,
                paymentDate: true,
                amount: true,
                method: true,
            },
        }),
        db.purchaseInvoice.findMany({
            where: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
            select: {
                id: true,
                invoiceNumber: true,
                status: true,
                invoiceDate: true,
                totalAmount: true,
                purchaseOrder: {
                    select: { totalAmount: true, taxAmount: true },
                },
            },
        }),
    ]);

    const salesInvoicesMissing: MissingInvoiceIssue[] = [];
    const salesInvoiceShortfalls: ShortfallIssue[] = [];

    const arDebits = arAccount
        ? await loadArDebitByInvoice(db, arAccount.id)
        : new Map<string, number>();

    for (const inv of invoices) {
        const hasJournal = salesInvoiceJournalIndex.has(inv.id);
        if (!hasJournal) {
            salesInvoicesMissing.push({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
                invoiceDate: inv.invoiceDate,
                totalAmount: Number(inv.totalAmount),
                customerName: inv.salesOrder?.customer?.name ?? null,
            });
            continue;
        }
        if (arAccount) {
            const arDebit = arDebits.get(inv.id) ?? 0;
            const total = Number(inv.totalAmount);
            if (Math.abs(arDebit - total) > 0.01) {
                salesInvoiceShortfalls.push({
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    arDebit,
                    totalAmount: total,
                    difference: total - arDebit,
                });
            }
        }
    }

    const salesPaymentsMissing: MissingPaymentIssue[] = payments
        .filter((p) => !salesPaymentJournalIndex.has(p.id))
        .map((p) => ({
            id: p.id,
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            amount: Number(p.amount),
            method: p.method,
        }));

    const purchaseInvoicesMissingVat: MissingVatInvoiceIssue[] = [];
    let nonVatCount = 0;
    let nonVatTotal = 0;

    for (const inv of purchaseInvoices) {
        const total = Number(inv.totalAmount);
        const poTotal = Number(inv.purchaseOrder?.totalAmount ?? 0);
        const poTax = Number(inv.purchaseOrder?.taxAmount ?? 0);

        // Mirror handlePurchaseInvoiceCreated: VAT journal only exists when
        // the PO carries tax — non-VAT bills have no journal by design.
        // Rounded for reporting (the float formula picks up ~1e-11 noise).
        let taxAmount = 0;
        if (poTotal > 0 && poTax > 0 && poTotal > poTax) {
            const taxRate = poTax / (poTotal - poTax);
            taxAmount = Math.round((total - total / (1 + taxRate)) * 100) / 100;
        }

        if (taxAmount <= 0) {
            nonVatCount += 1;
            nonVatTotal += total;
            continue;
        }
        if (!purchaseInvoiceJournalIndex.has(inv.id)) {
            purchaseInvoicesMissingVat.push({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
                invoiceDate: inv.invoiceDate,
                totalAmount: total,
                derivedTaxAmount: taxAmount,
            });
        }
    }

    const supplierPayments = await db.payment.findMany({
        where: { purchaseInvoiceId: { not: null }, amount: { gt: 0 } },
        select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            method: true,
        },
    });
    const purchasePaymentsMissing: MissingPaymentIssue[] = supplierPayments
        .filter((p) => !purchasePaymentJournalIndex.has(p.id))
        .map((p) => ({
            id: p.id,
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            amount: Number(p.amount),
            method: p.method,
        }));

    return {
        arAccountCode: arAccount?.code ?? null,
        apAccountCode: apAccount?.code ?? null,
        salesInvoicesMissing,
        salesInvoiceShortfalls,
        salesPaymentsMissing,
        purchaseInvoicesMissingVat,
        purchaseInvoicesNonVat: { count: nonVatCount, totalAmount: nonVatTotal },
        purchasePaymentsMissing,
    };
}
