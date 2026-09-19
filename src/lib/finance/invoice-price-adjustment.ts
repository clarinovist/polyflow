import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ValidationError } from '@/lib/errors/errors';
const unsigned = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/);
export const priceAdjustmentInput = z.object({
    invoiceId: z.string().min(1).max(100),
    sourceItemId: z.string().min(1).max(100),
    quantity: unsigned,
    newNetUnitPrice: unsigned,
    expectedRemaining: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(5).max(1000),
    postingDate: z.coerce.date(),
    idempotencyKey: z.string().uuid(),
    confirmed: z.literal(true),
});
export function calculatePriceAdjustment(input: {
    sourceQuantity: string;
    sourceNet: string;
    sourceTax: string;
    quantity: string;
    newNetUnitPrice: string;
}) {
    const parse = (value: string) => {
        const amount = new Prisma.Decimal(unsigned.parse(value));
        if (!amount.isFinite())
            throw new ValidationError('Nominal tidak valid.');
        return amount;
    };
    const sourceQty = parse(input.sourceQuantity),
        sourceNet = parse(input.sourceNet),
        sourceTax = parse(input.sourceTax),
        qty = parse(input.quantity),
        price = parse(input.newNetUnitPrice);
    if (
        sourceQty.lte(0) ||
        sourceNet.lte(0) ||
        qty.lte(0) ||
        qty.gt(sourceQty) ||
        qty.decimalPlaces() > 4
    )
        throw new ValidationError('Jumlah sumber/penyesuaian tidak valid.');
    const oldNet = sourceNet.mul(qty).div(sourceQty).toDecimalPlaces(2);
    const newNet = price.mul(qty).toDecimalPlaces(2);
    const net = newNet.minus(oldNet);
    const oldTax = sourceTax.mul(qty).div(sourceQty).toDecimalPlaces(2);
    const tax = newNet
        .mul(sourceTax)
        .div(sourceNet)
        .toDecimalPlaces(2)
        .minus(oldTax);
    if (net.isZero() || net.plus(tax).abs().gt('9999999999999.99'))
        throw new ValidationError(
            'Tidak ada perubahan harga atau nominal melampaui batas.',
        );
    return {
        netAmount: net.toFixed(2),
        taxAmount: tax.toFixed(2),
        totalAmount: net.plus(tax).toFixed(2),
        oldNetUnitPrice: sourceNet.div(sourceQty).toFixed(6),
    };
}
