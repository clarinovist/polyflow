import type { Prisma, PrismaClient, ReferenceType } from '@prisma/client';
import { collectBarterHealth, type BarterSettlementIssue } from './barter-health-service';

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
    invoiceDate: Date;
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

/**
 * Cutover model AP invoice-based (GR/IR clearing): mulai tanggal ini SEMUA
 * purchase invoice wajib punya jurnal (Dr GR/IR + Dr PPN / Cr AP) — bukan
 * cuma yang ber-PPN. Invoice pra-cutoff tidak diwajibkan (historis, sudah
 * terparkir di 1-199 via rekonsiliasi 2026-08-31).
 */
export const PURCHASE_JOURNAL_CUTOFF_ISO = '2026-08-31T17:00:00.000Z'; // 2026-09-01 00:00 WIB

export type PurchaseInvoiceMissingIssue = {
    id: string;
    invoiceNumber: string;
    status: string;
    invoiceDate: Date;
    totalAmount: number;
};

export type FinanceJournalIssues = {
    arAccountCode: string | null;
    apAccountCode: string | null;
    salesInvoicesMissing: MissingInvoiceIssue[];
    salesInvoicesUnposted: MissingInvoiceIssue[];
    salesInvoiceShortfalls: ShortfallIssue[];
    salesPaymentsMissing: MissingPaymentIssue[];
    purchaseInvoicesMissing: PurchaseInvoiceMissingIssue[];
    purchasePaymentsMissing: MissingPaymentIssue[];
    barterSettlementsInvalid: BarterSettlementIssue[];
    barterScanTruncated: boolean;
    barterNextCursor: string | null;
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

type JournalIndexEntry = { statuses: Set<string>; count: number };

async function loadJournalIndex(
    db: Db,
    referenceType: ReferenceType,
): Promise<Map<string, JournalIndexEntry>> {
    const journals = await db.journalEntry.findMany({
        where: {
            referenceType,
            referenceId: { not: null },
            status: { not: 'VOIDED' },
        },
        select: { referenceId: true, status: true },
    });
    const index = new Map<string, JournalIndexEntry>();
    for (const j of journals as JournalRef[]) {
        if (!j.referenceId) continue;
        const entry = index.get(j.referenceId) ?? {
            statuses: new Set(),
            count: 0,
        };
        entry.statuses.add(j.status);
        entry.count += 1;
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
            status: 'POSTED',
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
        byInvoice.set(
            entry.referenceId,
            (byInvoice.get(entry.referenceId) ?? 0) + sum,
        );
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
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
            },
        }),
        db.payment.findMany({
            where: {
                invoiceId: { not: null },
                amount: { gt: 0 },
                barterLeg: null,
            },
            select: {
                id: true,
                paymentNumber: true,
                paymentDate: true,
                amount: true,
                method: true,
            },
        }),
        db.purchaseInvoice.findMany({
            where: {
                status: { notIn: ['CANCELLED', 'DRAFT'] },
                invoiceDate: { gte: new Date(PURCHASE_JOURNAL_CUTOFF_ISO) },
            },
            select: {
                id: true,
                invoiceNumber: true,
                status: true,
                invoiceDate: true,
                totalAmount: true,
            },
        }),
    ]);

    const salesInvoicesMissing: MissingInvoiceIssue[] = [];
    const salesInvoicesUnposted: MissingInvoiceIssue[] = [];
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
        if (!salesInvoiceJournalIndex.get(inv.id)?.statuses.has('POSTED')) {
            salesInvoicesUnposted.push({
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
                    invoiceDate: inv.invoiceDate,
                    arDebit,
                    totalAmount: total,
                    difference: total - arDebit,
                });
            }
        }
    }

    const salesPaymentsMissing: MissingPaymentIssue[] = payments
        .filter(
            (p) => !salesPaymentJournalIndex.get(p.id)?.statuses.has('POSTED'),
        )
        .map((p) => ({
            id: p.id,
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            amount: Number(p.amount),
            method: p.method,
        }));

    // Post-cutoff: SEMUA purchase invoice wajib punya jurnal (model AP
    // invoice-based). Pra-cutoff dikecualikan (historis terparkir di 1-199).
    const purchaseInvoicesMissing: PurchaseInvoiceMissingIssue[] =
        purchaseInvoices
            .filter(
                (inv) =>
                    !purchaseInvoiceJournalIndex
                        .get(inv.id)
                        ?.statuses.has('POSTED'),
            )
            .map((inv) => ({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                status: inv.status,
                invoiceDate: inv.invoiceDate,
                totalAmount: Number(inv.totalAmount),
            }));

    const supplierPayments = await db.payment.findMany({
        where: {
            purchaseInvoiceId: { not: null },
            amount: { gt: 0 },
            OR: [{ barterLeg: null }, { barterLeg: 'AP_CASH' }],
            paymentDate: { gte: new Date(PURCHASE_JOURNAL_CUTOFF_ISO) },
        },
        select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            method: true,
        },
    });
    const purchasePaymentsMissing: MissingPaymentIssue[] = supplierPayments
        .filter(
            (p) =>
                !purchasePaymentJournalIndex.get(p.id)?.statuses.has('POSTED'),
        )
        .map((p) => ({
            id: p.id,
            paymentNumber: p.paymentNumber,
            paymentDate: p.paymentDate,
            amount: Number(p.amount),
            method: p.method,
        }));

    const barterHealth = await collectBarterHealth(db);

    return {
        arAccountCode: arAccount?.code ?? null,
        apAccountCode: apAccount?.code ?? null,
        salesInvoicesMissing,
        salesInvoicesUnposted,
        salesInvoiceShortfalls,
        salesPaymentsMissing,
        purchaseInvoicesMissing,
        purchasePaymentsMissing,
        barterSettlementsInvalid: barterHealth.issues,
        barterScanTruncated: barterHealth.truncated,
        barterNextCursor: barterHealth.nextCursor,
    };
}
