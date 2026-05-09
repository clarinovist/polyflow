import { describe, expect, it } from 'vitest';

import {
    calculateBomItemCost,
    getCostAnomalyFlags,
    getCurrentCostBreakdown,
    getCurrentUnitCost,
    getVariantCostDiagnostics,
} from './current-cost';

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

    it('should report inventory average as the active current cost source when stock has value', () => {
        const breakdown = getCurrentCostBreakdown({
            standardCost: decimal(90),
            inventories: [
                { quantity: decimal(2), averageCost: decimal(100) },
                { quantity: decimal(1), averageCost: decimal(200) },
            ]
        });

        expect(breakdown.source).toBe('inventory_average');
        expect(breakdown.currentCost).toBeCloseTo(133.3333, 3);
        expect(breakdown.stockQty).toBe(3);
        expect(breakdown.stockValue).toBe(400);
    });

    it('should fall back to standard cost when there is no stock balance', () => {
        const cost = getCurrentUnitCost({
            standardCost: decimal(85),
            inventories: []
        });

        expect(cost).toBe(85);
    });

    it('should report standard cost as the active source when stock has no value', () => {
        const breakdown = getCurrentCostBreakdown({
            standardCost: decimal(85),
            inventories: [
                { quantity: decimal(1), averageCost: decimal(0) },
            ]
        });

        expect(breakdown.source).toBe('standard_cost');
        expect(breakdown.currentCost).toBe(85);
        expect(breakdown.stockQty).toBe(1);
        expect(breakdown.stockValue).toBe(0);
    });

    it('should flag low stock cost outlier when inventory average is far above standard cost', () => {
        const flags = getCostAnomalyFlags({
            currentCost: 33000,
            standardCost: 15000,
            source: 'inventory_average',
            stockQty: 1,
            stockValue: 33000,
        });

        expect(flags).toContain('low_stock_cost_outlier');
        expect(flags).toContain('inventory_standard_gap');
    });

    it('should expose combined diagnostics payload for UI use', () => {
        const diagnostics = getVariantCostDiagnostics({
            standardCost: decimal(15000),
            inventories: [
                { quantity: decimal(1), averageCost: decimal(33000) },
            ]
        });

        expect(diagnostics.breakdown.source).toBe('inventory_average');
        expect(diagnostics.flags).toEqual(['inventory_standard_gap', 'low_stock_cost_outlier']);
        expect(diagnostics.gapPercent).toBeCloseTo(120);
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
