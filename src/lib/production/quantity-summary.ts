import { executionScrapTotal } from './execution-scrap';

export interface QuantityByUnit { unit: string; quantity: number }
export const UNKNOWN_UNIT = 'Satuan belum diketahui';

/** Add only quantities with the same known base unit; never invent conversions. */
export function summarizeQuantities(rows: { quantity: unknown; unit?: string | null }[]): QuantityByUnit[] {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const quantity = Number(row.quantity ?? 0);
        if (!Number.isFinite(quantity)) continue;
        const unit = row.unit?.trim() || UNKNOWN_UNIT;
        totals.set(unit, (totals.get(unit) ?? 0) + quantity);
    }
    return [...totals].map(([unit, quantity]) => ({ unit, quantity }));
}

export function formatQuantitySummary(rows: QuantityByUnit[]): string {
    return rows.length
        ? rows.map(({ unit, quantity }) => `${quantity.toLocaleString('id-ID', { maximumFractionDigits: 4 })} ${unit}`).join(' · ')
        : '—';
}

/** Legacy execution scrap has no unit snapshot. Only KG agrees across entry paths. */
export function legacyScrapSummary(executions: Parameters<typeof executionScrapTotal>[0][], outputUnit?: string | null): string {
    const quantity = executions.reduce((total, execution) => total + executionScrapTotal(execution), 0);
    if (quantity === 0) return '0';
    return outputUnit === 'KG'
        ? `${quantity.toLocaleString('id-ID', { maximumFractionDigits: 4 })} KG`
        : 'Satuan scrap belum terverifikasi';
}
