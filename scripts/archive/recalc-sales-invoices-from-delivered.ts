/**
 * Dry-run: cek selisih Sales Invoice vs total delivered qty (DO).
 * Usage: npx tsx scripts/recalc-sales-invoices-from-delivered.ts [--apply]
 *
 * --apply will update DRAFT invoices to delivered-based total.
 */
import { prisma } from '../src/lib/core/prisma';
import { calculatePpn, type PpnMode } from '../src/lib/utils/ppn';

async function calcSalesTotalFromDelivered(so: {
    totalAmount: { toNumber(): number };
    shippingCost: { toNumber(): number } | null;
    items: Array<{
        productVariantId: string;
        unitPrice: { toNumber(): number };
        discountPercent?: { toNumber(): number } | null;
        taxPercent?: { toNumber(): number } | null;
        ppnMode: string;
        deliveredQty: { toNumber(): number };
    }>;
    deliveryOrders: Array<{ totalCharge: { toNumber(): number } | null }>;
}): Promise<number> {
    const hasDelivered = so.items.some((i) => i.deliveredQty.toNumber() > 0);
    if (!hasDelivered) return so.totalAmount?.toNumber() ?? 0;

    let totalGoods = 0;
    for (const it of so.items) {
        const delivered = it.deliveredQty.toNumber();
        const raw = delivered * it.unitPrice.toNumber();
        const discPct = it.discountPercent?.toNumber() ?? 0;
        const discount = raw * (discPct / 100);
        const afterDiscount = raw - discount;
        const taxPct = it.taxPercent?.toNumber() ?? 0;
        const ppnRes = calculatePpn(
            afterDiscount,
            taxPct,
            it.ppnMode as PpnMode,
        );
        totalGoods += ppnRes.total;
    }

    let shipping = 0;
    if (so.deliveryOrders.length > 0) {
        for (const d of so.deliveryOrders)
            shipping += d.totalCharge?.toNumber() ?? 0;
    } else {
        shipping = so.shippingCost?.toNumber() ?? 0;
    }

    return Math.round((totalGoods + shipping) * 100) / 100;
}

async function main() {
    const apply = process.argv.includes('--apply');

    const sos = await prisma.salesOrder.findMany({
        where: {
            items: { some: { deliveredQty: { gt: 0 } } },
            invoices: { some: {} },
        },
        select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            shippingCost: true,
            items: {
                select: {
                    productVariantId: true,
                    unitPrice: true,
                    discountPercent: true,
                    taxPercent: true,
                    ppnMode: true,
                    deliveredQty: true,
                },
            },
            deliveryOrders: {
                where: { status: { in: ['SHIPPED', 'DELIVERED'] } },
                select: { totalCharge: true },
            },
            invoices: {
                select: {
                    id: true,
                    invoiceNumber: true,
                    totalAmount: true,
                    status: true,
                    paidAmount: true,
                },
            },
        },
        orderBy: { orderNumber: 'asc' },
    });

    let diffCount = 0;
    let fixedCount = 0;

    for (const so of sos) {
        const deliveredTotal = await calcSalesTotalFromDelivered(so as never);
        const orderedTotal = so.totalAmount?.toNumber() ?? 0;
        for (const inv of so.invoices) {
            const invTotal = inv.totalAmount.toNumber();
            const delta = deliveredTotal - invTotal;
            if (Math.abs(delta) > 0.01) {
                diffCount++;
                const isFixable = inv.status === 'DRAFT';
                console.log(
                    `SO ${so.orderNumber} | delivered total ${deliveredTotal} | Invoice ${inv.invoiceNumber} ${inv.status} total ${invTotal} | delta ${delta.toFixed(2)} | ordered ${orderedTotal} | fixable=${isFixable}`,
                );
                if (apply && isFixable) {
                    await prisma.invoice.update({
                        where: { id: inv.id },
                        data: { totalAmount: deliveredTotal },
                    });
                    console.log(
                        `  -> Updated invoice ${inv.invoiceNumber} to ${deliveredTotal}`,
                    );
                    fixedCount++;
                }
            }
        }
    }

    console.log(
        `\nDone. ${diffCount} mismatches found. ${fixedCount} fixed (apply=${apply}).`,
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
