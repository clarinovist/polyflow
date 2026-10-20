import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';

/** Same residual policy for the preview and authoritative transaction. */
export function getRevisionOrderQuantity(
    ordered: number,
    delivered: number,
    load: number,
    remainder: 'KEEP' | 'CLOSE',
) {
    const realized = Math.round((delivered + load) * 10000) / 10000;
    return remainder === 'CLOSE' ? realized : Math.max(ordered, realized);
}

type PricedLine = {
    unitPrice: number;
    taxPercent: number;
    ppnMode: PpnMode;
    discountPercent?: number;
};

/** Display estimate only. The server re-reads prices/versions and validates on save. */
export function previewDeliveryRevision(
    items: (PricedLine & {
        ordered: number;
        delivered: number;
        load: number;
    })[],
    additions: (PricedLine & { quantity: number })[],
    remainder: 'KEEP' | 'CLOSE',
    shippingCost: number,
) {
    const quantities = items.map((item) =>
        getRevisionOrderQuantity(
            item.ordered,
            item.delivered,
            item.load,
            remainder,
        ),
    );
    const total = (quantity: number, line: PricedLine) => {
        const raw = quantity * line.unitPrice;
        const discount = (raw * (line.discountPercent ?? 0)) / 100;
        return calculatePpn(raw - discount, line.taxPercent, line.ppnMode)
            .total;
    };
    return {
        quantities,
        totalAmount:
            shippingCost +
            items.reduce(
                (sum, item, i) => sum + total(quantities[i], item),
                0,
            ) +
            additions.reduce(
                (sum, item) => sum + total(item.quantity, item),
                0,
            ),
    };
}
