import { describe, expect, it } from 'vitest';
import {
    HPP_SIMULATOR_DEFAULT_MARGIN_PERCENT,
    HppSimulatorValidationError,
    calculateHppSimulatorScenario,
    calculateHppSimulatorScenarios,
    hppSimulatorDefaultMargin,
    hppSimulatorDefaultNumber,
    hppSimulatorManualNumber,
    isHppSimulatorManualZero,
    resetHppSimulatorNumber,
    resolveHppSimulatorUnitCost,
    type HppSimulatorScenarioInput,
} from '../hpp-price-simulator';

const defaultNumber = (value: number | null) =>
    hppSimulatorDefaultNumber(value, { source: 'bom' });
const manualNumber = (value: number | null) =>
    hppSimulatorManualNumber(value);

function scenario(
    overrides: Partial<HppSimulatorScenarioInput> = {},
): HppSimulatorScenarioInput {
    return {
        id: 'scenario-1',
        name: 'Baseline',
        bom: {
            id: 'bom-straw',
            name: 'Sedotan 100 pcs',
            outputQuantity: defaultNumber(100),
            primaryOutputUnit: 'PCS',
        },
        materials: [
            {
                id: 'resin',
                name: 'Resin',
                formula: 'bom-material',
                quantity: defaultNumber(2),
                unitCost: defaultNumber(10_000),
                scrapPercentage: defaultNumber(5),
                primaryUnit: 'KG',
            },
            {
                id: 'wrapper',
                name: 'Wrapper',
                formula: 'bom-material',
                quantity: defaultNumber(100),
                unitCost: defaultNumber(10),
                scrapPercentage: defaultNumber(0),
                primaryUnit: 'PCS',
            },
        ],
        components: [],
        targetMarginPercent: hppSimulatorDefaultMargin(),
        ...overrides,
    };
}

function validationCode(run: () => unknown) {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(HppSimulatorValidationError);
        return (error as HppSimulatorValidationError).code;
    }
    throw new Error('Expected HppSimulatorValidationError');
}

describe('HPP price simulator cost policy', () => {
    it('uses positive INTERNAL weighted average before standard cost and exposes candidates', () => {
        const resolved = resolveHppSimulatorUnitCost({
            inventories: [
                {
                    locationType: 'INTERNAL',
                    quantity: 10,
                    averageCost: 100,
                },
                {
                    locationType: 'INTERNAL',
                    quantity: 5,
                    averageCost: 160,
                },
                {
                    locationType: 'CUSTOMER_OWNED',
                    quantity: 1_000,
                    averageCost: 1,
                },
                {
                    locationType: 'INTERNAL',
                    quantity: 0,
                    averageCost: null,
                },
                {
                    locationType: 'INTERNAL',
                    quantity: -2,
                    averageCost: null,
                },
            ],
            standardCost: 90,
            buyPrice: 80,
        });

        expect(resolved.value).toBe(120);
        expect(resolved.metadata.source).toBe('inventory_average');
        expect(resolved.metadata.candidates?.inventoryAverage).toMatchObject({
            status: 'selected',
            positiveInternalRowCount: 2,
            excludedCustomerOwnedRowCount: 1,
            excludedNonPositiveQuantityRowCount: 2,
            totalQuantity: 15,
            totalValue: 1_800,
        });
        expect(resolved.metadata.candidates?.standardCost).toEqual({
            status: 'available',
            value: 90,
            reason: null,
        });
    });

    it('invalidates the entire inventory candidate when one positive INTERNAL row has invalid cost', () => {
        for (const invalidCost of [null, 0, -1, Number.NaN, Infinity]) {
            const resolved = resolveHppSimulatorUnitCost({
                inventories: [
                    {
                        locationType: 'INTERNAL',
                        quantity: 3,
                        averageCost: 100,
                    },
                    {
                        locationType: 'INTERNAL',
                        quantity: 1,
                        averageCost: invalidCost,
                    },
                ],
                standardCost: 75,
                buyPrice: 70,
            });

            expect(resolved).toMatchObject({
                value: 75,
                metadata: {
                    source: 'standard_cost',
                    candidates: {
                        inventoryAverage: {
                            status: 'invalid',
                            reason: 'invalid_positive_internal_average_cost',
                        },
                        standardCost: { status: 'selected', value: 75 },
                    },
                },
            });
        }
    });

    it('falls back standard cost then buy price and preserves missing as null', () => {
        expect(
            resolveHppSimulatorUnitCost({
                inventories: [],
                standardCost: 0,
                buyPrice: 50,
            }),
        ).toMatchObject({ value: 50, metadata: { source: 'buy_price' } });
        expect(
            resolveHppSimulatorUnitCost({
                inventories: [],
                standardCost: null,
                buyPrice: null,
            }),
        ).toMatchObject({ value: null, metadata: { source: 'missing' } });
    });

    it('warns for low-stock inventory outliers without replacing their source', () => {
        const resolved = resolveHppSimulatorUnitCost({
            inventories: [
                {
                    locationType: 'INTERNAL',
                    quantity: 1,
                    averageCost: 330,
                },
            ],
            standardCost: 150,
            buyPrice: null,
        });

        expect(resolved.metadata.source).toBe('inventory_average');
        expect(resolved.metadata.warnings).toEqual([
            'low_internal_stock',
            'inventory_standard_cost_gap',
            'low_stock_cost_outlier',
        ]);
    });
});

describe('HPP price simulator calculator', () => {
    it('calculates BOM material per outputQuantity while retaining mixed-unit metadata', () => {
        const result = calculateHppSimulatorScenario(scenario());

        expect(result.status).toBe('complete');
        expect(result.bom).toEqual({
            id: 'bom-straw',
            name: 'Sedotan 100 pcs',
            outputQuantity: 100,
            primaryOutputUnit: 'PCS',
        });
        expect(result.materialResults).toMatchObject([
            {
                id: 'resin',
                inputUnit: 'KG',
                outputUnit: 'PCS',
                costPerOutput: 210,
            },
            {
                id: 'wrapper',
                inputUnit: 'PCS',
                outputUnit: 'PCS',
                costPerOutput: 10,
            },
        ]);
        expect(result.hppPerOutput).toBe(220);
    });

    it('calculates labor per shift and all dynamic component formulas', () => {
        const result = calculateHppSimulatorScenario(
            scenario({
                materials: [],
                bom: {
                    id: 'bom-1',
                    name: 'One output',
                    outputQuantity: defaultNumber(1),
                    primaryOutputUnit: 'PCS',
                },
                components: [
                    {
                        id: 'material-extra',
                        name: 'Extra packaging',
                        formula: 'quantity-times-unit-cost',
                        category: 'material',
                        quantity: manualNumber(2),
                        unitCost: manualNumber(50),
                        quantityUnit: 'PCS',
                    },
                    {
                        id: 'labor',
                        name: 'Labor',
                        formula: 'batch-cost-per-good-output',
                        category: 'conversion',
                        batchQuantity: manualNumber(4),
                        costPerBatchUnit: manualNumber(120_000),
                        goodOutputQuantity: manualNumber(1_000),
                        batchUnit: 'PERSON_PER_SHIFT',
                    },
                    {
                        id: 'machine',
                        name: 'Machine',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        costPerOutput: manualNumber(20),
                    },
                ],
            }),
        );

        expect(result.partialMaterialCostPerOutput).toBe(100);
        expect(result.partialConversionCostPerOutput).toBe(500);
        expect(result.componentResults.map((item) => item.costPerOutput)).toEqual(
            [100, 480, 20],
        );
        expect(result.hppPerOutput).toBe(600);
    });

    it('applies percentage overhead only to the pre-overhead subtotal', () => {
        const result = calculateHppSimulatorScenario(
            scenario({
                materials: [],
                bom: {
                    id: 'bom-1',
                    name: 'One output',
                    outputQuantity: defaultNumber(1),
                    primaryOutputUnit: 'PCS',
                },
                components: [
                    {
                        id: 'base',
                        name: 'Base conversion',
                        formula: 'fixed-per-output',
                        category: 'conversion',
                        costPerOutput: manualNumber(1_000),
                    },
                    {
                        id: 'overhead-a',
                        name: 'Overhead A',
                        formula: 'percentage-of-pre-overhead',
                        percentage: manualNumber(10),
                    },
                    {
                        id: 'overhead-b',
                        name: 'Overhead B',
                        formula: 'percentage-of-pre-overhead',
                        percentage: manualNumber(5),
                    },
                ],
            }),
        );

        expect(result.partialPreOverheadSubtotalPerOutput).toBe(1_000);
        expect(result.partialOverheadCostPerOutput).toBe(150);
        expect(result.hppPerOutput).toBe(1_150);
    });

    it('uses margin rather than markup and calculates actual profit and margin from sale price', () => {
        const result = calculateHppSimulatorScenario(
            scenario({ salePrice: manualNumber(400) }),
        );

        expect(HPP_SIMULATOR_DEFAULT_MARGIN_PERCENT).toBe(15);
        expect(result.targetMarginPercent).toBe(15);
        expect(result.targetPricePerOutput).toBeCloseTo(220 / 0.85, 12);
        expect(result.targetPricePerOutput).not.toBe(220 * 1.15);
        expect(result.salePricePerOutput).toBe(400);
        expect(result.actualProfitPerOutput).toBe(180);
        expect(result.actualMarginPercent).toBe(45);
    });

    it('keeps HPP and actual sale metrics available when optional target margin is blank', () => {
        const result = calculateHppSimulatorScenario(
            scenario({
                targetMarginPercent: manualNumber(null),
                salePrice: manualNumber(400),
            }),
        );

        expect(result.status).toBe('complete');
        expect(result.hppPerOutput).toBe(220);
        expect(result.missingInputs).toContain('targetMarginPercent');
        expect(result.targetPricePerOutput).toBeNull();
        expect(result.actualProfitPerOutput).toBe(180);
        expect(result.actualMarginPercent).toBe(45);
    });

    it('keeps missing cost null/incomplete while exposing partial subtotal', () => {
        const input = scenario();
        input.materials[0].unitCost = hppSimulatorDefaultNumber(null, {
            source: 'missing',
        });

        const result = calculateHppSimulatorScenario(input);

        expect(result.status).toBe('incomplete');
        expect(result.materialResults[0].costPerOutput).toBeNull();
        expect(result.missingInputs).toContain('materials[0].unitCost');
        expect(result.partialMaterialCostPerOutput).toBe(10);
        expect(result.partialHppPerOutput).toBe(10);
        expect(result.hppPerOutput).toBeNull();
        expect(result.targetPricePerOutput).toBeNull();
    });

    it('does not calculate percentage overhead from an incomplete pre-overhead base', () => {
        const input = scenario({
            components: [
                {
                    id: 'overhead',
                    name: 'Overhead',
                    formula: 'percentage-of-pre-overhead',
                    percentage: manualNumber(10),
                },
            ],
        });
        input.materials[0].unitCost = hppSimulatorDefaultNumber(null, {
            source: 'missing',
        });

        const result = calculateHppSimulatorScenario(input);

        expect(result.status).toBe('incomplete');
        expect(result.componentResults[0].costPerOutput).toBeNull();
        expect(result.partialOverheadCostPerOutput).toBe(0);
    });

    it('accepts explicit manual zero and reset restores its deterministic default metadata', () => {
        const defaultSnapshot = resolveHppSimulatorUnitCost({
            inventories: [],
            standardCost: 250,
            buyPrice: 200,
        });
        const override = hppSimulatorManualNumber(0, defaultSnapshot);
        const input = scenario({
            materials: [
                {
                    id: 'free-material',
                    name: 'Free material',
                    formula: 'bom-material',
                    quantity: defaultNumber(1),
                    unitCost: override,
                    scrapPercentage: defaultNumber(0),
                    primaryUnit: 'KG',
                },
            ],
        });

        const result = calculateHppSimulatorScenario(input);
        expect(result.status).toBe('complete');
        expect(result.materialResults[0]).toMatchObject({
            costPerOutput: 0,
            hasExplicitManualZero: true,
        });
        expect(isHppSimulatorManualZero(override)).toBe(true);

        const reset = resetHppSimulatorNumber(override);
        expect(reset).toEqual({ mode: 'default', defaultSnapshot });
        expect(calculateHppSimulatorScenario({
            ...input,
            materials: [{ ...input.materials[0], unitCost: reset }],
        }).materialResults[0]).toMatchObject({
            costPerOutput: 2.5,
            hasExplicitManualZero: false,
        });
    });

    it('does not round intermediate calculations', () => {
        const result = calculateHppSimulatorScenario(
            scenario({
                materials: [
                    {
                        id: 'precise',
                        name: 'Precise',
                        formula: 'bom-material',
                        quantity: manualNumber(1),
                        unitCost: manualNumber(1),
                        scrapPercentage: manualNumber(0),
                        primaryUnit: 'KG',
                    },
                ],
                bom: {
                    id: 'bom-3',
                    name: 'Three outputs',
                    outputQuantity: manualNumber(3),
                    primaryOutputUnit: 'PCS',
                },
                targetMarginPercent: manualNumber(10),
            }),
        );

        expect(result.hppPerOutput).toBe(1 / 3);
        expect(result.targetPricePerOutput).toBe((1 / 3) / 0.9);
    });

    it('keeps up to three scenario results isolated and rejects a fourth', () => {
        const scenarios = [
            scenario({ id: 'a', name: 'A' }),
            scenario({
                id: 'b',
                name: 'B',
                bom: {
                    id: 'bom-b',
                    name: 'BOM B',
                    outputQuantity: defaultNumber(50),
                    primaryOutputUnit: 'PACK',
                },
            }),
            scenario({ id: 'c', name: 'C' }),
        ];
        const results = calculateHppSimulatorScenarios(scenarios);

        expect(results.map((result) => result.id)).toEqual(['a', 'b', 'c']);
        expect(results[1].bom).toMatchObject({
            id: 'bom-b',
            outputQuantity: 50,
            primaryOutputUnit: 'PACK',
        });
        expect(validationCode(() =>
            calculateHppSimulatorScenarios([
                ...scenarios,
                scenario({ id: 'd', name: 'D' }),
            ]),
        )).toBe('SCENARIO_LIMIT');
    });

    it.each([
        ['negative quantity', () => {
            const input = scenario();
            input.materials[0].quantity = manualNumber(-1);
            return calculateHppSimulatorScenario(input);
        }, 'NEGATIVE'],
        ['NaN', () => {
            const input = scenario();
            input.materials[0].quantity = manualNumber(Number.NaN);
            return calculateHppSimulatorScenario(input);
        }, 'NON_FINITE'],
        ['Infinity', () => {
            const input = scenario();
            input.materials[0].unitCost = manualNumber(Infinity);
            return calculateHppSimulatorScenario(input);
        }, 'NON_FINITE'],
        ['zero BOM output', () => calculateHppSimulatorScenario(scenario({
            bom: {
                id: 'bom-zero',
                name: 'Zero',
                outputQuantity: manualNumber(0),
                primaryOutputUnit: 'PCS',
            },
        })), 'ZERO_DENOMINATOR'],
        ['zero labor output', () => calculateHppSimulatorScenario(scenario({
            components: [{
                id: 'labor',
                name: 'Labor',
                formula: 'batch-cost-per-good-output',
                category: 'conversion',
                batchQuantity: manualNumber(2),
                costPerBatchUnit: manualNumber(100),
                goodOutputQuantity: manualNumber(0),
                batchUnit: 'PERSON_PER_SHIFT',
            }],
        })), 'ZERO_DENOMINATOR'],
        ['margin 100', () => calculateHppSimulatorScenario(scenario({
            targetMarginPercent: manualNumber(100),
        })), 'INVALID_MARGIN'],
        ['zero sale price', () => calculateHppSimulatorScenario(scenario({
            salePrice: manualNumber(0),
        })), 'ZERO_DENOMINATOR'],
        ['implicit default zero cost', () => {
            const input = scenario();
            input.materials[0].unitCost = defaultNumber(0);
            return calculateHppSimulatorScenario(input);
        }, 'DEFAULT_ZERO_COST'],
        ['overflow result', () => {
            const input = scenario();
            input.materials[0].quantity = manualNumber(Number.MAX_VALUE);
            input.materials[0].unitCost = manualNumber(2);
            return calculateHppSimulatorScenario(input);
        }, 'NON_FINITE_RESULT'],
    ] as const)('rejects %s', (_name, run, code) => {
        expect(validationCode(run)).toBe(code);
    });
});
