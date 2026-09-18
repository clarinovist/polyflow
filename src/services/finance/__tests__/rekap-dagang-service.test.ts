/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RekapDagangService } from '../rekap-dagang-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseInvoice: { findMany: vi.fn() },
        invoice: { findMany: vi.fn() },
        payment: { findMany: vi.fn() },
        salesReturnCreditAllocation: { findMany: vi.fn().mockResolvedValue([]) },
        employeeLoan: { findMany: vi.fn() },
        employeeLoanPayment: { findMany: vi.fn() },
    },
}));

const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

const FROM = '2026-08-01';
const TO = '2026-08-31';

// WIB bounds: from → 2026-07-31T17:00:00.000Z, to → 2026-08-31T16:59:59.999Z
const BEFORE_PERIOD = new Date('2026-07-15T00:00:00.000Z');
const IN_PERIOD = new Date('2026-08-10T00:00:00.000Z');

describe('RekapDagangService.getHutangRecap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('computes opening, mutasi masuk, mutasi keluar per supplier', async () => {
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            {
                totalAmount: dec(1_000_000),
                invoiceDate: BEFORE_PERIOD,
                purchaseOrder: {
                    supplier: { id: 'sup-1', name: 'Supplier A' },
                },
            },
            {
                totalAmount: dec(500_000),
                invoiceDate: IN_PERIOD,
                purchaseOrder: {
                    supplier: { id: 'sup-1', name: 'Supplier A' },
                },
            },
            {
                totalAmount: dec(200_000),
                invoiceDate: IN_PERIOD,
                purchaseOrder: {
                    supplier: { id: 'sup-2', name: 'Supplier B' },
                },
            },
            // cancelled/draft are excluded by the where clause, but guard anyway
            {
                totalAmount: dec(999),
                invoiceDate: IN_PERIOD,
                purchaseOrder: { supplier: null },
            },
        ]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([
            {
                amount: dec(400_000),
                paymentDate: BEFORE_PERIOD,
                purchaseInvoice: {
                    purchaseOrder: {
                        supplier: { id: 'sup-1', name: 'Supplier A' },
                    },
                },
            },
            {
                amount: dec(300_000),
                paymentDate: IN_PERIOD,
                purchaseInvoice: {
                    purchaseOrder: {
                        supplier: { id: 'sup-1', name: 'Supplier A' },
                    },
                },
            },
        ]);

        const result = await RekapDagangService.getHutangRecap({
            from: FROM,
            to: TO,
        });

        expect(result.period).toEqual({ from: FROM, to: TO });

        const supA = result.rows.find((r) => r.id === 'sup-1');
        expect(supA).toEqual({
            id: 'sup-1',
            name: 'Supplier A',
            openingBalance: 600_000, // 1jt invoice - 400rb pembayaran lama
            totalIn: 500_000,
            totalOut: 300_000,
            closingBalance: 800_000,
        });

        expect(result.totals).toEqual({
            openingBalance: 600_000,
            totalIn: 700_000,
            totalOut: 300_000,
            closingBalance: 1_000_000,
        });
    });

    it('filters invoices/payments up to end of WIB day of `to` and excludes CANCELLED/DRAFT', async () => {
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([]);

        await RekapDagangService.getHutangRecap({ from: FROM, to: TO });

        const invoiceArgs = vi.mocked(prisma.purchaseInvoice.findMany).mock
            .calls[0][0];
        expect(invoiceArgs.where.status).toEqual({
            notIn: ['CANCELLED', 'DRAFT'],
        });
        expect(invoiceArgs.where.invoiceDate.lte.toISOString()).toBe(
            '2026-08-31T16:59:59.999Z',
        );

        const paymentArgs = vi.mocked(prisma.payment.findMany).mock.calls[0][0];
        expect(paymentArgs.where.purchaseInvoiceId).toEqual({ not: null });
        expect(paymentArgs.where.paymentDate.lte.toISOString()).toBe(
            '2026-08-31T16:59:59.999Z',
        );
    });

    it('returns empty rows and zero totals when there is no data', async () => {
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([]);

        const result = await RekapDagangService.getHutangRecap({
            from: FROM,
            to: TO,
        });

        expect(result.rows).toEqual([]);
        expect(result.totals).toEqual({
            openingBalance: 0,
            totalIn: 0,
            totalOut: 0,
            closingBalance: 0,
        });
    });
});

describe('RekapDagangService.getPiutangRecap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('groups per customer and buckets invoices without customer as Tanpa Customer', async () => {
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([
            {
                totalAmount: dec(2_000_000),
                invoiceDate: BEFORE_PERIOD,
                salesOrder: {
                    customer: { id: 'cus-1', name: 'Customer A' },
                },
            },
            {
                totalAmount: dec(750_000),
                invoiceDate: IN_PERIOD,
                salesOrder: {
                    customer: { id: 'cus-1', name: 'Customer A' },
                },
            },
            {
                // legacy internal stock build — no customer
                totalAmount: dec(100_000),
                invoiceDate: IN_PERIOD,
                salesOrder: { customer: null },
            },
        ]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([
            {
                amount: dec(1_500_000),
                paymentDate: IN_PERIOD,
                invoice: {
                    salesOrder: { customer: { id: 'cus-1', name: 'Customer A' } },
                },
            },
        ]);

        const result = await RekapDagangService.getPiutangRecap({
            from: FROM,
            to: TO,
        });

        const cusA = result.rows.find((r) => r.id === 'cus-1');
        expect(cusA).toEqual({
            id: 'cus-1',
            name: 'Customer A',
            openingBalance: 2_000_000,
            totalIn: 750_000,
            totalOut: 1_500_000,
            closingBalance: 1_250_000,
        });

        const noCus = result.rows.find((r) => r.id === 'no-customer');
        expect(noCus).toEqual({
            id: 'no-customer',
            name: 'Tanpa Customer',
            openingBalance: 0,
            totalIn: 100_000,
            totalOut: 0,
            closingBalance: 100_000,
        });

        expect(result.rows[0].id).toBe('cus-1'); // sorted by closing balance desc
    });

    it('subtracts return credits by posting date, not return creation or current balance', async () => {
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ totalAmount: dec(1000), invoiceDate: BEFORE_PERIOD, salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } }]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
        vi.mocked(prisma.salesReturnCreditAllocation.findMany).mockResolvedValueOnce([
            { totalAmount: dec(100), credit: { postedAt: BEFORE_PERIOD }, invoice: { salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } } },
            { totalAmount: dec(200), credit: { postedAt: IN_PERIOD }, invoice: { salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } } },
        ]);
        const result = await RekapDagangService.getPiutangRecap({ from: FROM, to: TO });
        expect(result.totals).toEqual({ openingBalance: 900, totalIn: 0, totalOut: 200, closingBalance: 700 });
        expect(prisma.salesReturnCreditAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { credit: { status: { in: ['POSTED', 'REVERSED'] }, postedAt: { lte: new Date('2026-08-31T16:59:59.999Z') } } } }));
    });

    it('retains original posting and applies compensation only at the reversal effective date', async () => {
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ totalAmount: dec(1000), invoiceDate: BEFORE_PERIOD, salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } }]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
        vi.mocked(prisma.salesReturnCreditAllocation.findMany).mockResolvedValueOnce([
            { totalAmount: dec(100), credit: { postedAt: BEFORE_PERIOD, reversedAt: IN_PERIOD }, invoice: { salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } } },
            { totalAmount: dec(200), credit: { postedAt: IN_PERIOD, reversedAt: new Date('2026-09-10') }, invoice: { salesOrder: { customer: { id: 'cus-1', name: 'Synthetic Customer' } } } },
        ]);
        const result = await RekapDagangService.getPiutangRecap({ from: FROM, to: TO });
        expect(result.totals).toEqual({ openingBalance: 900, totalIn: 100, totalOut: 200, closingBalance: 800 });
    });

    it('filters AR payments by invoiceId not null', async () => {
        vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.payment.findMany).mockResolvedValue([]);

        await RekapDagangService.getPiutangRecap({ from: FROM, to: TO });

        const paymentArgs = vi.mocked(prisma.payment.findMany).mock.calls[0][0];
        expect(paymentArgs.where.invoiceId).toEqual({ not: null });
    });
});

describe('RekapDagangService.getPiutangKaryawanRecap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('computes opening, mutasi masuk (kasbon baru), mutasi keluar (angsuran) per karyawan', async () => {
        vi.mocked(prisma.employeeLoan.findMany).mockResolvedValue([
            {
                principalAmount: dec(1_000_000),
                date: BEFORE_PERIOD,
                employee: { id: 'emp-1', name: 'Budi' },
            },
            {
                principalAmount: dec(500_000),
                date: IN_PERIOD,
                employee: { id: 'emp-1', name: 'Budi' },
            },
        ]);
        vi.mocked(prisma.employeeLoanPayment.findMany).mockResolvedValue([
            {
                amount: dec(250_000),
                date: IN_PERIOD,
                loan: { employee: { id: 'emp-1', name: 'Budi' } },
            },
        ]);

        const result = await RekapDagangService.getPiutangKaryawanRecap({
            from: FROM,
            to: TO,
        });

        expect(result.rows).toEqual([
            {
                id: 'emp-1',
                name: 'Budi',
                openingBalance: 1_000_000,
                totalIn: 500_000,
                totalOut: 250_000,
                closingBalance: 1_250_000,
            },
        ]);
        expect(result.totals.closingBalance).toBe(1_250_000);
    });

    it('returns empty result when there is no loan data', async () => {
        vi.mocked(prisma.employeeLoan.findMany).mockResolvedValue([]);
        vi.mocked(prisma.employeeLoanPayment.findMany).mockResolvedValue([]);

        const result = await RekapDagangService.getPiutangKaryawanRecap({
            from: FROM,
            to: TO,
        });

        expect(result.rows).toEqual([]);
        expect(result.totals).toEqual({
            openingBalance: 0,
            totalIn: 0,
            totalOut: 0,
            closingBalance: 0,
        });
    });
});
