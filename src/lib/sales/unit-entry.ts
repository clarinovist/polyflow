import type { Unit } from '@prisma/client';
import { getProductionUnitMeta } from '@/lib/utils/production-units';

type VariantUnits = { primaryUnit?: string | null; salesUnit?: string | null; conversionFactor?: unknown };
type Entry = { quantity: number; unitPrice: number; enteredUnit?: Unit; conversionFactorSnapshot?: number };

/** Form state is expressed in enteredUnit; persistence is always primaryUnit. */
export function salesEntryMeta(variant: VariantUnits, entry?: Pick<Entry, 'enteredUnit'>, historical?: { enteredUnit?: string | null; conversionFactorSnapshot?: unknown }) {
    const meta = getProductionUnitMeta(variant);
    // Only a historical alternate-unit snapshot defines the alternate factor.
    const savedFactor = Number(historical?.conversionFactorSnapshot);
    const savedAlternate = historical?.enteredUnit && historical.enteredUnit !== meta.primaryUnit && Number.isFinite(savedFactor) && savedFactor > 0;
    const salesUnit = savedAlternate ? historical.enteredUnit! : meta.salesUnit;
    const factor = savedAlternate ? savedFactor : meta.conversionFactor;
    return { ...meta, salesUnit, hasAlternateUnit: salesUnit !== meta.primaryUnit && factor > 0, conversionFactor: factor, displayUnit: entry?.enteredUnit || meta.displayUnit };
}

export function convertSalesEntry(entry: Entry, meta: ReturnType<typeof salesEntryMeta>, unit: Unit) {
    if (![meta.primaryUnit, meta.salesUnit].includes(unit)) throw new Error('Satuan tidak valid');
    const from = meta.displayUnit === meta.primaryUnit ? 1 : meta.conversionFactor;
    const to = unit === meta.primaryUnit ? 1 : meta.conversionFactor;
    return {
        quantity: Number((entry.quantity * from / to).toPrecision(15)),
        unitPrice: Number((entry.unitPrice * to / from).toPrecision(15)),
        enteredUnit: unit,
    };
}

/** Preserve explicit zero prices and treat legacy no-snapshot lines as primary units. */
export function salesEntryForEdit(item: Record<string, unknown>) {
    const variant = item.productVariant as VariantUnits | undefined;
    const hasSnapshot = item.enteredQuantity != null && item.enteredUnit != null && item.enteredUnitPrice != null;
    return {
        originalBaseQuantity: Number(item.quantity),
        originalBaseUnitPrice: Number(item.unitPrice),
        quantity: Number(hasSnapshot ? item.enteredQuantity : item.quantity),
        unitPrice: Number(hasSnapshot ? item.enteredUnitPrice : item.unitPrice),
        enteredUnit: (hasSnapshot ? item.enteredUnit : variant?.primaryUnit) as Unit | undefined,
        enteredQuantity: hasSnapshot ? Number(item.enteredQuantity) : undefined,
        enteredUnitPrice: hasSnapshot ? Number(item.enteredUnitPrice) : undefined,
        conversionFactorSnapshot: hasSnapshot ? Number(item.conversionFactorSnapshot ?? 1) : undefined,
    };
}
