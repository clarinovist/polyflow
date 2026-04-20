import { describe, expect, it } from 'vitest';

import { calculateBomItemCost, getCurrentUnitCost } from './current-cost';

const decimal = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
});

describe('current cost utils', () => {
    it('should calculate weighted average from inventory balances', () => {
        const cost = getCurrentUnitCost({
            standardCost: decimal(999),
            inventories: [
                { quantity: decimal(10), averageCost: decimal(100) },
                { quantity: decimal(5), averageCost: decimal(160) },
            ]
        });

        expect(cost).toBeCloseTo(120);
    });

    it('should fall back to standard cost when there is no stock balance', () => {
        const cost = getCurrentUnitCost({
            standardCost: decimal(85),
            inventories: []
        });

        expect(cost).toBe(85);
    });

    it('should calculate bom line cost using current unit cost and scrap', () => {
        const lineCost = calculateBomItemCost({
            quantity: 4,
            scrapPercentage: 10,
            productVariant: {
                currentCost: 50,
            }
        });

        expect(lineCost).toBeCloseTo(220);
    });
});
