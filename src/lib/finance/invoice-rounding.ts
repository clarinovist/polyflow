import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

/** Round once, after tax/shipping, at the persisted currency precision (cents). */
export function calculateInvoiceRounding(amount: Prisma.Decimal.Value) {
    const value = new Prisma.Decimal(amount);
    if (!value.isFinite() || value.isNegative()) {
        throw new BusinessRuleError(
            'Total invoice harus berupa nominal non-negatif yang valid.',
        );
    }
    const base = value.toDecimalPlaces(2);
    const total = base.div(500).ceil().times(500);
    if (total.gt('9999999999999.99')) {
        throw new BusinessRuleError(
            'Total invoice melebihi batas nominal yang didukung.',
        );
    }
    return {
        totalAmount: total.toNumber(),
        roundingAmount: total.minus(base).toNumber(),
    };
}

/** null is a policy marker, NOT zero: legacy invoices must never opt in on sync. */
export function invoiceAmountsForPolicy(
    amount: number,
    roundingAmount: unknown,
) {
    return roundingAmount == null
        ? { totalAmount: amount }
        : calculateInvoiceRounding(amount);
}
