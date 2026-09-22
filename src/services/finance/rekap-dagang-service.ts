import { prisma } from '@/lib/core/prisma';
import { getWibDayBounds } from '@/lib/utils/timezone';

export interface RecapRow {
    id: string;
    name: string;
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    closingBalance: number;
}

export interface RecapTotals {
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    closingBalance: number;
}

export interface RecapResult {
    period: { from: string; to: string };
    rows: RecapRow[];
    totals: RecapTotals;
}

type Bucket = Map<
    string,
    { name: string; opening: number; inPeriod: number; outPeriod: number }
>;

function emptyBucket(): {
    name: string;
    opening: number;
    inPeriod: number;
    outPeriod: number;
} {
    return { name: '', opening: 0, inPeriod: 0, outPeriod: 0 };
}

function sumAll(bucket: Bucket): RecapTotals {
    const totals: RecapTotals = {
        openingBalance: 0,
        totalIn: 0,
        totalOut: 0,
        closingBalance: 0,
    };
    for (const entry of bucket.values()) {
        totals.openingBalance += entry.opening;
        totals.totalIn += entry.inPeriod;
        totals.totalOut += entry.outPeriod;
    }
    totals.closingBalance =
        totals.openingBalance + totals.totalIn - totals.totalOut;
    return totals;
}

function toRows(bucket: Bucket, fallbackName: string): RecapRow[] {
    return Array.from(bucket.entries())
        .map(([id, entry]) => ({
            id,
            name: entry.name || fallbackName,
            openingBalance: entry.opening,
            totalIn: entry.inPeriod,
            totalOut: entry.outPeriod,
            closingBalance: entry.opening + entry.inPeriod - entry.outPeriod,
        }))
        .sort((a, b) => b.closingBalance - a.closingBalance);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export class RekapDagangService {
    /**
     * Rekap Hutang Dagang per supplier:
     * mutasi masuk = purchase invoice, mutasi keluar = pembayaran supplier.
     */
    static async getHutangRecap(params: {
        from: string;
        to: string;
    }): Promise<RecapResult> {
        const { from, to } = params;
        const periodStart = getWibDayBounds(from).startOfDay;
        const periodEnd = getWibDayBounds(to).endOfDay;

        const [invoices, payments] = await Promise.all([
            prisma.purchaseInvoice.findMany({
                where: {
                    status: { notIn: ['CANCELLED', 'DRAFT'] },
                    invoiceDate: { lte: periodEnd },
                },
                select: {
                    totalAmount: true,
                    invoiceDate: true,
                    purchaseOrder: {
                        select: {
                            supplier: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.payment.findMany({
                where: { purchaseInvoiceId: { not: null }, paymentDate: { lte: periodEnd } },
                select: {
                    amount: true,
                    paymentDate: true,
                    purchaseInvoice: {
                        select: {
                            purchaseOrder: {
                                select: {
                                    supplier: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        const bucket: Bucket = new Map();
        const ensure = (
            id: string,
            name: string,
        ): { name: string; opening: number; inPeriod: number; outPeriod: number } => {
            let entry = bucket.get(id);
            if (!entry) {
                entry = emptyBucket();
                entry.name = name;
                bucket.set(id, entry);
            } else if (!entry.name && name) {
                entry.name = name;
            }
            return entry;
        };

        for (const inv of invoices) {
            const supplier = inv.purchaseOrder?.supplier;
            if (!supplier) continue;
            const entry = ensure(supplier.id, supplier.name);
            const amount = inv.totalAmount.toNumber();
            if (inv.invoiceDate < periodStart) entry.opening += amount;
            else entry.inPeriod += amount;
        }

        for (const payment of payments) {
            const supplier =
                payment.purchaseInvoice?.purchaseOrder?.supplier;
            if (!supplier) continue;
            const entry = ensure(supplier.id, supplier.name);
            const amount = payment.amount.toNumber();
            if (payment.paymentDate < periodStart) entry.opening -= amount;
            else entry.outPeriod += amount;
        }

        for (const entry of bucket.values()) {
            entry.opening = round2(entry.opening);
            entry.inPeriod = round2(entry.inPeriod);
            entry.outPeriod = round2(entry.outPeriod);
        }

        return {
            period: { from, to },
            rows: toRows(bucket, 'Tanpa Supplier'),
            totals: sumAll(bucket),
        };
    }

    /**
     * Rekap Piutang Dagang per customer:
     * mutasi masuk = sales invoice, mutasi keluar = penerimaan pembayaran.
     */
    static async getPiutangRecap(params: {
        from: string;
        to: string;
    }): Promise<RecapResult> {
        const { from, to } = params;
        const periodStart = getWibDayBounds(from).startOfDay;
        const periodEnd = getWibDayBounds(to).endOfDay;

        const [invoices, payments, priceAdjustments, returnCredits, customerCredits] = await Promise.all([
            prisma.invoice.findMany({
                where: {
                    status: { notIn: ['CANCELLED', 'DRAFT'] },
                    invoiceDate: { lte: periodEnd },
                },
                select: {
                    totalAmount: true,
                    invoiceDate: true,
                    salesOrder: {
                        select: {
                            customer: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.payment.findMany({
                where: { invoiceId: { not: null }, paymentDate: { lte: periodEnd } },
                select: {
                    amount: true,
                    paymentDate: true,
                    invoice: {
                        select: {
                            salesOrder: {
                                select: {
                                    customer: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.invoicePriceAdjustment.findMany({ where: { postingDate: { lte: periodEnd } }, select: { totalAmount: true, postingDate: true, reversedAt: true, invoice: { select: { salesOrder: { select: { customer: { select: { id: true, name: true } } } } } } } }),
            prisma.salesReturnCreditAllocation.findMany({
                where: { credit: { status: { in: ['POSTED', 'REVERSED'] }, postedAt: { lte: periodEnd } } },
                select: { totalAmount: true, credit: { select: { postedAt: true, reversedAt: true } }, invoice: { select: { salesOrder: { select: { customer: { select: { id: true, name: true } } } } } } },
            }),
            prisma.customerCreditApplication.findMany({ where: { postingDate: { lte: periodEnd } }, select: { totalAmount: true, postingDate: true, reversedAt: true, invoice: { select: { salesOrder: { select: { customer: { select: { id: true, name: true } } } } } } } }),
        ]);

        const bucket: Bucket = new Map();
        const ensure = (
            id: string,
            name: string,
        ): { name: string; opening: number; inPeriod: number; outPeriod: number } => {
            let entry = bucket.get(id);
            if (!entry) {
                entry = emptyBucket();
                entry.name = name;
                bucket.set(id, entry);
            } else if (!entry.name && name) {
                entry.name = name;
            }
            return entry;
        };

        for (const inv of invoices) {
            const customer = inv.salesOrder?.customer;
            const id = customer?.id ?? 'no-customer';
            const entry = ensure(id, customer?.name ?? '');
            const amount = inv.totalAmount.toNumber();
            if (inv.invoiceDate < periodStart) entry.opening += amount;
            else entry.inPeriod += amount;
        }

        for (const adjustment of priceAdjustments) {
            const customer = adjustment.invoice.salesOrder.customer;
            const entry = ensure(customer?.id ?? 'no-customer', customer?.name ?? '');
            const amount = Number(adjustment.totalAmount);
            if (adjustment.postingDate < periodStart) entry.opening += amount;
            else if (amount >= 0) entry.inPeriod += amount;
            else entry.outPeriod -= amount;
            if (adjustment.reversedAt && adjustment.reversedAt <= periodEnd) {
                if (adjustment.reversedAt < periodStart) entry.opening -= amount;
                else if (amount >= 0) entry.outPeriod += amount;
                else entry.inPeriod -= amount;
            }
        }
        // Issuing a customer credit creates a liability, not AR. Only applications reduce target AR.
        for (const application of customerCredits) {
            const customer = application.invoice.salesOrder.customer;
            const entry = ensure(customer?.id ?? 'no-customer', customer?.name ?? '');
            if (application.postingDate < periodStart) entry.opening -= Number(application.totalAmount);
            else entry.outPeriod += Number(application.totalAmount);
            if (application.reversedAt && application.reversedAt <= periodEnd) {
                if (application.reversedAt < periodStart) entry.opening += Number(application.totalAmount);
                else entry.inPeriod += Number(application.totalAmount);
            }
        }
        for (const credit of returnCredits) {
            const customer = credit.invoice.salesOrder.customer;
            const entry = ensure(customer?.id ?? 'no-customer', customer?.name ?? '');
            if (credit.credit.postedAt! < periodStart) entry.opening -= Number(credit.totalAmount);
            else entry.outPeriod += Number(credit.totalAmount);
            if (credit.credit.reversedAt && credit.credit.reversedAt <= periodEnd) {
                if (credit.credit.reversedAt < periodStart) entry.opening += Number(credit.totalAmount);
                else entry.inPeriod += Number(credit.totalAmount);
            }
        }

        for (const payment of payments) {
            const customer = payment.invoice?.salesOrder?.customer;
            const id = customer?.id ?? 'no-customer';
            const entry = ensure(id, customer?.name ?? '');
            const amount = payment.amount.toNumber();
            if (payment.paymentDate < periodStart) entry.opening -= amount;
            else entry.outPeriod += amount;
        }

        for (const entry of bucket.values()) {
            entry.opening = round2(entry.opening);
            entry.inPeriod = round2(entry.inPeriod);
            entry.outPeriod = round2(entry.outPeriod);
        }

        return {
            period: { from, to },
            rows: toRows(bucket, 'Tanpa Customer'),
            totals: sumAll(bucket),
        };
    }

    /**
     * Rekap Piutang Karyawan (kasbon) per karyawan:
     * mutasi masuk = pinjaman baru, mutasi keluar = angsuran/potongan.
     */
    static async getPiutangKaryawanRecap(params: {
        from: string;
        to: string;
    }): Promise<RecapResult> {
        const { from, to } = params;
        const periodStart = getWibDayBounds(from).startOfDay;
        const periodEnd = getWibDayBounds(to).endOfDay;

        const [loans, loanPayments] = await Promise.all([
            prisma.employeeLoan.findMany({
                where: { date: { lte: periodEnd } },
                select: {
                    principalAmount: true,
                    date: true,
                    employee: { select: { id: true, name: true } },
                },
            }),
            prisma.employeeLoanPayment.findMany({
                where: { date: { lte: periodEnd } },
                select: {
                    amount: true,
                    date: true,
                    loan: {
                        select: {
                            employee: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
        ]);

        const bucket: Bucket = new Map();
        const ensure = (
            id: string,
            name: string,
        ): { name: string; opening: number; inPeriod: number; outPeriod: number } => {
            let entry = bucket.get(id);
            if (!entry) {
                entry = emptyBucket();
                entry.name = name;
                bucket.set(id, entry);
            } else if (!entry.name && name) {
                entry.name = name;
            }
            return entry;
        };

        for (const loan of loans) {
            const entry = ensure(loan.employee.id, loan.employee.name);
            const amount = loan.principalAmount.toNumber();
            if (loan.date < periodStart) entry.opening += amount;
            else entry.inPeriod += amount;
        }

        for (const payment of loanPayments) {
            const entry = ensure(payment.loan.employee.id, payment.loan.employee.name);
            const amount = payment.amount.toNumber();
            if (payment.date < periodStart) entry.opening -= amount;
            else entry.outPeriod += amount;
        }

        for (const entry of bucket.values()) {
            entry.opening = round2(entry.opening);
            entry.inPeriod = round2(entry.inPeriod);
            entry.outPeriod = round2(entry.outPeriod);
        }

        return {
            period: { from, to },
            rows: toRows(bucket, 'Tanpa Karyawan'),
            totals: sumAll(bucket),
        };
    }
}
