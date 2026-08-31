import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { collectFinanceJournalIssues } from '../journal-health-service';

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
                };
            }) => {
                if (args.where.id?.in) return cfg.arDebitEntries ?? [];
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
            findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
                'purchaseInvoiceId' in args.where
                    ? cfg.supplierPayments
                    : cfg.customerPayments,
            ),
        },
        purchaseInvoice: {
            findMany: vi.fn(async () => cfg.purchaseInvoices),
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
                paymentDate: new Date('2026-07-08'),
                amount: 90000,
                method: 'Bank Transfer',
            },
        ],
        purchaseInvoices: [
            {
                id: 'pinv-missing-vat',
                invoiceNumber: 'BILL-MISS',
                status: 'UNPAID',
                invoiceDate: new Date('2026-07-02'),
                totalAmount: 110000,
                purchaseOrder: { totalAmount: 110000, taxAmount: 10000 },
            },
            {
                id: 'pinv-nonvat',
                invoiceNumber: 'BILL-NONVAT',
                status: 'UNPAID',
                invoiceDate: new Date('2026-07-03'),
                totalAmount: 80000,
                purchaseOrder: { totalAmount: 0, taxAmount: 0 },
            },
            {
                id: 'pinv-ok',
                invoiceNumber: 'BILL-OK',
                status: 'UNPAID',
                invoiceDate: new Date('2026-07-04'),
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

        expect(issues.purchaseInvoicesMissingVat).toHaveLength(1);
        expect(issues.purchaseInvoicesMissingVat[0]).toMatchObject({
            id: 'pinv-missing-vat',
            derivedTaxAmount: 10000,
        });

        expect(issues.purchaseInvoicesNonVat).toEqual({
            count: 1,
            totalAmount: 80000,
        });

        expect(issues.purchasePaymentsMissing).toHaveLength(1);
        expect(issues.purchasePaymentsMissing[0]).toMatchObject({
            id: 'ppay-missing',
        });
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
