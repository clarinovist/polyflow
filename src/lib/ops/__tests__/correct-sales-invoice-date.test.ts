import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    correctSalesInvoiceDate,
    type CorrectionDb,
    type SalesInvoiceDateCorrectionInput,
} from '../../../../scripts/correct-sales-invoice-date';

const WIB_SEP_26 = new Date('2026-09-25T17:00:00.000Z');
const WIB_SEP_27 = new Date('2026-09-26T17:00:00.000Z');
const WIB_OCT_6 = new Date('2026-10-05T17:00:00.000Z');
const WIB_OCT_7 = new Date('2026-10-06T17:00:00.000Z');

function invoice(overrides: Record<string, unknown> = {}) {
    return {
        id: 'invoice-id',
        invoiceNumber: '13/INV/X/2026',
        invoiceDate: WIB_SEP_26,
        dueDate: WIB_SEP_27,
        termOfPaymentDays: 1,
        status: 'PAID',
        totalAmount: new Prisma.Decimal('7668500'),
        paidAmount: new Prisma.Decimal('7668500'),
        creditedAmount: new Prisma.Decimal(0),
        priceAdjustmentAmount: new Prisma.Decimal(0),
        updatedAt: new Date('2026-10-06T07:55:04.654Z'),
        salesOrder: { orderNumber: 'SO-2026-0219' },
        payments: [{ id: 'payment' }],
        priceAdjustments: [],
        returnAllocations: [],
        ...overrides,
    };
}

function journal(overrides: Record<string, unknown> = {}) {
    return {
        id: 'journal-id', entryNumber: 'JE-10809', entryDate: WIB_SEP_26,
        status: 'POSTED', reference: '13/INV/X/2026',
        description: 'Sales Invoice #13/INV/X/2026',
        updatedAt: new Date('2026-10-06T07:47:21.444Z'),
        lines: [
            { debit: new Prisma.Decimal('7668500'), credit: new Prisma.Decimal(0) },
            { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal('7668500') },
        ],
        ...overrides,
    };
}

function fixture(invoiceRow = invoice(), journalRow = journal()) {
    const tx = {
        invoice: {
            findUnique: vi.fn().mockResolvedValue(invoiceRow),
            findMany: vi.fn().mockResolvedValue([
                { invoiceNumber: '1/INV/X/2026' },
            ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        journalEntry: {
            findMany: vi.fn().mockResolvedValue([journalRow]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        fiscalPeriod: {
            findUnique: vi.fn().mockResolvedValue({ status: 'OPEN' }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as CorrectionDb;
    return { tx, db };
}

function input(overrides: Partial<SalesInvoiceDateCorrectionInput> = {}): SalesInvoiceDateCorrectionInput {
    return {
        invoiceId: 'invoice-id', expectedInvoiceNumber: '13/INV/X/2026',
        expectedSalesOrderNumber: 'SO-2026-0219', expectedCurrentDate: '2026-09-26',
        newDate: '2026-10-06', expectedStatus: 'PAID', expectedTotal: 7668500,
        expectedPaid: 7668500, renumber: false, execute: false,
        actorUserId: 'system', ...overrides,
    };
}

describe('correctSalesInvoiceDate', () => {
    it('previews a paid invoice correction without writes', async () => {
        const { tx, db } = fixture();
        const result = await correctSalesInvoiceDate(db, input());
        expect(result).toMatchObject({
            mode: 'DRY_RUN', changed: false, oldDate: '2026-09-26',
            newDate: '2026-10-06', newDueDate: '2026-10-07', paymentCount: 1,
            newInvoiceNumber: '13/INV/X/2026',
        });
        expect(tx.invoice.updateMany).not.toHaveBeenCalled();
        expect(tx.journalEntry.updateMany).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('atomically changes invoice date, due date and journal date with an audit row', async () => {
        const { tx, db } = fixture();
        const result = await correctSalesInvoiceDate(db, input({ execute: true }));
        expect(result.changed).toBe(true);
        expect(tx.invoice.updateMany).toHaveBeenCalledWith({
            where: { id: 'invoice-id', updatedAt: invoice().updatedAt },
            data: { invoiceDate: WIB_OCT_6, dueDate: WIB_OCT_7, invoiceNumber: '13/INV/X/2026' },
        });
        expect(tx.journalEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ entryDate: WIB_OCT_6 }),
        }));
        expect(tx.auditLog.create).toHaveBeenCalledOnce();
    });

    it('renumbers a September maklon invoice into the target month', async () => {
        const maklon = invoice({
            id: 'maklon-invoice', invoiceNumber: '15/INV/X/2026',
            invoiceDate: new Date('2026-10-06T17:00:00.000Z'),
            dueDate: new Date('2026-10-07T17:00:00.000Z'), status: 'UNPAID',
            totalAmount: new Prisma.Decimal('23153000'), paidAmount: new Prisma.Decimal(0),
            payments: [], salesOrder: { orderNumber: 'SO-2026-0280' },
        });
        const maklonJournal = journal({
            id: 'maklon-journal', entryNumber: 'JE-10979',
            entryDate: new Date('2026-10-06T17:00:00.000Z'),
            reference: '15/INV/X/2026', description: 'Sales Invoice #15/INV/X/2026',
            lines: [
                { debit: new Prisma.Decimal('23153000'), credit: new Prisma.Decimal(0) },
                { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal('23153000') },
            ],
        });
        const { tx, db } = fixture(maklon, maklonJournal);
        tx.invoice.findMany.mockResolvedValue([{ invoiceNumber: '76/INV/IX/2026' }]);
        const result = await correctSalesInvoiceDate(db, input({
            invoiceId: 'maklon-invoice', expectedInvoiceNumber: '15/INV/X/2026',
            expectedSalesOrderNumber: 'SO-2026-0280', expectedCurrentDate: '2026-10-07',
            newDate: '2026-09-30', expectedStatus: 'UNPAID', expectedTotal: 23153000,
            expectedPaid: 0, renumber: true, execute: true,
        }));
        expect(result.newInvoiceNumber).toBe('77/INV/IX/2026');
        expect(tx.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                invoiceDate: new Date('2026-09-29T17:00:00.000Z'),
                dueDate: new Date('2026-09-30T17:00:00.000Z'),
                invoiceNumber: '77/INV/IX/2026',
            }),
        }));
        expect(tx.journalEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                entryDate: new Date('2026-09-29T17:00:00.000Z'),
                reference: '77/INV/IX/2026',
                description: 'Sales Invoice #77/INV/IX/2026',
            }),
        }));
    });

    it.each([
        ['status', invoice({ status: 'CANCELLED' }), /Status/],
        ['amount', invoice({ totalAmount: new Prisma.Decimal(1) }), /Total/],
        ['adjustment', invoice({ priceAdjustments: [{ id: 'adjustment' }] }), /koreksi turunan/],
        ['unbalanced journal', invoice(), /tidak seimbang/, journal({ lines: [{ debit: 10, credit: 0 }] })],
    ])('fails closed when %s changed', async (_label, invoiceRow, error, journalRow = journal()) => {
        const { tx, db } = fixture(invoiceRow, journalRow);
        await expect(correctSalesInvoiceDate(db, input())).rejects.toThrow(error as RegExp);
        expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('requires renumbering when the target month differs', async () => {
        const { tx, db } = fixture();
        await expect(correctSalesInvoiceDate(db, input({
            newDate: '2026-09-30',
        }))).rejects.toThrow(/renumber/);
        expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op on a safe retry after the document is already corrected', async () => {
        const correctedInvoice = invoice({ invoiceDate: WIB_OCT_6, dueDate: WIB_OCT_7 });
        const correctedJournal = journal({ entryDate: WIB_OCT_6 });
        const { tx, db } = fixture(correctedInvoice, correctedJournal);
        const result = await correctSalesInvoiceDate(db, input({ execute: true }));
        expect(result.changed).toBe(false);
        expect(tx.invoice.updateMany).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
});
