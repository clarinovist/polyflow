import {
    PROCESS_KEYS,
    processKeyFromCategory,
    type ProcessKey,
} from './process-keys';

export interface TodayOutputItem {
    productVariantId: string;
    productName: string;
    skuCode: string;
    processKey: ProcessKey;
    quantity: number;
    unit: string;
    orderCount: number;
}

interface TodayOutputSource {
    quantityProduced: unknown;
    productionOrder: {
        id: string;
        bom: {
            category: string | null;
            productVariant: {
                id: string;
                name: string;
                skuCode: string;
                primaryUnit: string;
            };
        };
    };
}

export function aggregateTodayOutputItems(
    executions: readonly TodayOutputSource[],
): TodayOutputItem[] {
    const aggregated = new Map<
        string,
        { item: Omit<TodayOutputItem, 'orderCount'>; orderIds: Set<string> }
    >();

    for (const execution of executions) {
        const quantity = Number(execution.quantityProduced ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        const { productionOrder } = execution;
        const variant = productionOrder.bom.productVariant;
        const processKey = processKeyFromCategory(
            productionOrder.bom.category,
        );
        const key = `${processKey}:${variant.id}:${variant.primaryUnit}`;
        const existing = aggregated.get(key);

        if (existing) {
            existing.item.quantity += quantity;
            existing.orderIds.add(productionOrder.id);
            continue;
        }

        aggregated.set(key, {
            item: {
                productVariantId: variant.id,
                productName: variant.name,
                skuCode: variant.skuCode,
                processKey,
                quantity,
                unit: variant.primaryUnit,
            },
            orderIds: new Set([productionOrder.id]),
        });
    }

    return [...aggregated.values()]
        .map(({ item, orderIds }) => ({
            ...item,
            orderCount: orderIds.size,
        }))
        .sort((a, b) => {
            const processDifference =
                PROCESS_KEYS.indexOf(a.processKey) -
                PROCESS_KEYS.indexOf(b.processKey);
            return (
                processDifference ||
                a.productName.localeCompare(b.productName, 'id-ID')
            );
        });
}
