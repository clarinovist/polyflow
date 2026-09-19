import { Prisma } from '@prisma/client';
import type { InvoiceSnapshot } from '@/lib/finance/invoice-snapshot';
import { BusinessRuleError } from '@/lib/errors/errors';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { resolveRevenueAccount } from '@/services/accounting/revenue-account-resolver';
import type { RevenueRule } from '@/services/accounting/tenant-revenue-rule-service';

/** Exact per-invoice revenue/VAT: no scaling cumulative SO rows to a supplementary total. */
export async function snapshotJournalLines(
    snapshot: InvoiceSnapshot,
    total: Prisma.Decimal,
    rounding: Prisma.Decimal | null,
    db: Prisma.TransactionClient,
    rules: RevenueRule[],
    cacheKey: string,
) {
    if (
        !new Prisma.Decimal(snapshot.commercialTotal)
            .plus(rounding ?? 0)
            .eq(total)
    ) {
        throw new BusinessRuleError(
            'Snapshot invoice tidak cocok dengan total tersimpan.',
        );
    }
    const revenue = new Map<string, Prisma.Decimal>();
    for (const item of snapshot.items) {
        if (new Prisma.Decimal(item.netAmount).isZero()) continue;
        const resolved = await resolveRevenueAccount(
            {
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                variant: {
                    id: item.productVariantId,
                    name: item.name,
                    skuCode: item.skuCode,
                    revenueAccountId: item.revenueAccountId,
                    product: item.product,
                },
            },
            db,
            rules,
            cacheKey,
        );
        const accountId =
            resolved?.accountId ?? (await resolveAccount('sales-revenue')).id;
        revenue.set(
            accountId,
            (revenue.get(accountId) ?? new Prisma.Decimal(0)).plus(
                item.netAmount,
            ),
        );
    }
    if (Number(snapshot.shippingAmount) > 0) {
        const id = (await resolveAccount('sales-revenue')).id;
        revenue.set(
            id,
            (revenue.get(id) ?? new Prisma.Decimal(0)).plus(
                snapshot.shippingAmount,
            ),
        );
    }
    const lines = [
        {
            accountId: (await resolveAccount('accounts-receivable')).id,
            debit: total.toNumber(),
            credit: 0,
            description: 'Invoice receivable',
        },
        ...Array.from(revenue, ([accountId, amount]) => ({
            accountId,
            debit: 0,
            credit: amount.toNumber(),
            description: 'Revenue from invoice snapshot',
        })),
    ];
    if (Number(snapshot.taxAmount) > 0)
        lines.push({
            accountId: (await resolveAccount('vat-output')).id,
            debit: 0,
            credit: Number(snapshot.taxAmount),
            description: 'VAT from invoice snapshot',
        });
    if (rounding && rounding.gt(0))
        lines.push({
            accountId: (await resolveAccount('sales-rounding-income')).id,
            debit: 0,
            credit: rounding.toNumber(),
            description: 'Pembulatan invoice',
        });
    return lines;
}
