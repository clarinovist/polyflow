import type { OwnerHppScenario } from '../workspace-schema';

/**
 * Three-stage example (extrusion -> cut -> pack) with hand-checked numbers:
 * extrusion = (0.92*14500 + 0.03*38000 + 0.05*2400 + 650 + 420) * 1.05 = 16453.5
 * cut       = 16453.5 * 1.05 + 300 + 120                               = 17696.175
 * pack      = 17696.175 + 216                                          = 17912.175
 */
export function chainScenario(
    overrides: Partial<OwnerHppScenario> = {},
): OwnerHppScenario {
    return {
        id: 'sc1',
        name: 'Standar',
        finalStageId: 'pack',
        sellPrice: 20500,
        stages: [
            {
                id: 'ext',
                name: 'Extrusion',
                outputUnit: 'KG',
                outputQty: 1,
                materials: [
                    {
                        id: 'm1',
                        kind: 'raw',
                        name: 'Resin',
                        unit: 'KG',
                        qty: 0.92,
                        scrapPercent: 0,
                        price: 14500,
                        erpPrice: 14500,
                    },
                    {
                        id: 'm2',
                        kind: 'raw',
                        name: 'Masterbatch',
                        unit: 'KG',
                        qty: 0.03,
                        scrapPercent: 0,
                        price: 38000,
                        erpPrice: 36500,
                    },
                    {
                        id: 'm3',
                        kind: 'raw',
                        name: 'Kalsium',
                        unit: 'KG',
                        qty: 0.05,
                        scrapPercent: 0,
                        price: 2400,
                        erpPrice: null,
                    },
                ],
                costs: [
                    {
                        id: 'c1',
                        label: 'Listrik',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        value: 650,
                    },
                    {
                        id: 'c2',
                        label: 'Tenaga kerja',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        value: 420,
                    },
                    {
                        id: 'c3',
                        label: 'Overhead',
                        formula: 'percentage-of-pre-overhead',
                        percentage: 5,
                    },
                ],
            },
            {
                id: 'cut',
                name: 'Potong',
                outputUnit: 'KG',
                outputQty: 1,
                materials: [
                    {
                        id: 'm4',
                        kind: 'stage',
                        from: 'ext',
                        qty: 1,
                        scrapPercent: 5,
                    },
                ],
                costs: [
                    {
                        id: 'c4',
                        label: 'Tenaga kerja',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        value: 300,
                    },
                    {
                        id: 'c5',
                        label: 'Listrik',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        value: 120,
                    },
                ],
            },
            {
                id: 'pack',
                name: 'Packing',
                outputUnit: 'KG',
                outputQty: 1,
                materials: [
                    {
                        id: 'm5',
                        kind: 'stage',
                        from: 'cut',
                        qty: 1,
                        scrapPercent: 0,
                    },
                ],
                costs: [
                    {
                        id: 'c6',
                        label: 'Karung dan tenaga',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        value: 216,
                    },
                ],
            },
        ],
        ...overrides,
    };
}
