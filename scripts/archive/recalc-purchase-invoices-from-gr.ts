/**
 * Dry-run: cek selisih invoice Purchase vs total GR aktual.
 * Usage: npx tsx scripts/recalc-purchase-invoices-from-gr.ts [--apply]
 *
 * --apply will actually update DRAFT / UNPAID-paid0 invoices to GR-based total.
 * Without --apply: read-only report.
 */
import { prisma } from '../src/lib/core/prisma';
import { calculatePpn, type PpnMode } from '../src/lib/utils/ppn';

async function calcPoTotalFromGr(po: {
    shippingCost: { toNumber(): number } | null;
    items: Array<{
        productVariantId: string;
        unitPrice: { toNumber(): number };
        discountPercent?: { toNumber(): number } | null;
        taxPercent?: { toNumber(): number } | null;
        ppnMode: string;
    }>;
    goodsReceipts: Array<{
        items: Array<{
            productVariantId: string;
            receivedQty: { toNumber(): number };
        }>;
    }>;
}): Promise<number> {
    if (po.goodsReceipts.length === 0) return 0;
    const receivedMap = new Map<string, number>();
    for (const gr of po.goodsReceipts) {
        for (const it of gr.items) {
            const qty = it.receivedQty.toNumber();
            receivedMap.set(
                it.productVariantId,
                (receivedMap.get(it.productVariantId) ?? 0) + qty,
            );
        }
    }
    let total = 0;
    for (const poItem of po.items) {
        const received = receivedMap.get(poItem.productVariantId) ?? 0;
        const raw = received * poItem.unitPrice.toNumber();
        const discPct = poItem.discountPercent?.toNumber() ?? 0;
        const discount = raw * (discPct / 100);
        const afterDiscount = raw - discount;
        const taxPct = poItem.taxPercent?.toNumber() ?? 0;
        const ppnRes = calculatePpn(
            afterDiscount,
            taxPct,
            poItem.ppnMode as PpnMode,
        );
        total += ppnRes.total;
    }
    total += po.shippingCost?.toNumber() ?? 0;
    return Math.round(total * 100) / 100;
}

async function main() {
    const apply = process.argv.includes('--apply');

    const pos = await prisma.purchaseOrder.findMany({
        where: { goodsReceipts: { some: {} } },
        select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            shippingCost: true,
            status: true,
            items: {
                select: {
                    productVariantId: true,
                    unitPrice: true,
                    discountPercent: true,
                    taxPercent: true,
                    ppnMode: true,
                },
            },
            goodsReceipts: {
                select: {
                    items: {
                        select: { productVariantId: true, receivedQty: true },
                    },
                },
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

    for (const po of pos) {
        const grTotal = await calcPoTotalFromGr(po as never);
        const orderedTotal = po.totalAmount?.toNumber() ?? 0;
        for (const inv of po.invoices) {
            const invTotal = inv.totalAmount.toNumber();
            const delta = grTotal - invTotal;
            if (Math.abs(delta) > 0.01) {
                diffCount++;
                const isFixable =
                    inv.status === 'DRAFT' ||
                    (inv.status === 'UNPAID' &&
                        inv.paidAmount.toNumber() === 0);
                console.log(
                    `PO ${po.orderNumber} | GR total ${grTotal} | Invoice ${inv.invoiceNumber} ${inv.status} total ${invTotal} | delta ${delta.toFixed(2)} | ordered ${orderedTotal} | fixable=${isFixable}`,
                );
                if (apply && isFixable) {
                    await prisma.purchaseInvoice.update({
                        where: { id: inv.id },
                        data: { totalAmount: grTotal },
                    });
                    console.log(
                        `  -> Updated invoice ${inv.invoiceNumber} to ${grTotal}`,
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
