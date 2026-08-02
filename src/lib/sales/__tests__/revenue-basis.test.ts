import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
    calculateSalesOrderRevenue,
    calculateIssuedInvoiceRevenue,
    calculatePaidInvoiceRevenue,
    calculateReturnDeduction,
    calculateSalesOrderRevenueWithReturns,
    calculateIssuedInvoiceRevenueWithReturns,
    calculatePaidInvoiceRevenueWithReturns,
    calculateRevenueByBasis,
    isCountedSalesOrderStatus,
    isIssuedInvoiceStatus,
    isProcessedReturnStatus,
    decimal,
    UNATTRIBUTED_SALES_KEY,
} from '../revenue-basis';

// ── Helpers ────────────────────────────────────────────────────────

const SALES_A = 'user-sales-A';
const SALES_B = 'user-sales-B';

function dEq(a: Decimal, b: string | number | Decimal): void {
    const exp = b instanceof Decimal ? b : new Decimal(b.toString());
    expect(a.equals(exp)).toBe(true);
}

function getAttr(map: Map<string, Decimal>, key: string): Decimal {
    const v = map.get(key);
    expect(v).toBeDefined();
    return v!;
}

// ── Status helpers ─────────────────────────────────────────────────

describe('status helpers', () => {
    it('isCountedSalesOrderStatus: CANCELLED excluded', () => {
        expect(isCountedSalesOrderStatus('CANCELLED')).toBe(false);
    });
    it('isCountedSalesOrderStatus: DRAFT/ CONFIRMED counted', () => {
        expect(isCountedSalesOrderStatus('DRAFT')).toBe(true);
        expect(isCountedSalesOrderStatus('CONFIRMED')).toBe(true);
        expect(isCountedSalesOrderStatus('DELIVERED')).toBe(true);
    });
    it('isIssuedInvoiceStatus: DRAFT & CANCELLED excluded', () => {
        expect(isIssuedInvoiceStatus('DRAFT')).toBe(false);
        expect(isIssuedInvoiceStatus('CANCELLED')).toBe(false);
    });
    it('isIssuedInvoiceStatus: UNPAID/PAID/PARTIAL/OVERDUE counted', () => {
        expect(isIssuedInvoiceStatus('UNPAID')).toBe(true);
        expect(isIssuedInvoiceStatus('PAID')).toBe(true);
        expect(isIssuedInvoiceStatus('PARTIAL')).toBe(true);
        expect(isIssuedInvoiceStatus('OVERDUE')).toBe(true);
    });
    it('isProcessedReturnStatus: DRAFT/CANCELLED excluded', () => {
        expect(isProcessedReturnStatus('DRAFT')).toBe(false);
        expect(isProcessedReturnStatus('CANCELLED')).toBe(false);
    });
    it('isProcessedReturnStatus: CONFIRMED/RECEIVED/COMPLETED counted', () => {
        expect(isProcessedReturnStatus('CONFIRMED')).toBe(true);
        expect(isProcessedReturnStatus('RECEIVED')).toBe(true);
        expect(isProcessedReturnStatus('COMPLETED')).toBe(true);
    });
    it('exports UNATTRIBUTED_SALES_KEY constant', () => {
        expect(UNATTRIBUTED_SALES_KEY).toBe('__unattributed__');
    });
});

describe('calculateSalesOrderRevenue', () => {
    it('sums per salesRepId', () => {
        const res = calculateSalesOrderRevenue([
            { id: 'so1', salesRepId: SALES_A, totalAmount: decimal('100000'), status: 'CONFIRMED' },
            { id: 'so2', salesRepId: SALES_A, totalAmount: decimal('200000'), status: 'DELIVERED' },
            { id: 'so3', salesRepId: SALES_B, totalAmount: decimal('50000'), status: 'CONFIRMED' },
        ]);
        expect(res.attributed.size).toBe(2);
        dEq(getAttr(res.attributed, SALES_A), '300000');
        dEq(getAttr(res.attributed, SALES_B), '50000');
        dEq(res.unattributed, 0);
    });

    it('excludes CANCELLED', () => {
        const res = calculateSalesOrderRevenue([
            { id: 'so1', salesRepId: SALES_A, totalAmount: decimal('100000'), status: 'CONFIRMED' },
            { id: 'so2', salesRepId: SALES_A, totalAmount: decimal('999999'), status: 'CANCELLED' },
        ]);
        dEq(getAttr(res.attributed, SALES_A), '100000');
    });

    it('SO without salesRepId goes to unattributed, not lost', () => {
        const res = calculateSalesOrderRevenue([
            { id: 'so1', salesRepId: null, totalAmount: decimal('12345'), status: 'CONFIRMED' },
            { id: 'so2', salesRepId: SALES_A, totalAmount: decimal('10000'), status: 'CONFIRMED' },
        ]);
        expect(res.attributed.has(SALES_A)).toBe(true);
        // unattributed must not be discarded
        dEq(res.unattributed, '12345');
        // should NOT create key '' or '__unattributed__' in attributed map
        expect(res.attributed.has('')).toBe(false);
        expect(res.attributed.has('__unattributed__')).toBe(false);
    });

    it('accepts number totalAmount and converts via string', () => {
        const res = calculateSalesOrderRevenue([
            { id: 'so1', salesRepId: SALES_A, totalAmount: 10000 as unknown as Decimal, status: 'CONFIRMED' },
        ]);
        dEq(getAttr(res.attributed, SALES_A), '10000');
    });

    it('ignores null/zero amount', () => {
        const res = calculateSalesOrderRevenue([
            { id: 'so1', salesRepId: SALES_A, totalAmount: null, status: 'CONFIRMED' },
            { id: 'so2', salesRepId: SALES_A, totalAmount: decimal(0), status: 'CONFIRMED' },
        ]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, 0);
    });
});

describe('calculateIssuedInvoiceRevenue', () => {
    it('sums only issued statuses', () => {
        const res = calculateIssuedInvoiceRevenue([
            { id: 'inv1', salesRepId: SALES_A, totalAmount: decimal('100000'), invoiceStatus: 'UNPAID' },
            { id: 'inv2', salesRepId: SALES_A, totalAmount: decimal('50000'), invoiceStatus: 'DRAFT' },
            { id: 'inv3', salesRepId: SALES_A, totalAmount: decimal('77777'), invoiceStatus: 'CANCELLED' },
            { id: 'inv4', salesRepId: SALES_B, totalAmount: decimal('20000'), invoiceStatus: 'PAID' },
        ]);
        expect(res.attributed.size).toBe(2);
        dEq(getAttr(res.attributed, SALES_A), '100000');
        dEq(getAttr(res.attributed, SALES_B), '20000');
    });

    it('null salesRepId -> unattributed', () => {
        const res = calculateIssuedInvoiceRevenue([
            { id: 'inv1', salesRepId: null, totalAmount: decimal('5000'), invoiceStatus: 'UNPAID' },
        ]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, '5000');
    });
});

describe('calculatePaidInvoiceRevenue', () => {
    it('sums paidAmount only, not totalAmount', () => {
        const res = calculatePaidInvoiceRevenue([
            {
                id: 'inv1',
                salesRepId: SALES_A,
                paidAmount: decimal('70000'),
                invoiceStatus: 'PARTIAL',
            },
            {
                id: 'inv2',
                salesRepId: SALES_A,
                paidAmount: decimal('0'),
                invoiceStatus: 'UNPAID',
            },
            {
                id: 'inv3',
                salesRepId: SALES_B,
                paidAmount: decimal('100000'),
                invoiceStatus: 'PAID',
            },
        ]);
        dEq(getAttr(res.attributed, SALES_A), '70000');
        dEq(getAttr(res.attributed, SALES_B), '100000');
        expect(res.attributed.size).toBe(2);
    });

    it('excludes DRAFT invoices even if paidAmount non-zero', () => {
        const res = calculatePaidInvoiceRevenue([
            { id: 'inv1', salesRepId: SALES_A, paidAmount: decimal('50000'), invoiceStatus: 'DRAFT' },
        ]);
        expect(res.attributed.size).toBe(0);
    });

    it('null salesRepId paid goes to unattributed', () => {
        const res = calculatePaidInvoiceRevenue([
            { id: 'inv1', salesRepId: null, paidAmount: decimal('9000'), invoiceStatus: 'PAID' },
        ]);
        dEq(res.unattributed, '9000');
        expect(res.attributed.size).toBe(0);
    });

    it('null paidAmount is zero and ignored', () => {
        const res = calculatePaidInvoiceRevenue([
            { id: 'inv1', salesRepId: SALES_A, paidAmount: null, invoiceStatus: 'UNPAID' },
        ]);
        expect(res.attributed.size).toBe(0);
    });
});

describe('calculateReturnDeduction', () => {
    it('returns negative amounts', () => {
        const res = calculateReturnDeduction([
            { id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('20000'), status: 'COMPLETED' },
        ]);
        const v = getAttr(res.attributed, SALES_A);
        // negative
        expect(v.isNegative()).toBe(true);
        dEq(v, '-20000');
    });

    it('excludes DRAFT/CANCELLED returns', () => {
        const res = calculateReturnDeduction([
            { id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('20000'), status: 'DRAFT' },
            { id: 'ret2', salesRepId: SALES_A, totalAmount: decimal('30000'), status: 'CANCELLED' },
        ]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, 0);
    });

    it('null salesRepId return -> unattributed deduction', () => {
        const res = calculateReturnDeduction([
            { id: 'ret1', salesRepId: null, totalAmount: decimal('1000'), status: 'COMPLETED' },
        ]);
        dEq(res.unattributed, '-1000');
        expect(res.attributed.size).toBe(0);
    });

    it('CONFIRMED return still deducted (Q5: processed = not draft/cancelled)', () => {
        const res = calculateReturnDeduction([
            { id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('500'), status: 'CONFIRMED' },
        ]);
        dEq(getAttr(res.attributed, SALES_A), '-500');
    });
});

describe('revenue with returns — retur di periode retur (Q5)', () => {
    it('SALES_ORDER: retur mengurangi omzet periode retur, bukan SO asli', () => {
        // SO dibuat Juli, retur terjadi Agustus — panggilan terpisah per periode
        // Periode Juli: hanya SO, tanpa retur
        const july = calculateSalesOrderRevenueWithReturns(
            [{ id: 'so-july', salesRepId: SALES_A, totalAmount: decimal('100000'), status: 'DELIVERED' }],
            [],
        );
        dEq(getAttr(july.attributed, SALES_A), '100000');

        // Periode Agustus: tanpa SO, tapi ada retur (untuk SO Juli) — mengurangi Agustus
        const august = calculateSalesOrderRevenueWithReturns(
            [],
            [{ id: 'ret-aug', salesRepId: SALES_A, totalAmount: decimal('20000'), status: 'COMPLETED' }],
        );
        const v = getAttr(august.attributed, SALES_A);
        expect(v.isNegative()).toBe(true);
        dEq(v, '-20000');

        // Kombinasi dalam satu periode: SO + retur di bulan yang sama
        const sameMonth = calculateSalesOrderRevenueWithReturns(
            [{ id: 'so-aug', salesRepId: SALES_A, totalAmount: decimal('100000'), status: 'DELIVERED' }],
            [{ id: 'ret-aug', salesRepId: SALES_A, totalAmount: decimal('20000'), status: 'COMPLETED' }],
        );
        dEq(getAttr(sameMonth.attributed, SALES_A), '80000');
    });

    it('ISSUED_INVOICE: retur mengurangi periode retur', () => {
        const res = calculateIssuedInvoiceRevenueWithReturns(
            [{ id: 'inv1', salesRepId: SALES_A, totalAmount: decimal('50000'), invoiceStatus: 'UNPAID' }],
            [{ id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('10000'), status: 'RECEIVED' }],
        );
        dEq(getAttr(res.attributed, SALES_A), '40000');
    });

    it('PAID_INVOICE: retur mengurangi periode retur (dari paid)', () => {
        const res = calculatePaidInvoiceRevenueWithReturns(
            [{ id: 'inv1', salesRepId: SALES_A, paidAmount: decimal('50000'), invoiceStatus: 'PAID' }],
            [{ id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('5000'), status: 'COMPLETED' }],
        );
        dEq(getAttr(res.attributed, SALES_A), '45000');
    });

    it('unattributed retur mengurangi unattributed', () => {
        const res = calculateSalesOrderRevenueWithReturns(
            [{ id: 'so', salesRepId: null, totalAmount: decimal('10000'), status: 'CONFIRMED' }],
            [{ id: 'ret', salesRepId: null, totalAmount: decimal('3000'), status: 'COMPLETED' }],
        );
        dEq(res.unattributed, '7000');
    });

    it('attributed + unattributed return merged correctly', () => {
        const res = calculateSalesOrderRevenueWithReturns(
            [
                { id: 'so1', salesRepId: SALES_A, totalAmount: decimal('10000'), status: 'CONFIRMED' },
                { id: 'so2', salesRepId: null, totalAmount: decimal('5000'), status: 'CONFIRMED' },
            ],
            [
                { id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('1000'), status: 'COMPLETED' },
                { id: 'ret2', salesRepId: null, totalAmount: decimal('500'), status: 'COMPLETED' },
            ],
        );
        dEq(getAttr(res.attributed, SALES_A), '9000');
        dEq(res.unattributed, '4500');
    });
});

describe('Decimal precision — no floating point error', () => {
    it('0.1 + 0.2 !== 0.30000000000000004', () => {
        const res = calculateSalesOrderRevenue([
            { id: '1', salesRepId: SALES_A, totalAmount: decimal('0.1'), status: 'CONFIRMED' },
            { id: '2', salesRepId: SALES_A, totalAmount: decimal('0.2'), status: 'CONFIRMED' },
        ]);
        const v = getAttr(res.attributed, SALES_A);
        // Must be exactly 0.3, not floating noise
        expect(v.toString()).toBe('0.3');
        expect(v.equals(new Decimal('0.3'))).toBe(true);
    });

    it('large IDR values preserve precision', () => {
        const res = calculateSalesOrderRevenue([
            { id: '1', salesRepId: SALES_A, totalAmount: decimal('1234567890123.45'), status: 'CONFIRMED' },
            { id: '2', salesRepId: SALES_A, totalAmount: decimal('0.55'), status: 'CONFIRMED' },
        ]);
        dEq(getAttr(res.attributed, SALES_A), '1234567890124');
    });

    it('paid + returns keep Decimal precision', () => {
        const res = calculatePaidInvoiceRevenueWithReturns(
            [
                { id: 'inv1', salesRepId: SALES_A, paidAmount: decimal('100.10'), invoiceStatus: 'PAID' },
                { id: 'inv2', salesRepId: SALES_A, paidAmount: decimal('200.20'), invoiceStatus: 'PAID' },
            ],
            [{ id: 'ret1', salesRepId: SALES_A, totalAmount: decimal('0.30'), status: 'COMPLETED' }],
        );
        const v = getAttr(res.attributed, SALES_A);
        expect(v.toString()).toBe('300');
        expect(v.equals(new Decimal('300'))).toBe(true);
    });
});

describe('calculateRevenueByBasis dispatcher', () => {
    it('dispatches SALES_ORDER', () => {
        const res = calculateRevenueByBasis('SALES_ORDER', {
            orders: [{ id: 'so1', salesRepId: SALES_A, totalAmount: decimal('100'), status: 'CONFIRMED' }],
            returns: [],
        });
        dEq(getAttr(res.attributed, SALES_A), '100');
    });

    it('dispatches ISSUED_INVOICE', () => {
        const res = calculateRevenueByBasis('ISSUED_INVOICE', {
            invoices: [
                { id: 'inv1', salesRepId: SALES_A, totalAmount: decimal('100'), invoiceStatus: 'UNPAID' },
            ],
            returns: [],
        });
        dEq(getAttr(res.attributed, SALES_A), '100');
    });

    it('dispatches PAID_INVOICE', () => {
        const res = calculateRevenueByBasis('PAID_INVOICE', {
            invoices: [
                { id: 'inv1', salesRepId: SALES_A, paidAmount: decimal('75'), invoiceStatus: 'PAID' },
            ],
            returns: [],
        });
        dEq(getAttr(res.attributed, SALES_A), '75');
    });

    it('throws on unknown basis', () => {
        expect(() =>
            calculateRevenueByBasis('UNKNOWN' as never, { orders: [], returns: [] } as never),
        ).toThrow();
    });
});

describe('edge: empty input', () => {
    it('empty orders -> empty result', () => {
        const res = calculateSalesOrderRevenue([]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, 0);
    });

    it('empty invoices -> empty result', () => {
        const res = calculateIssuedInvoiceRevenue([]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, 0);
    });

    it('empty returns -> zero deduction', () => {
        const res = calculateReturnDeduction([]);
        expect(res.attributed.size).toBe(0);
        dEq(res.unattributed, 0);
    });
});
