import { describe, expect, it } from 'vitest';

import {
    calculateBaselineHpp,
    calculateHppUnit,
    simulateHpp,
    type HppBom,
} from './hpp-calculator';

function makeItem(productVariantId: string, quantity: number, cost: number, scrap = 0) {
    return {
        id: `item-${productVariantId}`,
        productVariantId,
        quantity,
        scrapPercentage: scrap,
        currentMaterialCost: cost,
    };
}

function makeBom(overrides: Partial<HppBom> = {}): HppBom {
    return {
        id: 'bom-1',
        name: 'BOM Alpha',
        category: 'STANDARD',
        outputQuantity: 10,
        productVariantId: 'pv-product',
        productVariant: {
            id: 'pv-product',
            name: 'Product A',
            skuCode: 'PA-001',
            productName: 'Product A',
        },
        items: [
            makeItem('pv-mat-1', 5, 2000), // 5 units × 2000 = 10000
            makeItem('pv-mat-2', 2, 500),  // 2 units × 500  = 1000
        ],
        baselineMaterialPerUnit: 0, // not used by calculateHppUnit directly
        benchmarkLaborPerUnit: 300,
        benchmarkMachinePerUnit: 150,
        ...overrides,
    };
}

describe('calculateHppUnit', () => {
    it('calculates full HPP with no overrides, using benchmarks', () => {
        const bom = makeBom();
        // material = (5*2000 + 2*500) / 10 = 11000 / 10 = 1100
        // labor = 300 (benchmark), machine = 150 (benchmark), overhead = 0
        const result = calculateHppUnit(bom);
        expect(result.materialCost).toBeCloseTo(1100);
        expect(result.laborCost).toBe(300);
        expect(result.machineCost).toBe(150);
        expect(result.overheadCost).toBe(0);
        expect(result.totalHpp).toBeCloseTo(1550);
    });

    it('applies material price overrides', () => {
        const bom = makeBom();
        // override pv-mat-1 price to 3000
        const result = calculateHppUnit(bom, { materialOverrides: { 'pv-mat-1': 3000 } });
        // material = (5*3000 + 2*500) / 10 = 16000 / 10 = 1600
        expect(result.materialCost).toBeCloseTo(1600);
        expect(result.laborCost).toBe(300);
        expect(result.totalHpp).toBeCloseTo(2050);
    });

    it('applies labor, machine and overhead overrides', () => {
        const bom = makeBom();
        const result = calculateHppUnit(bom, {
            laborPerUnit: 400,
            machinePerUnit: 200,
            overheadPerUnit: 100,
        });
        expect(result.laborCost).toBe(400);
        expect(result.machineCost).toBe(200);
        expect(result.overheadCost).toBe(100);
        // material = 1100
        expect(result.totalHpp).toBeCloseTo(1800);
    });

    it('falls back to benchmark when override is undefined', () => {
        const bom = makeBom({ benchmarkLaborPerUnit: 500, benchmarkMachinePerUnit: 250 });
        const result = calculateHppUnit(bom, { overheadPerUnit: 50 });
        expect(result.laborCost).toBe(500);
        expect(result.machineCost).toBe(250);
    });

    it('handles outputQuantity = 0 without dividing by zero', () => {
        const bom = makeBom({ outputQuantity: 0 });
        const result = calculateHppUnit(bom);
        // total material = 11000, not divided
        expect(result.materialCost).toBe(11000);
        expect(Number.isFinite(result.totalHpp)).toBe(true);
    });

    it('handles empty items array', () => {
        const bom = makeBom({ items: [] });
        const result = calculateHppUnit(bom);
        expect(result.materialCost).toBe(0);
        expect(result.totalHpp).toBe(450); // 0 + 300 + 150 + 0
    });

    it('applies scrapPercentage to material quantity', () => {
        const bom = makeBom({
            items: [makeItem('pv-mat-1', 10, 1000, 10)], // 10% scrap → effective qty 11
            outputQuantity: 10,
        });
        // cost per item = 1000 * 10 * 1.10 = 11000; per unit = 1100
        const result = calculateHppUnit(bom);
        expect(result.materialCost).toBeCloseTo(1100);
    });
});

describe('calculateBaselineHpp', () => {
    it('returns baseline using benchmark values and current material cost', () => {
        const bom = makeBom();
        const baseline = calculateBaselineHpp(bom);
        expect(baseline.overheadCost).toBe(0);
        expect(baseline.totalHpp).toBeCloseTo(1550);
    });
});

describe('simulateHpp', () => {
    it('returns result for each BOM', () => {
        const boms = [makeBom({ id: 'bom-1' }), makeBom({ id: 'bom-2', name: 'BOM Beta' })];
        const results = simulateHpp(boms, { overheadPerUnit: 200 });
        expect(results).toHaveLength(2);
    });

    it('calculates variance correctly', () => {
        const bom = makeBom();
        const [result] = simulateHpp([bom], { overheadPerUnit: 200 });
        // baseline = 1550, simulated = 1550 + 200 = 1750
        expect(result.baseline.totalHpp).toBeCloseTo(1550);
        expect(result.simulated.totalHpp).toBeCloseTo(1750);
        expect(result.varianceAmount).toBeCloseTo(200);
        expect(result.variancePercent).toBeCloseTo((200 / 1550) * 100);
    });

    it('returns zero variance when no overrides change the cost', () => {
        const bom = makeBom();
        const [result] = simulateHpp([bom], {});
        expect(result.varianceAmount).toBeCloseTo(0);
    });
});
