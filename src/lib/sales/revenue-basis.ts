/**
 * Sumber kebenaran tunggal definisi omzet sales untuk semua konsumen
 * (laporan performa, target, komisi, dashboard).
 *
 * Prinsip:
 * - Semua uang pakai Decimal dari @prisma/client/runtime/library
 * - SO tanpa salesRepId masuk bucket unattributed, JANGAN dibuang diam-diam
 * - Retur mengurangi omzet DI PERIODE RETUR TERJADI (Q5), bukan periode SO asli
 * - SALES_ORDER: status !== CANCELLED
 * - ISSUED_INVOICE: invoice.status !== DRAFT && !== CANCELLED
 * - PAID_INVOICE: porsi terbayar (paidAmount) dari invoice terhubung SO sales
 *
 * File ini murni — tidak menyentuh DB. Input data sudah difilter caller.
 */

import { Decimal } from '@prisma/client/runtime/library';

// ── Types ──────────────────────────────────────────────────────────

export type RevenueBasis = 'SALES_ORDER' | 'ISSUED_INVOICE' | 'PAID_INVOICE';

/** Satu baris SO terhitung untuk revenue. Caller sudah filter periode + status. */
export type SalesOrderRevenueRow = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    orderDate: Date;
};

export type IssuedInvoiceRevenueRow = {
    id: string;
    salesRepId: string | null; // resolved via SalesOrder.salesRepId
    totalAmount: Decimal | number | null;
    invoiceDate: Date;
    invoiceStatus: string;
};

export type PaidInvoiceRevenueRow = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    paidAmount: Decimal | number | null;
    invoiceDate: Date;
    invoiceStatus: string;
};

/**
 * Satu return yang mengurangi omzet. Harus DI PERIODE RETUR TERJADI.
 * Status DIPROSES = CONFIRMED/RECEIVED/COMPLETED (bukan DRAFT/CANCELLED).
 */
export type SalesReturnRevenueRow = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    returnDate: Date;
    status: string;
};

export type AttributedMap = Map<string, Decimal>;
export type RevenueResult = {
    attributed: AttributedMap;
    unattributed: Decimal;
};

// ── Helpers ────────────────────────────────────────────────────────

const ZERO = new Decimal(0);

function toDecimal(value: Decimal | number | null | undefined): Decimal {
    if (value == null) return ZERO;
    if (value instanceof Decimal) return value;
    // number -> string -> Decimal untuk hindari float noise
    return new Decimal(value.toString());
}

function addToMap(
    map: AttributedMap,
    key: string | null,
    amount: Decimal,
    unattributedAcc: { value: Decimal },
): void {
    if (amount.isZero()) return;
    if (key == null) {
        unattributedAcc.value = unattributedAcc.value.add(amount);
    } else {
        const existing = map.get(key);
        map.set(key, existing ? existing.add(amount) : amount);
    }
}

// Status helpers — mirror schema enum values
const CANCELLED = 'CANCELLED';
const DRAFT = 'DRAFT';

/** SO terhitung jika status != CANCELLED */
export function isCountedSalesOrderStatus(status: string): boolean {
    return status !== CANCELLED;
}

export const ISSUED_INVOICE_EXCLUDED_STATUSES = new Set<string>([
    DRAFT,
    CANCELLED,
]);

/** Invoice terbit jika status ∉ {DRAFT, CANCELLED} */
export function isIssuedInvoiceStatus(status: string): boolean {
    return !ISSUED_INVOICE_EXCLUDED_STATUSES.has(status);
}

/** Return terproses (bukan draft/cancelled) yang mengurangi omzet */
export function isProcessedReturnStatus(status: string): boolean {
    return status !== DRAFT && status !== CANCELLED;
}

// ── Core aggregation ───────────────────────────────────────────────

type SoInput = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    status: string;
};

export function calculateSalesOrderRevenue(orders: SoInput[]): RevenueResult {
    const attributed: AttributedMap = new Map();
    const unattributedAcc = { value: ZERO };

    for (const o of orders) {
        if (!isCountedSalesOrderStatus(o.status)) continue;
        const amt = toDecimal(o.totalAmount);
        if (amt.isZero()) continue;
        addToMap(attributed, o.salesRepId, amt, unattributedAcc);
    }

    return { attributed, unattributed: unattributedAcc.value };
}

type IssuedInput = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    invoiceStatus: string;
};

export function calculateIssuedInvoiceRevenue(
    invoices: IssuedInput[],
): RevenueResult {
    const attributed: AttributedMap = new Map();
    const unattributedAcc = { value: ZERO };

    for (const inv of invoices) {
        if (!isIssuedInvoiceStatus(inv.invoiceStatus)) continue;
        const amt = toDecimal(inv.totalAmount);
        if (amt.isZero()) continue;
        addToMap(attributed, inv.salesRepId, amt, unattributedAcc);
    }

    return { attributed, unattributed: unattributedAcc.value };
}

type PaidInput = {
    id: string;
    salesRepId: string | null;
    paidAmount: Decimal | number | null;
    invoiceStatus: string;
};

export function calculatePaidInvoiceRevenue(
    invoices: PaidInput[],
): RevenueResult {
    const attributed: AttributedMap = new Map();
    const unattributedAcc = { value: ZERO };

    for (const inv of invoices) {
        if (!isIssuedInvoiceStatus(inv.invoiceStatus)) continue;
        const amt = toDecimal(inv.paidAmount);
        if (amt.isZero()) continue;
        addToMap(attributed, inv.salesRepId, amt, unattributedAcc);
    }

    return { attributed, unattributed: unattributedAcc.value };
}

type ReturnInput = {
    id: string;
    salesRepId: string | null;
    totalAmount: Decimal | number | null;
    status: string;
};

/**
 * Hitung pengurangan omzet karena retur.
 * Semua basis sama: retur mengurangi omzet DI PERIODE RETUR TERJADI.
 * Hasil berupa RevenueResult dengan nilai negatif (pengurang).
 */
export function calculateReturnDeduction(
    returns: ReturnInput[],
): RevenueResult {
    const attributed: AttributedMap = new Map();
    const unattributedAcc = { value: ZERO };

    for (const r of returns) {
        if (!isProcessedReturnStatus(r.status)) continue;
        const amt = toDecimal(r.totalAmount);
        if (amt.isZero()) continue;
        // Retur = pengurang => negatif
        const neg = amt.neg();
        addToMap(attributed, r.salesRepId, neg, unattributedAcc);
    }

    return { attributed, unattributed: unattributedAcc.value };
}

// ── Combined with returns ──────────────────────────────────────────

function mergeResults(
    base: RevenueResult,
    deduction: RevenueResult,
): RevenueResult {
    const out: AttributedMap = new Map(base.attributed);

    for (const [userId, decAmt] of deduction.attributed) {
        const existing = out.get(userId);
        out.set(userId, existing ? existing.add(decAmt) : decAmt);
    }

    return {
        attributed: out,
        unattributed: base.unattributed.add(deduction.unattributed),
    };
}

export function calculateSalesOrderRevenueWithReturns(
    orders: SoInput[],
    returns: ReturnInput[],
): RevenueResult {
    return mergeResults(
        calculateSalesOrderRevenue(orders),
        calculateReturnDeduction(returns),
    );
}

export function calculateIssuedInvoiceRevenueWithReturns(
    invoices: IssuedInput[],
    returns: ReturnInput[],
): RevenueResult {
    return mergeResults(
        calculateIssuedInvoiceRevenue(invoices),
        calculateReturnDeduction(returns),
    );
}

export function calculatePaidInvoiceRevenueWithReturns(
    invoices: PaidInput[],
    returns: ReturnInput[],
): RevenueResult {
    return mergeResults(
        calculatePaidInvoiceRevenue(invoices),
        calculateReturnDeduction(returns),
    );
}

// ── Generic dispatcher ─────────────────────────────────────────────

export type RevenueInputByBasis = {
    SALES_ORDER: { orders: SoInput[]; returns: ReturnInput[] };
    ISSUED_INVOICE: { invoices: IssuedInput[]; returns: ReturnInput[] };
    PAID_INVOICE: { invoices: PaidInput[]; returns: ReturnInput[] };
};

export function calculateRevenueByBasis<K extends RevenueBasis>(
    basis: K,
    input: RevenueInputByBasis[K],
): RevenueResult {
    switch (basis) {
        case 'SALES_ORDER': {
            const { orders, returns } =
                input as RevenueInputByBasis['SALES_ORDER'];
            return calculateSalesOrderRevenueWithReturns(orders, returns);
        }
        case 'ISSUED_INVOICE': {
            const { invoices, returns } =
                input as RevenueInputByBasis['ISSUED_INVOICE'];
            return calculateIssuedInvoiceRevenueWithReturns(invoices, returns);
        }
        case 'PAID_INVOICE': {
            const { invoices, returns } =
                input as RevenueInputByBasis['PAID_INVOICE'];
            return calculatePaidInvoiceRevenueWithReturns(invoices, returns);
        }
        default:
            throw new Error(`Unknown revenue basis: ${basis as string}`);
    }
}

// Re-export Decimal factory for tests & convenience
export function decimal(value: string | number): Decimal {
    return new Decimal(value.toString());
}
export { Decimal };
export const UNATTRIBUTED_SALES_KEY = '__unattributed__';
