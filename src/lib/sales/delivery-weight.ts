/** Weight of current SJ rows only, using historical snapshots (not today's master).
 * Kept separate from the manually editable weight used for pricing. */
export function getDeliveryLoadWeightKg(
    items: {
        quantity?: string | number;
        enteredQuantity?: string | number | null;
        enteredUnit?: string | null;
        conversionFactorSnapshot?: string | number | null;
        productVariant?: { primaryUnit?: string | null } | null;
    }[],
): number | null {
    let total = 0;
    for (const item of items) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) return null;
        if (quantity === 0) continue;
        if (item.productVariant?.primaryUnit === 'KG') {
            total += quantity;
        } else if (item.enteredUnit === 'KG') {
            const factor = Number(item.conversionFactorSnapshot);
            if (!Number.isFinite(factor) || factor <= 0) return null;
            total += quantity / factor;
        } else return null;
    }
    return Number.isFinite(total) ? Math.round(total * 10000) / 10000 : null;
}

type DeliveryWeightItem = {
    quantity: string | number;
    deliveredQty?: string | number | null;
    enteredQuantity?: string | number | null;
    enteredUnit?: string | null;
    productVariant?: {
        primaryUnit: string;
        salesUnit?: string | null;
        conversionFactor?: string | number | null;
        product?: { productType?: string } | null;
    } | null;
};

/** Remaining physical load in kg. Unknown conversion means no automatic estimate,
 * not a partial total or an assumption that one package weighs one kilogram. */
export function estimateDeliveryWeightKg(
    items: DeliveryWeightItem[],
): number | null {
    let total = 0;
    for (const item of items) {
        const variant = item.productVariant;
        if (variant?.product?.productType === 'SERVICE') continue;

        const quantity = Number(item.quantity);
        const delivered = Number(item.deliveredQty ?? 0);
        if (
            !Number.isFinite(quantity) ||
            !Number.isFinite(delivered) ||
            quantity < 0 ||
            delivered < 0
        ) {
            return null;
        }
        const remaining = Math.max(0, quantity - delivered);
        if (remaining === 0) continue;

        if (variant?.primaryUnit === 'KG') {
            // quantity is already converted to the primary unit when the SO is saved.
            total += remaining;
        } else if (item.enteredUnit === 'KG' && item.enteredQuantity != null) {
            // Preserve historical conversion even if the product master has changed.
            const entered = Number(item.enteredQuantity);
            if (!Number.isFinite(entered) || entered <= 0) return null;
            total += (remaining / quantity) * entered;
        } else if (!item.enteredUnit && variant?.salesUnit === 'KG') {
            // Legacy SO without a snapshot: factor is primary units per sales unit.
            const factor = Number(variant.conversionFactor);
            if (!Number.isFinite(factor) || factor <= 0) return null;
            total += remaining / factor;
        } else {
            return null;
        }
    }
    return Number.isFinite(total) ? Math.round(total * 10000) / 10000 : null;
}
