import { describe, expect, it } from 'vitest';

import { buildBomSimulationDataset, simulateBomCosts } from './bom-simulator';

const decimal = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
});

describe('bom simulator utils', () => {
    it('builds unique raw materials and current bom costs from bom sources', () => {
        const dataset = buildBomSimulationDataset([
            {
                id: 'bom-1',
                name: 'BOM A',
                category: 'STANDARD',
                outputQuantity: decimal(2),
                productVariantId: 'fg-1',
                productVariant: {
                    id: 'fg-1',
                    name: 'Finished Good A',
                    skuCode: 'FG-A',
                    product: { name: 'Finished Good' },
                },
                items: [
                    {
                        id: 'item-1',
                        productVariantId: 'rm-1',
                        quantity: decimal(3),
                        scrapPercentage: decimal(10),
                        productVariant: {
                            id: 'rm-1',
                            name: 'Resin',
                            skuCode: 'RM-1',
                            product: { name: 'Raw Material' },
                            inventories: [
                                { quantity: decimal(5), averageCost: decimal(100) },
                            ],
                        },
                    },
                    {
                        id: 'item-2',
                        productVariantId: 'rm-2',
                        quantity: decimal(1),
                        scrapPercentage: decimal(0),
                        productVariant: {
                            id: 'rm-2',
                            name: 'Colorant',
                            skuCode: 'RM-2',
                            product: { name: 'Raw Material' },
                            standardCost: decimal(50),
                            inventories: [],
                        },
                    },
                ],
            },
            {
                id: 'bom-2',
                name: 'BOM B',
                category: 'STANDARD',
                outputQuantity: decimal(1),
                productVariantId: 'fg-2',
                productVariant: {
                    id: 'fg-2',
                    name: 'Finished Good B',
                    skuCode: 'FG-B',
                    product: { name: 'Finished Good' },
                },
                items: [
                    {
                        id: 'item-3',
                        productVariantId: 'rm-1',
                        quantity: decimal(2),
                        scrapPercentage: decimal(0),
                        productVariant: {
                            id: 'rm-1',
                            name: 'Resin',
                            skuCode: 'RM-1',
                            product: { name: 'Raw Material' },
                            inventories: [
                                { quantity: decimal(5), averageCost: decimal(100) },
                            ],
                        },
                    },
                ],
            },
        ]);

        expect(dataset.materials).toHaveLength(2);
        expect(dataset.boms).toHaveLength(2);
        expect(dataset.boms[0].currentUnitCost).toBeCloseTo(190);
        expect(dataset.boms[1].currentUnitCost).toBeCloseTo(200);
    });

    it('recalculates bom unit costs with material price overrides', () => {
        const dataset = buildBomSimulationDataset([
            {
                id: 'bom-1',
                name: 'BOM A',
                category: 'STANDARD',
                outputQuantity: 2,
                productVariantId: 'fg-1',
                productVariant: {
                    id: 'fg-1',
                    name: 'Finished Good A',
                    skuCode: 'FG-A',
                    product: { name: 'Finished Good' },
                },
                items: [
                    {
                        id: 'item-1',
                        productVariantId: 'rm-1',
                        quantity: 3,
                        scrapPercentage: 10,
                        productVariant: {
                            id: 'rm-1',
                            name: 'Resin',
                            skuCode: 'RM-1',
                            product: { name: 'Raw Material' },
                            currentCost: 100,
                            inventories: [],
                        },
                    },
                    {
                        id: 'item-2',
                        productVariantId: 'rm-2',
                        quantity: 1,
                        scrapPercentage: 0,
                        productVariant: {
                            id: 'rm-2',
                            name: 'Colorant',
                            skuCode: 'RM-2',
                            product: { name: 'Raw Material' },
                            currentCost: 50,
                            inventories: [],
                        },
                    },
                ],
            },
        ]);

        const impacts = simulateBomCosts(dataset.boms, { 'rm-1': 130 });

        expect(impacts).toHaveLength(1);
        expect(impacts[0].currentUnitCost).toBeCloseTo(190);
        expect(impacts[0].simulatedUnitCost).toBeCloseTo(239.5);
        expect(impacts[0].varianceAmount).toBeCloseTo(49.5);
        expect(impacts[0].variancePercent).toBeCloseTo((49.5 / 190) * 100);
    });
});