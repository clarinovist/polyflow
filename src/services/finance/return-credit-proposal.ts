import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { allocateReturnValue } from '@/lib/finance/sales-return-allocation';

type Money = Prisma.Decimal;
type Item = {
    id: string;
    productVariantId: string;
    quantity: Money;
    deliveredQty: Money;
    unitPrice: Money;
    discountPercent: Money | null;
    taxPercent: Money | null;
    ppnMode: string | null;
};
type Basis = {
    sourceItemId: string;
    productVariantId: string;
    quantity: Money;
    netAmount: Money;
    taxAmount: Money;
    discountAmount: Money;
    sourceEvidence: unknown;
};
export type ReturnProposalSource = {
    totalAmount: Money;
    roundingAmount: Money;
    shippingAmount: Money;
    journalTax: Money;
    items: Item[];
    returned: { productVariantId: string; returnedQty: Money }[];
    basis: Basis[];
};
const fail = () => {
    throw new BusinessRuleError(
        'Rincian SO/invoice belum cocok atau ambigu. Gunakan pemeriksaan manual.',
    );
};

/** A SO-derived amount is a proposal for explicit Finance approval, NEVER historical evidence. */
export function calculateReturnProposal(data: ReturnProposalSource) {
    if (
        !data.items.length ||
        !data.returned.length ||
        new Set(data.items.map((item) => item.productVariantId)).size !==
            data.items.length
    )
        return fail();
    const hasSnapshot = data.basis.length > 0;
    const hasDelivery = data.items.some((item) => item.deliveredQty.gt(0));
    const lines = hasSnapshot
        ? data.basis
        : data.items.map((item) => {
              if (
                  !item.unitPrice.isFinite() ||
                  item.unitPrice.lt(0) ||
                  item.discountPercent?.lt(0) ||
                  item.discountPercent?.gt(100) ||
                  item.taxPercent?.lt(0)
              )
                  return fail();
              const quantity = hasDelivery ? item.deliveredQty : item.quantity;
              const raw = quantity.mul(item.unitPrice);
              const discount = raw.mul(item.discountPercent ?? 0).div(100);
              const discounted = raw.minus(discount);
              const rate = new Prisma.Decimal(item.taxPercent ?? 0).div(100);
              const net = (
                  item.ppnMode === 'INCLUDE'
                      ? discounted.div(rate.plus(1))
                      : discounted
              ).toDecimalPlaces(2);
              const tax = (
                  item.ppnMode === 'INCLUDE'
                      ? discounted.minus(net)
                      : discounted.mul(rate)
              ).toDecimalPlaces(2);
              return {
                  sourceItemId: item.id,
                  productVariantId: item.productVariantId,
                  quantity,
                  netAmount: net,
                  taxAmount: tax,
                  discountAmount: discount.toDecimalPlaces(2),
              };
          });
    if (
        hasSnapshot &&
        data.basis.some((line) => {
            const evidence = line.sourceEvidence as {
                version?: unknown;
                capturedAtInvoiceCreation?: unknown;
            } | null;
            return (
                !evidence ||
                evidence.version !== 1 ||
                evidence.capturedAtInvoiceCreation !== true ||
                !data.items.some(
                    (item) =>
                        item.id === line.sourceItemId &&
                        item.productVariantId === line.productVariantId,
                )
            );
        })
    )
        return fail();
    if (
        new Set(lines.map((line) => line.productVariantId)).size !==
        lines.length
    )
        return fail();
    for (const line of lines) {
        if (
            line.quantity.lt(0) ||
            [line.netAmount, line.taxAmount, line.discountAmount].some(
                (amount) => !amount.isFinite() || amount.lt(0),
            )
        )
            return fail();
    }
    // Full-source matching is mandatory; never spread invoice total across guessed items.
    const goodsTotal = lines.reduce(
        (sum, line) => sum.plus(line.netAmount).plus(line.taxAmount),
        new Prisma.Decimal(0),
    );
    const totalTax = lines.reduce(
        (sum, line) => sum.plus(line.taxAmount),
        new Prisma.Decimal(0),
    );
    if (
        !goodsTotal
            .plus(data.shippingAmount)
            .plus(data.roundingAmount)
            .equals(data.totalAmount) ||
        !totalTax.equals(data.journalTax)
    )
        return fail();
    const returnedBySku = new Map<string, Money>();
    for (const item of data.returned) {
        if (!item.returnedQty.isFinite() || item.returnedQty.lte(0))
            return fail();
        returnedBySku.set(
            item.productVariantId,
            (
                returnedBySku.get(item.productVariantId) ??
                new Prisma.Decimal(0)
            ).plus(item.returnedQty),
        );
    }
    let total = new Prisma.Decimal(0),
        tax = new Prisma.Decimal(0);
    for (const [sku, quantity] of returnedBySku) {
        const line = lines.find(
            (candidate) => candidate.productVariantId === sku,
        );
        if (!line) return fail();
        const value = allocateReturnValue(line, 0, quantity);
        total = total.plus(value.totalAmount);
        tax = tax.plus(value.taxAmount);
    }
    if (total.lte(0)) return fail();
    return {
        totalAmount: total.toFixed(2),
        taxAmount: tax.toFixed(2),
        source: hasSnapshot ? ('SNAPSHOT' as const) : ('SO_REVIEW' as const),
    };
}
