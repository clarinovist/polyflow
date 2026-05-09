import { describe, expect, it } from 'vitest';

import { buildCostAuditRows, summarizeCostAuditRows } from './cost-audit';

const decimal = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
});

describe('cost audit utils', () => {
    it('should build audit rows and summarize anomaly counts', () => {
        const rows = buildCostAuditRows([
            {
                id: 'v-ori-15',
                name: 'ORI 15',
                skuCode: 'ORI-15',
                product: { name: 'Packing Ori' },
                standardCost: decimal(15000),
                inventories: [
                    { quantity: decimal(1), averageCost: decimal(33000) },
                ],
            },
            {
                id: 'v-ori-21',
                name: 'ORI 21',
                skuCode: 'ORI-21',
                product: { name: 'Packing Ori' },
                standardCost: decimal(15000),
                inventories: [],
            },
            {
                id: 'v-ungu-32',
                name: 'UNGU 32',
                skuCode: 'UNGU-32',
                product: { name: 'Packing Ungu' },
                standardCost: decimal(30000),
                inventories: [],
            },
        ]);

        expect(rows).toHaveLength(3);
        expect(rows[0].variantName).toBe('ORI 15');
        expect(rows[0].source).toBe('inventory_average');
        expect(rows[0].flags).toEqual(['inventory_standard_gap', 'low_stock_cost_outlier']);
        expect(rows[1].source).toBe('standard_cost');

        const summary = summarizeCostAuditRows(rows);
        expect(summary.totalVariants).toBe(3);
        expect(summary.reviewNeeded).toBe(1);
        expect(summary.lowStockOutliers).toBe(1);
        expect(summary.inventoryAverageCount).toBe(1);
        expect(summary.standardFallbackCount).toBe(2);
    });

    it('should support anomaly-only and source filters', () => {
        const rows = buildCostAuditRows([
            {
                id: 'v-1',
                name: 'ORI 15',
                skuCode: 'ORI-15',
                product: { name: 'Packing Ori' },
                standardCost: decimal(15000),
                inventories: [
                    { quantity: decimal(1), averageCost: decimal(33000) },
                ],
            },
            {
                id: 'v-2',
                name: 'ORI 21',
                skuCode: 'ORI-21',
                product: { name: 'Packing Ori' },
                standardCost: decimal(15000),
                inventories: [],
            },
        ], {
            anomalyOnly: true,
            source: 'inventory_average',
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].variantId).toBe('v-1');
    });
});
