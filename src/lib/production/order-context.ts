export type CustomerDestination = { id: string; name: string };
export type QualityStandardDisplay = {
    id: string;
    name: string;
    unit: string;
    targetValue: number | string | null;
    minValue: number | string | null;
    maxValue: number | string | null;
};

/** Source customers remain visible even when no explicit destinations were saved. */
export function collectOrderCustomers(order: {
    customerDestinations?: { customer: CustomerDestination }[];
    salesOrder?: { customer: CustomerDestination | null } | null;
    maklonCustomer?: CustomerDestination | null;
}): CustomerDestination[] {
    const customers = [
        order.salesOrder?.customer,
        order.maklonCustomer,
        ...(order.customerDestinations ?? []).map((row) => row.customer),
    ];
    return [...new Map(customers.filter((c): c is CustomerDestination => !!c).map((c) => [c.id, c])).values()];
}

export function formatQualityStandard(parameter: QualityStandardDisplay): string {
    const fmt = (value: number | string) => Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 });
    const { minValue: min, maxValue: max, targetValue: target } = parameter;
    const range = min != null && max != null
        ? `${fmt(min)}–${fmt(max)}`
        : min != null ? `≥ ${fmt(min)}` : max != null ? `≤ ${fmt(max)}` : null;
    const targetText = target != null ? `Target ${fmt(target)} ${parameter.unit}` : null;
    return [range ? `${range} ${parameter.unit}` : null, targetText].filter(Boolean).join(' · ') || 'Belum ada nilai acuan';
}
