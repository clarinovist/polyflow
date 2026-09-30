import { describe, expect, it } from 'vitest';
import { aggregateTodayOutputItems } from '../live-overview';

function execution({
    orderId,
    variantId,
    name,
    sku,
    process,
    unit,
    quantity,
}: {
    orderId: string;
    variantId: string;
    name: string;
    sku: string;
    process: string | null;
    unit: string;
    quantity: unknown;
}) {
    return {
        quantityProduced: quantity,
        productionOrder: {
            id: orderId,
            bom: {
                category: process,
                productVariant: {
                    id: variantId,
                    name,
                    skuCode: sku,
                    primaryUnit: unit,
                },
            },
        },
    };
}

describe('aggregateTodayOutputItems', () => {
    it('groups output by item and process while counting unique orders', () => {
        const result = aggregateTodayOutputItems([
            execution({ orderId: 'wo-1', variantId: 'v-1', name: 'Rafia Hitam', sku: 'RF-01', process: 'EXTRUSION', unit: 'KG', quantity: '12.5' }),
            execution({ orderId: 'wo-1', variantId: 'v-1', name: 'Rafia Hitam', sku: 'RF-01', process: 'EXTRUSION', unit: 'KG', quantity: 2.5 }),
            execution({ orderId: 'wo-2', variantId: 'v-1', name: 'Rafia Hitam', sku: 'RF-01', process: 'EXTRUSION', unit: 'KG', quantity: 5 }),
            execution({ orderId: 'wo-3', variantId: 'v-2', name: 'Sedotan', sku: 'ST-01', process: 'PACKING', unit: 'PACK', quantity: 30 }),
        ]);

        expect(result).toEqual([
            {
                productVariantId: 'v-1',
                productName: 'Rafia Hitam',
                skuCode: 'RF-01',
                processKey: 'EXTRUSION',
                quantity: 20,
                unit: 'KG',
                orderCount: 2,
            },
            {
                productVariantId: 'v-2',
                productName: 'Sedotan',
                skuCode: 'ST-01',
                processKey: 'PACKING',
                quantity: 30,
                unit: 'PACK',
                orderCount: 1,
            },
        ]);
    });

    it('separates the same item by process and ignores non-positive output', () => {
        const result = aggregateTodayOutputItems([
            execution({ orderId: 'wo-1', variantId: 'v-1', name: 'Produk A', sku: 'A', process: 'MIXING', unit: 'KG', quantity: 10 }),
            execution({ orderId: 'wo-2', variantId: 'v-1', name: 'Produk A', sku: 'A', process: 'PACKING', unit: 'KG', quantity: 4 }),
            execution({ orderId: 'wo-3', variantId: 'v-2', name: 'Produk B', sku: 'B', process: null, unit: 'KG', quantity: 0 }),
        ]);

        expect(result.map(({ processKey, quantity }) => ({ processKey, quantity }))).toEqual([
            { processKey: 'MIXING', quantity: 10 },
            { processKey: 'PACKING', quantity: 4 },
        ]);
    });
});
