import { describe, expect, it } from 'vitest';
import { aggregateHppReport, type EnrichedProductionCost } from '../hpp-report';

const cost = (overrides: Partial<EnrichedProductionCost>): EnrichedProductionCost => ({
    productionOrderId: 'po',
    orderNumber: 'WO-1',
    status: 'COMPLETED',
    materialCost: 0,
    machineCost: 0,
    laborCost: 0,
    overheadCost: 0,
    totalCost: 0,
    quantityProduced: 0,
    unitCost: 0,
    bomId: 'bom',
    bomName: 'Recipe',
    productName: 'Product',
    productSku: null,
    category: null,
    standardCost: 0,
    ...overrides,
});

describe('aggregateHppReport', () => {
    it('weights per-unit costs across a recipe and includes journal conversion in HPP', () => {
        // Arrange — two SPKs of one recipe: 300 material + 100 overhead over 40 kg
        const orders = [
            cost({ productionOrderId: 'a', orderNumber: 'WO-2', materialCost: 200, overheadCost: 60, totalCost: 260, quantityProduced: 30, standardCost: 8 }),
            cost({ productionOrderId: 'b', orderNumber: 'WO-1', materialCost: 100, overheadCost: 40, totalCost: 140, quantityProduced: 10, standardCost: 8 }),
        ];

        // Act
        const report = aggregateHppReport(orders);

        // Assert
        expect(report.products).toEqual([
            expect.objectContaining({
                bomId: 'bom',
                totalQuantity: 40,
                orderCount: 2,
                materialPerUnit: 7.5,
                overheadPerUnit: 2.5,
                hppPerUnit: 10,
                varianceAmount: 2,
                variancePercent: 25,
            }),
        ]);
        expect(report.orders.map((o) => [o.orderNumber, o.overheadCost])).toEqual([
            ['WO-1', 40],
            ['WO-2', 60],
        ]);
        expect(report.summary).toEqual({
            totalCogm: 400,
            totalQuantity: 40,
            materialShare: 75,
            laborShare: 0,
            machineShare: 0,
            overheadShare: 25,
            productCount: 1,
            orderCount: 2,
        });
    });

    it('keeps session labor and machine buckets apart and sorts products by name', () => {
        const report = aggregateHppReport([
            cost({ productionOrderId: 'z', bomId: 'bom-z', productName: 'Zak', materialCost: 50, laborCost: 30, machineCost: 20, totalCost: 100, quantityProduced: 10 }),
            cost({ productionOrderId: 'a', bomId: 'bom-a', productName: 'Ape', materialCost: 10, totalCost: 10, quantityProduced: 5 }),
        ]);

        expect(report.products.map((p) => p.productName)).toEqual(['Ape', 'Zak']);
        expect(report.products[1]).toMatchObject({ laborPerUnit: 3, machinePerUnit: 2, overheadPerUnit: 0, hppPerUnit: 10, variancePercent: 0 });
        expect(report.summary).toMatchObject({ laborShare: (30 / 110) * 100, machineShare: (20 / 110) * 100, overheadShare: 0 });
    });

    it('leaves out recipes without output and reports zero shares for an empty total', () => {
        const report = aggregateHppReport([cost({ quantityProduced: 0, materialCost: 0, totalCost: 0 })]);

        expect(report.products).toEqual([]);
        expect(report.orders).toHaveLength(1);
        expect(report.summary).toMatchObject({ totalCogm: 0, materialShare: 0, laborShare: 0, machineShare: 0, overheadShare: 0, productCount: 0 });
    });

    it('passes the conversion pool summary through, defaulting to session-based costing', () => {
        const pool = {
            enabled: true,
            pool: 185_100_000,
            allocated: 185_000_000,
            unallocated: 100_000,
            byAccount: [{ accountId: 'wage', code: '5-012b', name: 'Tenaga Kerja Langsung', amount: 101_300_000 }],
        };

        expect(aggregateHppReport([], pool).conversion).toBe(pool);
        expect(aggregateHppReport([]).conversion).toEqual({ enabled: false, pool: 0, allocated: 0, unallocated: 0, byAccount: [] });
    });
});
