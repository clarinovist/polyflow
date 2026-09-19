import { Prisma } from '@prisma/client';
import { ValidationError } from '@/lib/errors/errors';

type DecimalValue = Prisma.Decimal | string | number;

function decimal(value: DecimalValue, scale: number, label: string) {
    const result = new Prisma.Decimal(value);
    if (
        !result.isFinite() ||
        result.isNegative() ||
        result.decimalPlaces() > scale
    ) {
        throw new ValidationError(`${label} tidak valid.`);
    }
    return result;
}

export type ReturnValueBasis = {
    quantity: DecimalValue;
    /** Already net of source discount; do not subtract the discount again. */
    netAmount: DecimalValue;
    taxAmount: DecimalValue;
    discountAmount: DecimalValue;
};

/** Cumulative rounding prevents repeated partial returns from losing/creating cents. */
export function allocateReturnValue(
    basis: ReturnValueBasis,
    alreadyReturned: DecimalValue,
    returnQty: DecimalValue,
) {
    const quantity = decimal(basis.quantity, 4, 'Kuantitas sumber');
    const previous = decimal(alreadyReturned, 4, 'Kuantitas retur sebelumnya');
    const requested = decimal(returnQty, 4, 'Kuantitas retur');
    const cumulative = previous.plus(requested);
    if (quantity.lte(0) || requested.lte(0) || cumulative.gt(quantity)) {
        throw new ValidationError(
            'Kuantitas retur melebihi sumber atau tidak positif.',
        );
    }
    const portion = (value: DecimalValue) => {
        const amount = decimal(value, 2, 'Nilai sumber');
        return amount
            .mul(cumulative)
            .div(quantity)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .minus(
                amount
                    .mul(previous)
                    .div(quantity)
                    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            );
    };
    const netAmount = portion(basis.netAmount);
    const taxAmount = portion(basis.taxAmount);
    return {
        netAmount,
        taxAmount,
        discountAmount: portion(basis.discountAmount),
        totalAmount: netAmount.plus(taxAmount),
    };
}

/** No clamping: a negative balance is a reconciliation anomaly, not a paid invoice. */
export function getSalesInvoiceBalance(invoice: {
    totalAmount: DecimalValue;
    paidAmount: DecimalValue;
    creditedAmount: DecimalValue;
    priceAdjustmentAmount?: DecimalValue;
}) {
    const adjustment = new Prisma.Decimal(invoice.priceAdjustmentAmount ?? 0);
    if (!adjustment.isFinite() || adjustment.decimalPlaces() > 2) throw new ValidationError('Penyesuaian harga tidak valid.');
    return decimal(invoice.totalAmount, 2, 'Total invoice').plus(adjustment)
        .minus(decimal(invoice.paidAmount, 2, 'Pembayaran'))
        .minus(decimal(invoice.creditedAmount, 2, 'Kredit retur'));
}

export function getSalesInvoiceSettlementStatus(invoice: {
    totalAmount: DecimalValue;
    paidAmount: DecimalValue;
    creditedAmount: DecimalValue;
    priceAdjustmentAmount?: DecimalValue;
    dueDate?: Date | null;
}, now = new Date()): 'PAID' | 'UNPAID' | 'PARTIAL' | 'OVERDUE' {
    const remaining = getSalesInvoiceBalance(invoice);
    if (remaining.lt(0)) throw new ValidationError('Pembayaran dan kredit melebihi nilai invoice.');
    if (remaining.equals(0)) return 'PAID';
    if (invoice.dueDate && invoice.dueDate.getTime() < now.getTime()) return 'OVERDUE';
    return new Prisma.Decimal(invoice.paidAmount).plus(invoice.creditedAmount).gt(0) ? 'PARTIAL' : 'UNPAID';
}

export function classifyReturnCredit(
    credit: DecimalValue,
    remaining: DecimalValue,
): 'READY' | 'REVIEW_REQUIRED' {
    const amount = decimal(credit, 2, 'Kredit retur');
    const balance = new Prisma.Decimal(remaining);
    if (amount.lte(0) || !balance.isFinite())
        throw new ValidationError(
            'Nilai kredit atau sisa invoice tidak valid.',
        );
    return balance.lte(0) || amount.gt(balance) ? 'REVIEW_REQUIRED' : 'READY';
}
