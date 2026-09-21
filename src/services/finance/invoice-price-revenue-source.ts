import { Prisma } from '@prisma/client';

export type PriceAdjustmentSourceItemForJournal = {
    sourceItemId: string;
    netAmount: string | number;
    revenueAccountId: string;
};
export type PriceAdjustmentSourceLineForJournal = {
    accountId: string;
    debit: string | number | Prisma.Decimal;
    credit: string | number | Prisma.Decimal;
    currency: string;
    exchangeRate: string | number | Prisma.Decimal;
};
export type PriceAdjustmentSourceForJournal = {
    totalAmount: string | number | Prisma.Decimal;
    taxAmount: string | number | Prisma.Decimal;
    roundingAmount: string | number | Prisma.Decimal;
    accountsReceivableAccountId: string;
    vatAccountId: string;
    defaultRevenueAccountId: string;
    roundingAccountId: string | null;
    items: PriceAdjustmentSourceItemForJournal[];
    journalLines: PriceAdjustmentSourceLineForJournal[];
};
const decimal = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
type Totals = Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>;
function add(totals: Totals, id: string, debit: Prisma.Decimal, credit: Prisma.Decimal) {
    const previous = totals.get(id);
    totals.set(id, {
        debit: (previous?.debit ?? decimal(0)).plus(debit),
        credit: (previous?.credit ?? decimal(0)).plus(credit),
    });
}

/**
 * Reconstruct issuance: item revenue, residual shipping to default, VAT and
 * rounding. Compare gross debit AND credit per account, not just net balances:
 * an extra offsetting pair is not evidence of the original invoice revenue.
 */
export function journalMatchesPriceAdjustmentSource(source: PriceAdjustmentSourceForJournal): boolean {
    const nonnegative = (value: string | number | Prisma.Decimal) => {
        try {
            const n = decimal(value);
            return n.isFinite() && n.gte(0);
        } catch {
            return false;
        }
    };
    if (
        ![source.totalAmount, source.taxAmount, source.roundingAmount].every(nonnegative) ||
        !source.accountsReceivableAccountId || !source.vatAccountId || !source.defaultRevenueAccountId ||
        !source.items.length ||
        new Set(source.items.map(i => i.sourceItemId)).size !== source.items.length
    ) return false;
    const expected: Totals = new Map();
    let itemNet = decimal(0);
    for (const item of source.items) {
        if (!item.sourceItemId || !item.revenueAccountId || !nonnegative(item.netAmount)) return false;
        const net = decimal(item.netAmount);
        itemNet = itemNet.plus(net);
        add(expected, item.revenueAccountId, decimal(0), net);
    }
    const residual = decimal(source.totalAmount).minus(source.taxAmount).minus(source.roundingAmount).minus(itemNet);
    if (residual.lt(0)) return false;
    if (residual.gt(0)) add(expected, source.defaultRevenueAccountId, decimal(0), residual);
    if (decimal(source.taxAmount).gt(0)) add(expected, source.vatAccountId, decimal(0), decimal(source.taxAmount));
    if (decimal(source.roundingAmount).gt(0)) {
        if (!source.roundingAccountId) return false;
        add(expected, source.roundingAccountId, decimal(0), decimal(source.roundingAmount));
    }
    add(expected, source.accountsReceivableAccountId, decimal(source.totalAmount), decimal(0));
    const actual: Totals = new Map();
    for (const line of source.journalLines) {
        if (
            !line.accountId || line.currency !== 'IDR' ||
            !nonnegative(line.exchangeRate) || !decimal(line.exchangeRate).equals(1) ||
            !nonnegative(line.debit) || !nonnegative(line.credit)
        ) return false;
        add(actual, line.accountId, decimal(line.debit), decimal(line.credit));
    }
    for (const id of new Set([...expected.keys(), ...actual.keys()])) {
        if (
            !(actual.get(id)?.debit ?? decimal(0)).equals(expected.get(id)?.debit ?? 0) ||
            !(actual.get(id)?.credit ?? decimal(0)).equals(expected.get(id)?.credit ?? 0)
        ) return false;
    }
    return true;
}
