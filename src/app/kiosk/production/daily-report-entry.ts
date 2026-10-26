import type { Unit } from '@prisma/client';
import type { ProductionOutputValues } from '@/lib/schemas/production';
import {
    getProductionUnitMeta,
    toBaseQuantity,
} from '@/lib/utils/production-units';

export type DailyReportOrder = {
    id: string;
    orderNumber: string;
    bom?: {
        productVariant?: {
            name: string;
            primaryUnit?: string | null;
            salesUnit?: string | null;
            conversionFactor?: unknown;
        };
    };
};

export type DailyReportFormProps = {
    operator: { id: string; name: string };
    orders: DailyReportOrder[];
    machines: { id: string; name: string }[];
    employees: { id: string; name: string; code?: string }[];
};

/** Keep variant-specific fields and retry identity intact; convert only positive output. */
export function toDailyReportPayload(
    report: ProductionOutputValues,
    orders: readonly DailyReportOrder[],
): ProductionOutputValues {
    const order = orders.find((item) => item.id === report.productionOrderId);
    const unitMeta = getProductionUnitMeta(order?.bom?.productVariant || {});
    if (!unitMeta.hasAlternateUnit || Number(report.quantityProduced) <= 0) {
        return report;
    }

    const enteredQty = Number(report.quantityProduced);
    const baseQty = toBaseQuantity(enteredQty, unitMeta.conversionFactor);
    return {
        ...report,
        quantityProduced: baseQty,
        enteredQuantity: enteredQty,
        enteredUnit: unitMeta.salesUnit as Unit,
        baseQuantityProduced: baseQty,
        conversionFactorSnapshot: unitMeta.conversionFactor,
    };
}
