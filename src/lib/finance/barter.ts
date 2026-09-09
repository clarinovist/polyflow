import { Prisma } from '@prisma/client';

import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';

export const BARTER_PAYMENT_METHOD = 'Barter';
export const MAX_BARTER_AMOUNT = new Prisma.Decimal('9999999999999.99');

export type DecimalInput = string | number | Prisma.Decimal;

export type BarterSummary = {
    receivableBefore: Prisma.Decimal;
    payableBefore: Prisma.Decimal;
    barterAmount: Prisma.Decimal;
    cashAmount: Prisma.Decimal;
    receivableAfter: Prisma.Decimal;
    payableAfter: Prisma.Decimal;
};

export function normalizePartnerName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

export function toMoneyDecimal(
    value: DecimalInput,
    field: string,
    allowZero = false,
): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
        amount =
            value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    } catch {
        throw new ValidationError(`${field} tidak valid.`);
    }
    if (
        !amount.isFinite() ||
        amount.isNegative() ||
        (!allowZero && amount.isZero()) ||
        amount.decimalPlaces() > 2 ||
        amount.gt(MAX_BARTER_AMOUNT)
    ) {
        throw new ValidationError(
            `${field} harus ${allowZero ? 'nol atau positif' : 'lebih dari nol'}, maksimal dua angka desimal, dan tidak melebihi batas nominal.`,
        );
    }
    return amount;
}

export function calculateBarterSummary(input: {
    receivableBalance: DecimalInput;
    payableBalance: DecimalInput;
    barterAmount: DecimalInput;
    cashAmount?: DecimalInput;
}): BarterSummary {
    const receivableBefore = toMoneyDecimal(
        input.receivableBalance,
        'Sisa piutang',
    );
    const payableBefore = toMoneyDecimal(input.payableBalance, 'Sisa hutang');
    const barterAmount = toMoneyDecimal(input.barterAmount, 'Nominal barter');
    const cashAmount = toMoneyDecimal(
        input.cashAmount ?? 0,
        'Pembayaran tambahan',
        true,
    );

    if (barterAmount.gt(Prisma.Decimal.min(receivableBefore, payableBefore))) {
        throw new BusinessRuleError(
            'Nominal barter melebihi sisa piutang atau sisa hutang.',
            undefined,
            'BARTER_EXCEEDS_BALANCE',
        );
    }

    const payableAfterBarter = payableBefore.minus(barterAmount);
    if (cashAmount.gt(payableAfterBarter)) {
        throw new BusinessRuleError(
            'Pembayaran tambahan melebihi sisa hutang setelah barter.',
            undefined,
            'BARTER_CASH_EXCEEDS_BALANCE',
        );
    }

    return {
        receivableBefore,
        payableBefore,
        barterAmount,
        cashAmount,
        receivableAfter: receivableBefore.minus(barterAmount),
        payableAfter: payableAfterBarter.minus(cashAmount),
    };
}

export function statusForRemainingBalance(
    remaining: Prisma.Decimal,
    paid: Prisma.Decimal,
    dueDate: Date | null,
    now = new Date(),
): 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' {
    if (remaining.lte(0)) return 'PAID';
    if (dueDate && dueDate.getTime() < now.getTime()) return 'OVERDUE';
    return paid.gt(0) ? 'PARTIAL' : 'UNPAID';
}
