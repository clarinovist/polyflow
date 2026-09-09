import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import type { PpnMode } from '@/lib/utils/ppn';

export type ReceiptValuationInput = {
    unitPrice: Prisma.Decimal.Value;
    discountPercent?: Prisma.Decimal.Value | null;
    taxPercent?: Prisma.Decimal.Value | null;
    ppnMode?: PpnMode | string | null;
};

export type ReceiptValuationOptions = {
    isMaklon?: boolean;
};

function toPersistedDecimal(
    value: Prisma.Decimal.Value,
    field: string,
): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        try {
            const dec = new Prisma.Decimal(value);
            if (!dec.isFinite()) {
                throw new BusinessRuleError(
                    `Nilai ${field} tidak valid untuk valuasi penerimaan.`,
                    { field },
                    'RECEIPT_VALUATION_INVALID_AMOUNT',
                );
            }
            return dec;
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            throw new BusinessRuleError(
                `Nilai ${field} tidak valid untuk valuasi penerimaan.`,
                { field },
                'RECEIPT_VALUATION_INVALID_AMOUNT',
            );
        }
    }
    throw new BusinessRuleError(
        `Nilai ${field} tidak valid untuk valuasi penerimaan.`,
        { field },
        'RECEIPT_VALUATION_INVALID_AMOUNT',
    );
}

function toOptionalPercent(
    value: Prisma.Decimal.Value | null | undefined,
    field: string,
): Prisma.Decimal {
    const percent = value == null
        ? new Prisma.Decimal(0)
        : toPersistedDecimal(value, field);
    if (!percent.isFinite() || percent.isNegative() || percent.gt(100)) {
        throw new BusinessRuleError(
            'Nilai persen harus 0-100 untuk valuasi penerimaan.',
            { field },
            'RECEIPT_VALUATION_INVALID_PERCENT',
        );
    }
    return percent;
}

function calculateReceiptNetAmount(
    input: ReceiptValuationInput,
    quantity: Prisma.Decimal,
    options?: ReceiptValuationOptions,
): Prisma.Decimal {
    if (options?.isMaklon) return new Prisma.Decimal(0);

    if (input.unitPrice === null || input.unitPrice === undefined) {
        throw new BusinessRuleError(
            'Harga PO tidak valid untuk valuasi penerimaan.',
            undefined,
            'RECEIPT_VALUATION_INVALID_AMOUNT',
        );
    }
    const unitPrice = toPersistedDecimal(input.unitPrice, 'unitPrice');
    if (!unitPrice.isFinite() || unitPrice.isNegative()) {
        throw new BusinessRuleError(
            'Harga PO tidak valid untuk valuasi penerimaan.',
            undefined,
            'RECEIPT_VALUATION_INVALID_AMOUNT',
        );
    }

    const discountPercent = toOptionalPercent(
        input.discountPercent,
        'discountPercent',
    );
    const taxPercent = toOptionalPercent(input.taxPercent, 'taxPercent');

    const ppnMode = (input.ppnMode ?? 'EXCLUDE') as PpnMode;
    if (ppnMode !== 'INCLUDE' && ppnMode !== 'EXCLUDE') {
        throw new BusinessRuleError(
            'Mode PPN tidak valid untuk valuasi penerimaan.',
            undefined,
            'RECEIPT_VALUATION_INVALID_PPN_MODE',
        );
    }

    const one = new Prisma.Decimal(1);
    const hundred = new Prisma.Decimal(100);
    const afterDiscount = unitPrice.mul(quantity).mul(
        one.minus(discountPercent.div(hundred)),
    );
    if (taxPercent.isZero() || ppnMode === 'EXCLUDE') return afterDiscount;
    const divisor = one.plus(taxPercent.div(hundred));
    return afterDiscount.div(divisor);
}

export function canonicalizeReceiptQuantity(
    receivedQty: Prisma.Decimal.Value,
): Prisma.Decimal {
    const quantity = toPersistedDecimal(receivedQty, 'receivedQty').toDecimalPlaces(4);
    if (!quantity.isFinite() || !quantity.gt(0)) {
        throw new BusinessRuleError(
            'Jumlah penerimaan harus lebih dari nol setelah dibulatkan ke 4 desimal.',
            { receivedQty: String(receivedQty) },
            'RECEIPT_QUANTITY_ROUNDS_TO_ZERO',
        );
    }
    return quantity;
}

export function resolveReceiptNetUnitCost(
    input: ReceiptValuationInput,
    options?: ReceiptValuationOptions,
): Prisma.Decimal {
    return calculateReceiptNetAmount(input, new Prisma.Decimal(1), options)
        .toDecimalPlaces(4);
}

/** Round extended net once; persisted round4 unit costs are not journal totals. */
export function resolveReceiptNetTotal(
    input: ReceiptValuationInput,
    receivedQty: Prisma.Decimal.Value,
    options?: ReceiptValuationOptions,
): Prisma.Decimal {
    const quantity = toPersistedDecimal(receivedQty, 'receivedQty');
    if (!quantity.isFinite() || quantity.isNegative()) {
        throw new BusinessRuleError(
            'Jumlah penerimaan tidak valid untuk valuasi penerimaan.',
            undefined,
            'RECEIPT_VALUATION_INVALID_AMOUNT',
        );
    }
    return calculateReceiptNetAmount(input, quantity, options).toDecimalPlaces(2);
}
