import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { collectFinanceJournalIssues } from '../journal-health-service';
import { collectBarterHealth } from '../barter-health-service';
vi.mock('../barter-health-service', () => ({ collectBarterHealth: vi.fn(async () => ({ issues: [], scanned: 0, truncated: false, nextCursor: null })) }));

type FakeDbConfig = {
    accounts: {
        ar?: { id: string; code: string } | null;
        ap?: { id: string; code: string } | null;
    };
    journalByType: Record<string, Array<{ referenceId: string; status: string }>>;
    invoices: unknown[];
    customerPayments: unknown[];
    supplierPayments: unknown[];
    purchaseInvoices: unknown[];
    arDebitEntries?: Array<{ id: string; referenceId: string }>;
    arDebitGroups?: Array<{ journalEntryId: string; _sum: { debit: number | null } }>;
    barterSettlements?: unknown[];
    manualJournals?: unknown[];
};

function makeFakeDb(cfg: FakeDbConfig): PrismaClient {
    const db = {
        account: {
            findFirst: vi.fn(async (args: { where: { OR: unknown[] } }) => {
                const serialized = JSON.stringify(args.where.OR);
                return serialized.includes('Piutang Dagang')
                    ? (cfg.accounts.ar ?? null)
                    : (cfg.accounts.ap ?? null);
            }),
        },
        journalEntry: {
            findMany: vi.fn(async (args: {
                where: {
                    referenceType?: string;
                    id?: { in: string[] };
                    OR?: unknown[];
                };
            }) => {
                if (args.where.id?.in) return cfg.arDebitEntries ?? [];
                // Manual AR credit coverage lookup (no top-level referenceType).
                if (args.where.OR) return cfg.manualJournals ?? [];
                return cfg.journalByType[args.where.referenceType ?? ''] ?? [];
            }),
        },
        journalLine: {
            groupBy: vi.fn(async () => cfg.arDebitGroups ?? []),
        },
        invoice: {
            findMany: vi.fn(async () => cfg.invoices),
        },
        payment: {
            findMany: vi.fn(async (args: {
                where: Record<string, unknown>;
            }) => {
                if ('purchaseInvoiceId' in args.where) {
                    const gte = (
                        args.where.paymentDate as { gte?: Date } | undefined
                    )?.gte;
                    const rows = cfg.supplierPayments as Array<{
                        paymentDate: Date;
                    }>;
                    return gte
                        ? rows.filter((r) => r.paymentDate >= gte)
                        : rows;
                }
                return cfg.customerPayments;
            }),
        },
        purchaseInvoice: {
            findMany: vi.fn(async (args: {
                where: {
                    invoiceDate?: { gte: Date };
                };
            }) => {
                const gte = args.where.invoiceDate?.gte;
                const rows = cfg.purchaseInvoices as Array<{
                    invoiceDate: Date;
                }>;
                return gte
                    ? rows.filter((r) => r.invoiceDate >= gte)
                    : rows;
            }),
        },
        barterSettlement: {
            findMany: vi.fn(async () => cfg.barterSettlements ?? []),
        },
    };
    return db as unknown as PrismaClient;
}

describe('collectFinanceJournalIssues', () => {
    const baseConfig: FakeDbConfig = {
        accounts: {
            ar: { id: 'acc-ar', code: '1-115b' },
            ap: { id: 'acc-ap', code: '2-110b' },
        },
        journalByType: {
            SALES_INVOICE: [
                { referenceId: 'inv-short', status: 'POSTED' },
                { referenceId: 'inv-ok', status: 'POSTED' },
            ],
            SALES_PAYMENT: [{ referenceId: 'pay-ok', status: 'POSTED' }],
            PURCHASE_INVOICE: [{ referenceId: 'pinv-ok', status: 'POSTED' }],
            PURCHASE_PAYMENT: [],
            BARTER_SETTLEMENT: [],
        },
        invoices: [
            {
                id: 'inv-missing',
                invoiceNumber: 'INV-MISS',
                status: 'PAID',
                invoiceDate: new Date('2026-06-24'),
                totalAmount: 23415000,
                salesOrder: { customer: { name: 'Toko A' } },
            },
            {
                id: 'inv-short',
                invoiceNumber: 'INV-SHORT',
                status: 'PAID',
                invoiceDate: new Date('2026-06-12'),
                totalAmount: 150000,
                salesOrder: { customer: { name: 'Toko B' } },
            },
            {
                id: 'inv-ok',
                invoiceNumber: 'INV-OK',
                status: 'PAID',
                invoiceDate: new Date('2026-07-01'),
                totalAmount: 100000,
                salesOrder: { customer: { name: 'Toko C' } },
            },
        ],
        customerPayments: [
            {
                id: 'pay-missing',
                paymentNumber: 'PAY-IN-9',
                paymentDate: new Date('2026-06-05'),
                amount: 50000,
                method: 'Cash',
            },
            {
                id: 'pay-ok',
                paymentNumber: 'PAY-IN-1',
                paymentDate: new Date('2026-07-05'),
                amount: 70000,
                method: 'Bank Transfer',
            },
        ],
        supplierPayments: [
            {
                id: 'ppay-missing',
                paymentNumber: 'PAY-OUT-9',
                paymentDate: new Date('2026-09-05'),
                amount: 90000,
                method: 'Bank Transfer',
            },
        ],
        purchaseInvoices: [
            {
                id: 'pinv-missing',
                invoiceNumber: 'BILL-MISS',
                status: 'UNPAID',
                invoiceDate: new Date('2026-09-02'),
                totalAmount: 110000,
                purchaseOrder: { totalAmount: 110000, taxAmount: 10000 },
            },
            {
                id: 'pinv-nonvat',
                invoiceNumber: 'BILL-NONVAT',
                status: 'UNPAID',
                invoiceDate: new Date('2026-09-03'),
                totalAmount: 80000,
                purchaseOrder: { totalAmount: 0, taxAmount: 0 },
            },
            {
                id: 'pinv-ok',
                invoiceNumber: 'BILL-OK',
                status: 'UNPAID',
                invoiceDate: new Date('2026-09-04'),
                totalAmount: 220000,
                purchaseOrder: { totalAmount: 220000, taxAmount: 20000 },
            },
        ],
        arDebitEntries: [
            { id: 'je-short', referenceId: 'inv-short' },
            { id: 'je-ok', referenceId: 'inv-ok' },
        ],
        arDebitGroups: [
            { journalEntryId: 'je-short', _sum: { debit: 127000 } },
            { journalEntryId: 'je-ok', _sum: { debit: 100000 } },
        ],
    };

    let db: PrismaClient;

    beforeEach(() => {
        db = makeFakeDb(baseConfig);
    });

    it('flags missing journals, AR shortfalls, and missing payments', async () => {
        const issues = await collectFinanceJournalIssues(db);

        expect(issues.arAccountCode).toBe('1-115b');
        expect(issues.apAccountCode).toBe('2-110b');

        expect(issues.salesInvoicesMissing).toHaveLength(1);
        expect(issues.salesInvoicesMissing[0]).toMatchObject({
            id: 'inv-missing',
            invoiceNumber: 'INV-MISS',
            totalAmount: 23415000,
            customerName: 'Toko A',
        });

        expect(issues.salesInvoiceShortfalls).toHaveLength(1);
        expect(issues.salesInvoiceShortfalls[0]).toMatchObject({
            id: 'inv-short',
            arDebit: 127000,
            totalAmount: 150000,
            difference: 23000,
        });

        expect(issues.salesPaymentsMissing).toHaveLength(1);
        expect(issues.salesPaymentsMissing[0]).toMatchObject({
            id: 'pay-missing',
            amount: 50000,
        });

        expect(issues.purchaseInvoicesMissing).toHaveLength(2);
        expect(issues.purchaseInvoicesMissing[0]).toMatchObject({
            id: 'pinv-missing',
            totalAmount: 110000,
        });
        // Post-cutoff: non-VAT invoice juga wajib jurnal (model AP invoice-based)
        expect(issues.purchaseInvoicesMissing[1]).toMatchObject({
            id: 'pinv-nonvat',
            totalAmount: 80000,
        });

        expect(issues.purchasePaymentsMissing).toHaveLength(1);
        expect(issues.purchasePaymentsMissing[0]).toMatchObject({
            id: 'ppay-missing',
        });
    });

    it('excludes pre-cutoff purchase documents (historis terparkir di 1-199)', async () => {
        db = makeFakeDb({
            ...baseConfig,
            purchaseInvoices: baseConfig.purchaseInvoices.map((inv) => ({
                ...(inv as { invoiceDate: Date }),
                invoiceDate: new Date('2026-08-20'),
            })),
            supplierPayments: baseConfig.supplierPayments.map((p) => ({
                ...(p as { paymentDate: Date }),
                paymentDate: new Date('2026-08-20'),
            })),
        });

        const issues = await collectFinanceJournalIssues(db);

        expect(issues.purchaseInvoicesMissing).toHaveLength(0);
        expect(issues.purchasePaymentsMissing).toHaveLength(0);
    });

    it('classifies a paid invoice with only a DRAFT journal as unposted, not missing', async () => {
        db = makeFakeDb({
            ...baseConfig,
            invoices: [{ id: 'paid-draft', invoiceNumber: 'INV-PAID', status: 'PAID', totalAmount: 4382000, invoiceDate: new Date('2026-08-19') }],
            journalByType: { ...baseConfig.journalByType, SALES_INVOICE: [{ referenceId: 'paid-draft', status: 'DRAFT' }] },
            arDebitEntries: [{ id: 'draft-je', referenceId: 'paid-draft' }],
            arDebitGroups: [{ journalEntryId: 'draft-je', _sum: { debit: 4382000 } }],
        });
        const issues = await collectFinanceJournalIssues(db);
        expect(issues).toMatchObject({
            salesInvoicesMissing: [],
            salesInvoicesUnposted: [{ id: 'paid-draft', invoiceNumber: 'INV-PAID', totalAmount: 4382000 }],
            salesInvoiceShortfalls: [],
        });
    });

    it('only counts POSTED AR amounts when checking invoice shortfalls', async () => {
        await collectFinanceJournalIssues(db);
        expect(db.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: expect.anything(), status: 'POSTED' }),
        }));
    });

    it.each([
        ['SALES_PAYMENT', 'salesPaymentsMissing', 'pay-ok'],
        ['PURCHASE_INVOICE', 'purchaseInvoicesMissing', 'pinv-ok'],
        ['PURCHASE_PAYMENT', 'purchasePaymentsMissing', 'ppay-missing'],
    ] as const)('requires POSTED journals for %s health', async (kind, collection, id) => {
        db = makeFakeDb({
            ...baseConfig,
            journalByType: { ...baseConfig.journalByType, [kind]: [{ referenceId: id, status: 'DRAFT' }] },
        });
        const issues = await collectFinanceJournalIssues(db);
        expect(issues[collection].map(row => row.id)).toContain(id);
    });

    it('reports an incomplete active barter package instead of requiring per-offset journals', async () => {
        db = makeFakeDb({
            ...baseConfig,
            journalByType: {
                ...baseConfig.journalByType,
                BARTER_SETTLEMENT: [],
            },
            barterSettlements: [
                {
                    id: 'settlement-1',
                    settlementNumber: 'BRT-00001',
                    barterAmount: { eq: (value: unknown) => Number(value) === 600 },
                    cashAmount: { gt: () => false },
                    payments: [
                        {
                            barterLeg: 'AR_OFFSET',
                            amount: { eq: () => true },
                        },
                        {
                            barterLeg: 'AP_OFFSET',
                            amount: { eq: () => true },
                        },
                    ],
                },
            ],
        });

        vi.mocked(collectBarterHealth).mockResolvedValueOnce({ issues: [{ id: 'settlement-1', settlementNumber: 'BRT-00001', reason: 'OFFSET_JOURNAL_MISSING' }], scanned: 1, truncated: true, nextCursor: 'settlement-1' });
        const issues = await collectFinanceJournalIssues(db);
        expect(issues.barterScanTruncated).toBe(true);
        expect(issues.barterNextCursor).toBe('settlement-1');
        expect(collectBarterHealth).toHaveBeenCalledWith(db);
        expect(issues.barterSettlementsInvalid).toEqual([
            {
                id: 'settlement-1',
                settlementNumber: 'BRT-00001',
                reason: 'OFFSET_JOURNAL_MISSING',
            },
        ]);
    });

    it('skips shortfall detection when the AR control account cannot be resolved', async () => {
        db = makeFakeDb({ ...baseConfig, accounts: { ar: null, ap: null } });

        const issues = await collectFinanceJournalIssues(db);

        expect(issues.arAccountCode).toBeNull();
        expect(issues.salesInvoiceShortfalls).toHaveLength(0);
        // Missing-journal detection still works without the control account.
        expect(issues.salesInvoicesMissing).toHaveLength(1);
    });
});

describe('collectFinanceJournalIssues: historical payments covered by manual journals', () => {
    const HISTORICAL_SO = { orderNumber: 'OB-AR-0001', notes: null };
    const OPERATIONAL_SO = { orderNumber: 'SO-2026-0100', notes: null };

    const payment = (
        id: string,
        paymentNumber: string,
        salesOrder: { orderNumber: string; notes: string | null } | null,
        extra: Record<string, unknown> = {},
    ) => ({
        id,
        paymentNumber,
        paymentDate: new Date('2026-06-10T03:00:00.000Z'),
        amount: 500000,
        method: 'Bank Transfer',
        invoice: salesOrder ? { salesOrder } : null,
        ...extra,
    });

    const manualEntry = (
        entryNumber: string,
        credits: number[],
        entryDate = new Date('2026-06-10T10:00:00.000Z'),
    ) => ({
        entryNumber,
        entryDate,
        lines: credits.map((credit) => ({ credit })),
    });

    const base: FakeDbConfig = {
        accounts: { ar: { id: 'acc-ar', code: '1-115b' }, ap: null },
        journalByType: {},
        invoices: [],
        customerPayments: [],
        supplierPayments: [],
        purchaseInvoices: [],
    };

    const missingIds = async (db: PrismaClient) =>
        (await collectFinanceJournalIssues(db)).salesPaymentsMissing.map(
            (p) => p.id,
        );

    it('still reports an operational payment even when a matching manual journal exists', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-op', 'PAY-IN-1', OPERATIONAL_SO)],
            manualJournals: [manualEntry('PAY-IN-1', [500000])],
        });

        expect(await missingIds(db)).toEqual(['p-op']);
    });

    it('does not report a historical payment whose number matches a manual AR credit entry', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [
                payment('p-num', 'PAY-IN-2', HISTORICAL_SO, { amount: 123 }),
            ],
            manualJournals: [
                manualEntry('PAY-IN-2', [999], new Date('2026-06-30T00:00:00Z')),
            ],
        });

        expect(await missingIds(db)).toEqual([]);
    });

    it('does not report a historical payment matched by amount and same UTC date', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-amt', 'PAY-IN-3', HISTORICAL_SO)],
            manualJournals: [manualEntry('JV-0001', [500000.0])],
        });

        expect(await missingIds(db)).toEqual([]);
    });

    it('reports a historical payment when amount matches but the date differs', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-date', 'PAY-IN-4', HISTORICAL_SO)],
            manualJournals: [
                manualEntry('JV-0002', [500000], new Date('2026-06-11T00:00:00Z')),
            ],
        });

        expect(await missingIds(db)).toEqual(['p-date']);
    });

    it('reports a historical payment with no matching manual journal', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-none', 'PAY-IN-5', HISTORICAL_SO)],
            manualJournals: [manualEntry('JV-0003', [1])],
        });

        expect(await missingIds(db)).toEqual(['p-none']);
    });

    it('exempts nothing when the AR control account cannot be resolved', async () => {
        const db = makeFakeDb({
            ...base,
            accounts: { ar: null, ap: null },
            customerPayments: [payment('p-noar', 'PAY-IN-6', HISTORICAL_SO)],
            manualJournals: [manualEntry('PAY-IN-6', [500000])],
        });

        expect(await missingIds(db)).toEqual(['p-noar']);
    });

    it('treats a payment with an unknown sales order as operational', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-unk', 'PAY-IN-7', null)],
            manualJournals: [manualEntry('PAY-IN-7', [500000])],
        });

        expect(await missingIds(db)).toEqual(['p-unk']);
    });

    it('issues one bounded coverage query for historical candidates only', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [
                payment('p-h1', 'PAY-IN-8', HISTORICAL_SO),
                payment('p-h2', 'PAY-IN-9', HISTORICAL_SO, {
                    paymentDate: new Date('2026-06-20T03:00:00.000Z'),
                }),
                payment('p-op', 'PAY-IN-10', OPERATIONAL_SO),
            ],
        });

        await collectFinanceJournalIssues(db);

        const coverageCalls = vi
            .mocked(db.journalEntry.findMany)
            .mock.calls.filter(([args]) => 'OR' in (args?.where ?? {}));
        expect(coverageCalls).toHaveLength(1);
        const where = coverageCalls[0][0]?.where as {
            status: string;
            OR: unknown[];
            entryDate: { gte: Date; lte: Date };
        };
        expect(where.status).toBe('POSTED');
        expect(where.OR).toEqual([
            { referenceType: null },
            { referenceType: { not: 'SALES_PAYMENT' } },
        ]);
        expect(where.entryDate.gte.toISOString()).toBe('2026-06-09T03:00:00.000Z');
        expect(where.entryDate.lte.toISOString()).toBe('2026-06-21T03:00:00.000Z');
    });

    it('skips the coverage query when no historical payment lacks a journal', async () => {
        const db = makeFakeDb({
            ...base,
            customerPayments: [payment('p-op', 'PAY-IN-11', OPERATIONAL_SO)],
        });

        await collectFinanceJournalIssues(db);

        const coverageCalls = vi
            .mocked(db.journalEntry.findMany)
            .mock.calls.filter(([args]) => 'OR' in (args?.where ?? {}));
        expect(coverageCalls).toHaveLength(0);
    });
});
