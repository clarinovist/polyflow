import { describe, expect, it } from 'vitest';
import {
    redactInventoryCost,
    redactMovementCost,
    redactProduct360Overview,
    redactVariantPrices,
} from '../product-360-redaction';

const variant = {
    id: 'v-1',
    name: 'Varian Uji',
    price: 1000,
    buyPrice: 800,
    sellPrice: 1200,
    standardCost: 750,
};

describe('product 360 redaction', () => {
    it('nulls every variant price field and keeps identity fields', () => {
        const result = redactVariantPrices(variant);

        expect(result).toEqual({
            id: 'v-1',
            name: 'Varian Uji',
            price: null,
            buyPrice: null,
            sellPrice: null,
            standardCost: null,
        });
    });

    it('does not mutate the input variant', () => {
        redactVariantPrices(variant);

        expect(variant.price).toBe(1000);
        expect(variant.standardCost).toBe(750);
    });

    it('nulls inventory average cost and keeps quantity', () => {
        const result = redactInventoryCost({ quantity: 5, averageCost: 42 });

        expect(result).toEqual({ quantity: 5, averageCost: null });
    });

    it('nulls movement cost and keeps quantity', () => {
        const result = redactMovementCost({ quantity: 3, cost: 99 });

        expect(result).toEqual({ quantity: 3, cost: null });
    });

    it('zeroes valuation and drops cost history across the overview', () => {
        const overview = {
            variant,
            totalQty: 10,
            totalValue: 5000,
            inventories: [{ id: 'i-1', quantity: 10, averageCost: 500 }],
            costHistory: [{ id: 'c-1', newCost: 500 }],
            batches: [{ id: 'b-1' }],
        };

        const result = redactProduct360Overview(overview);

        expect(result.totalQty).toBe(10);
        expect(result.totalValue).toBe(0);
        expect(result.costHistory).toEqual([]);
        expect(result.inventories[0].averageCost).toBeNull();
        expect(result.inventories[0].quantity).toBe(10);
        expect(result.variant.standardCost).toBeNull();
        expect(result.batches).toEqual([{ id: 'b-1' }]);
        expect(overview.totalValue).toBe(5000);
    });
});
