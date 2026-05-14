type UnitConfig = {
    primaryUnit?: string | null;
    salesUnit?: string | null;
    conversionFactor?: unknown;
};

export function unitNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        const decimalLike = value as { toNumber?: () => number };
        if (typeof decimalLike.toNumber === 'function') {
            const parsed = decimalLike.toNumber();
            return Number.isFinite(parsed) ? parsed : fallback;
        }
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function getProductionUnitMeta(config: UnitConfig) {
    const primaryUnit = config.primaryUnit || 'KG';
    const salesUnit = config.salesUnit || primaryUnit;
    const conversionFactor = unitNumber(config.conversionFactor, 1);
    const hasAlternateUnit = Boolean(
        salesUnit &&
        salesUnit !== primaryUnit &&
        Number.isFinite(conversionFactor) &&
        conversionFactor > 0
    );

    return {
        primaryUnit,
        salesUnit,
        conversionFactor,
        hasAlternateUnit,
        displayUnit: hasAlternateUnit ? salesUnit : primaryUnit,
    };
}

export function toBaseQuantity(enteredQuantity: number, conversionFactor: number) {
    return enteredQuantity * conversionFactor;
}

export function toDisplayQuantity(baseQuantity: number, conversionFactor: number) {
    if (!conversionFactor || conversionFactor <= 0) return baseQuantity;
    return baseQuantity / conversionFactor;
}

export function formatQuantity(value: number, fractionDigits = 2) {
    return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
    });
}

export function formatProductionQuantity(
    baseQuantity: number,
    config: UnitConfig,
    options: { showBaseWhenAlternate?: boolean; fractionDigits?: number } = {}
) {
    const { showBaseWhenAlternate = true, fractionDigits = 2 } = options;
    const meta = getProductionUnitMeta(config);
    const base = Number(baseQuantity || 0);

    if (!meta.hasAlternateUnit) {
        return `${formatQuantity(base, fractionDigits)} ${meta.primaryUnit}`;
    }

    const displayQty = toDisplayQuantity(base, meta.conversionFactor);
    const display = `${formatQuantity(displayQty, fractionDigits)} ${meta.salesUnit}`;
    if (!showBaseWhenAlternate) return display;

    return `${display} (${formatQuantity(base, fractionDigits)} ${meta.primaryUnit})`;
}

export type EnteredQuantitySnapshot = UnitConfig & {
    quantity?: unknown;
    unitPrice?: unknown;
    enteredQuantity?: unknown;
    enteredUnit?: string | null;
    enteredUnitPrice?: unknown;
    conversionFactorSnapshot?: unknown;
};

export function getEnteredQuantityDisplay(
    item: EnteredQuantitySnapshot,
    options: { showBaseWhenAlternate?: boolean; fractionDigits?: number } = {}
) {
    const { showBaseWhenAlternate = true, fractionDigits = 2 } = options;
    const baseQuantity = unitNumber(item.quantity, 0);
    const snapshotQty = item.enteredQuantity !== undefined && item.enteredQuantity !== null
        ? unitNumber(item.enteredQuantity, 0)
        : null;
    const snapshotUnit = item.enteredUnit || null;

    if (snapshotQty !== null && snapshotUnit) {
        const display = `${formatQuantity(snapshotQty, fractionDigits)} ${snapshotUnit}`;
        if (!showBaseWhenAlternate || snapshotUnit === item.primaryUnit) return display;

        return `${display} (${formatQuantity(baseQuantity, fractionDigits)} ${item.primaryUnit || 'KG'})`;
    }

    return formatProductionQuantity(baseQuantity, item, { showBaseWhenAlternate, fractionDigits });
}

export function getEnteredUnitPriceDisplay(item: EnteredQuantitySnapshot) {
    const snapshotPrice = item.enteredUnitPrice !== undefined && item.enteredUnitPrice !== null
        ? unitNumber(item.enteredUnitPrice, 0)
        : null;
    const snapshotUnit = item.enteredUnit || null;

    if (snapshotPrice !== null && snapshotUnit) {
        return {
            price: snapshotPrice,
            unit: snapshotUnit,
        };
    }

    const meta = getProductionUnitMeta(item);
    const basePrice = unitNumber(item.unitPrice, 0);
    return {
        price: meta.hasAlternateUnit ? basePrice * meta.conversionFactor : basePrice,
        unit: meta.displayUnit,
    };
}
