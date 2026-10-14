export const HPP_SIMULATOR_DEFAULT_MARGIN_PERCENT = 15;
export const HPP_SIMULATOR_MAX_SCENARIOS = 3;

export type HppSimulatorDefaultSource =
    | 'bom'
    | 'inventory_average'
    | 'standard_cost'
    | 'buy_price'
    | 'simulator_assumption'
    | 'missing';

export type HppSimulatorCostSource = Extract<
    HppSimulatorDefaultSource,
    'inventory_average' | 'standard_cost' | 'buy_price' | 'missing'
>;

export type HppSimulatorCostCandidateStatus =
    | 'selected'
    | 'available'
    | 'invalid'
    | 'missing';

export type HppSimulatorCostCandidateReason =
    | 'not_provided'
    | 'not_positive_finite'
    | 'no_positive_internal_inventory'
    | 'invalid_positive_internal_average_cost'
    | 'non_finite_inventory_value';

export type HppSimulatorCostWarning =
    | 'low_internal_stock'
    | 'inventory_standard_cost_gap'
    | 'low_stock_cost_outlier';

export interface HppSimulatorScalarCostCandidate {
    status: HppSimulatorCostCandidateStatus;
    value: number | null;
    reason: HppSimulatorCostCandidateReason | null;
}

export interface HppSimulatorInventoryCostCandidate
    extends HppSimulatorScalarCostCandidate {
    positiveInternalRowCount: number;
    excludedCustomerOwnedRowCount: number;
    excludedNonPositiveQuantityRowCount: number;
    excludedInvalidQuantityRowCount: number;
    totalQuantity: number;
    totalValue: number;
}

export interface HppSimulatorCostCandidates {
    inventoryAverage: HppSimulatorInventoryCostCandidate;
    standardCost: HppSimulatorScalarCostCandidate;
    buyPrice: HppSimulatorScalarCostCandidate;
}

export interface HppSimulatorDefaultMetadata {
    source: HppSimulatorDefaultSource;
    candidates?: HppSimulatorCostCandidates;
    warnings?: HppSimulatorCostWarning[];
}

export interface HppSimulatorNumberDefaultSnapshot {
    value: number | null;
    metadata: HppSimulatorDefaultMetadata;
}

export type HppSimulatorNumberInput =
    | {
          mode: 'default';
          defaultSnapshot: HppSimulatorNumberDefaultSnapshot;
      }
    | {
          mode: 'manual';
          value: number | null;
          defaultSnapshot: HppSimulatorNumberDefaultSnapshot | null;
      };

export interface HppSimulatorInventoryBalance {
    locationType: 'INTERNAL' | 'CUSTOMER_OWNED';
    quantity: number;
    averageCost: number | null;
}

export interface HppSimulatorCostPolicyInput {
    inventories: readonly HppSimulatorInventoryBalance[];
    standardCost: number | null;
    buyPrice: number | null;
}

export type HppSimulatorValidationCode =
    | 'NON_FINITE'
    | 'NEGATIVE'
    | 'ZERO_DENOMINATOR'
    | 'INVALID_MARGIN'
    | 'DEFAULT_ZERO_COST'
    | 'NON_FINITE_RESULT'
    | 'SCENARIO_LIMIT';

export class HppSimulatorValidationError extends Error {
    constructor(
        public readonly code: HppSimulatorValidationCode,
        public readonly path: string,
        message: string,
    ) {
        super(message);
        this.name = 'HppSimulatorValidationError';
    }
}

export type HppSimulatorCostCategory = 'material' | 'conversion';

interface HppSimulatorComponentBase {
    id: string;
    name: string;
}

export interface HppSimulatorBomMaterialComponent
    extends HppSimulatorComponentBase {
    formula: 'bom-material';
    quantity: HppSimulatorNumberInput;
    unitCost: HppSimulatorNumberInput;
    scrapPercentage: HppSimulatorNumberInput;
    primaryUnit: string;
}

export interface HppSimulatorQuantityUnitCostComponent
    extends HppSimulatorComponentBase {
    formula: 'quantity-times-unit-cost';
    category: HppSimulatorCostCategory;
    quantity: HppSimulatorNumberInput;
    unitCost: HppSimulatorNumberInput;
    quantityUnit: string;
}

export interface HppSimulatorBatchCostComponent
    extends HppSimulatorComponentBase {
    formula: 'batch-cost-per-good-output';
    category: HppSimulatorCostCategory;
    batchQuantity: HppSimulatorNumberInput;
    costPerBatchUnit: HppSimulatorNumberInput;
    goodOutputQuantity: HppSimulatorNumberInput;
    batchUnit: string;
}

export interface HppSimulatorFixedCostComponent
    extends HppSimulatorComponentBase {
    formula: 'fixed-per-output';
    category: HppSimulatorCostCategory;
    costPerOutput: HppSimulatorNumberInput;
}

export interface HppSimulatorPercentageOverheadComponent
    extends HppSimulatorComponentBase {
    formula: 'percentage-of-pre-overhead';
    percentage: HppSimulatorNumberInput;
}

export type HppSimulatorDynamicComponent =
    | HppSimulatorQuantityUnitCostComponent
    | HppSimulatorBatchCostComponent
    | HppSimulatorFixedCostComponent
    | HppSimulatorPercentageOverheadComponent;

export interface HppSimulatorScenarioInput {
    id: string;
    name: string;
    bom: {
        id: string;
        name: string;
        outputQuantity: HppSimulatorNumberInput;
        primaryOutputUnit: string;
    };
    materials: readonly HppSimulatorBomMaterialComponent[];
    components: readonly HppSimulatorDynamicComponent[];
    targetMarginPercent: HppSimulatorNumberInput;
    salePrice?: HppSimulatorNumberInput;
}

export interface HppSimulatorComponentResult {
    id: string;
    name: string;
    formula:
        | HppSimulatorBomMaterialComponent['formula']
        | HppSimulatorDynamicComponent['formula'];
    category: HppSimulatorCostCategory | 'overhead';
    inputUnit: string | null;
    outputUnit: string;
    costPerOutput: number | null;
    missingFields: string[];
    hasExplicitManualZero: boolean;
}

export interface HppSimulatorScenarioResult {
    id: string;
    name: string;
    status: 'complete' | 'incomplete';
    bom: {
        id: string;
        name: string;
        outputQuantity: number | null;
        primaryOutputUnit: string;
    };
    materialResults: HppSimulatorComponentResult[];
    componentResults: HppSimulatorComponentResult[];
    missingInputs: string[];
    partialMaterialCostPerOutput: number;
    partialConversionCostPerOutput: number;
    partialPreOverheadSubtotalPerOutput: number;
    partialOverheadCostPerOutput: number;
    partialHppPerOutput: number;
    hppPerOutput: number | null;
    targetMarginPercent: number | null;
    targetPricePerOutput: number | null;
    salePricePerOutput: number | null;
    actualProfitPerOutput: number | null;
    actualMarginPercent: number | null;
}

const LOW_STOCK_QUANTITY_THRESHOLD = 2;
const COST_GAP_RATIO_THRESHOLD = 0.2;

export function hppSimulatorDefaultNumber(
    value: number | null,
    metadata: HppSimulatorDefaultMetadata,
): HppSimulatorNumberInput {
    return {
        mode: 'default',
        defaultSnapshot: { value, metadata },
    };
}

export function hppSimulatorManualNumber(
    value: number | null,
    defaultSnapshot: HppSimulatorNumberDefaultSnapshot | null = null,
): HppSimulatorNumberInput {
    return { mode: 'manual', value, defaultSnapshot };
}

export function resetHppSimulatorNumber(
    input: HppSimulatorNumberInput,
): HppSimulatorNumberInput {
    if (input.defaultSnapshot === null) {
        return hppSimulatorManualNumber(null);
    }
    return { mode: 'default', defaultSnapshot: input.defaultSnapshot };
}

export function isHppSimulatorManualZero(
    input: HppSimulatorNumberInput,
): boolean {
    return input.mode === 'manual' && input.value === 0;
}

export function hppSimulatorDefaultMargin(): HppSimulatorNumberInput {
    return hppSimulatorDefaultNumber(HPP_SIMULATOR_DEFAULT_MARGIN_PERCENT, {
        source: 'simulator_assumption',
    });
}

/**
 * Simulator-only cost policy. Selling prices are intentionally absent from the
 * input so they cannot become a hidden cost fallback.
 */
export function resolveHppSimulatorUnitCost(
    input: HppSimulatorCostPolicyInput,
): HppSimulatorNumberDefaultSnapshot {
    const inventoryAverage = resolveInventoryAverage(input.inventories);
    const standardCost = scalarCostCandidate(input.standardCost);
    const buyPrice = scalarCostCandidate(input.buyPrice);

    let source: HppSimulatorCostSource = 'missing';
    let value: number | null = null;

    if (inventoryAverage.status === 'available') {
        source = 'inventory_average';
        value = inventoryAverage.value;
        inventoryAverage.status = 'selected';
    } else if (standardCost.status === 'available') {
        source = 'standard_cost';
        value = standardCost.value;
        standardCost.status = 'selected';
    } else if (buyPrice.status === 'available') {
        source = 'buy_price';
        value = buyPrice.value;
        buyPrice.status = 'selected';
    }

    const warnings = costWarnings(inventoryAverage, standardCost);

    return {
        value,
        metadata: {
            source,
            candidates: { inventoryAverage, standardCost, buyPrice },
            warnings,
        },
    };
}

export function calculateHppSimulatorScenario(
    scenario: HppSimulatorScenarioInput,
): HppSimulatorScenarioResult {
    const missingInputs: string[] = [];
    const outputQuantityPath = 'bom.outputQuantity';
    const outputQuantity = readNumber(
        scenario.bom.outputQuantity,
        outputQuantityPath,
    );
    rejectZeroDenominator(outputQuantity, outputQuantityPath);

    let partialMaterialCostPerOutput = 0;
    const materialResults = scenario.materials.map((material, index) => {
        const basePath = `materials[${index}]`;
        const missingFields: string[] = [];
        const quantity = readComponentNumber(
            material.quantity,
            `${basePath}.quantity`,
            missingFields,
        );
        const unitCost = readComponentNumber(
            material.unitCost,
            `${basePath}.unitCost`,
            missingFields,
            true,
        );
        const scrapPercentage = readComponentNumber(
            material.scrapPercentage,
            `${basePath}.scrapPercentage`,
            missingFields,
        );
        if (outputQuantity === null) missingFields.push(outputQuantityPath);

        const costPerOutput =
            quantity === null ||
            unitCost === null ||
            scrapPercentage === null ||
            outputQuantity === null
                ? null
                : finiteResult(
                      (quantity * unitCost * (1 + scrapPercentage / 100)) /
                          outputQuantity,
                      `${basePath}.costPerOutput`,
                  );

        if (costPerOutput !== null) {
            partialMaterialCostPerOutput = finiteResult(
                partialMaterialCostPerOutput + costPerOutput,
                'partialMaterialCostPerOutput',
            );
        }
        missingInputs.push(...missingFields);

        return {
            id: material.id,
            name: material.name,
            formula: material.formula,
            category: 'material' as const,
            inputUnit: material.primaryUnit,
            outputUnit: scenario.bom.primaryOutputUnit,
            costPerOutput,
            missingFields,
            hasExplicitManualZero: isHppSimulatorManualZero(
                material.unitCost,
            ),
        };
    });

    let partialDynamicMaterialCostPerOutput = 0;
    let partialConversionCostPerOutput = 0;
    const percentageComponents: Array<{
        component: HppSimulatorPercentageOverheadComponent;
        index: number;
    }> = [];
    const componentResults: HppSimulatorComponentResult[] = [];

    scenario.components.forEach((component, index) => {
        if (component.formula === 'percentage-of-pre-overhead') {
            percentageComponents.push({ component, index });
            return;
        }

        const result = calculateNonPercentageComponent(
            component,
            index,
            scenario.bom.primaryOutputUnit,
        );
        componentResults.push(result);
        missingInputs.push(...result.missingFields);

        if (result.costPerOutput !== null) {
            if (result.category === 'material') {
                partialDynamicMaterialCostPerOutput = finiteResult(
                    partialDynamicMaterialCostPerOutput +
                        result.costPerOutput,
                    'partialDynamicMaterialCostPerOutput',
                );
            } else {
                partialConversionCostPerOutput = finiteResult(
                    partialConversionCostPerOutput + result.costPerOutput,
                    'partialConversionCostPerOutput',
                );
            }
        }
    });

    partialMaterialCostPerOutput = finiteResult(
        partialMaterialCostPerOutput + partialDynamicMaterialCostPerOutput,
        'partialMaterialCostPerOutput',
    );
    const partialPreOverheadSubtotalPerOutput = finiteResult(
        partialMaterialCostPerOutput + partialConversionCostPerOutput,
        'partialPreOverheadSubtotalPerOutput',
    );

    let partialOverheadCostPerOutput = 0;
    const isPreOverheadIncomplete = missingInputs.length > 0;
    for (const { component, index } of percentageComponents) {
        const basePath = `components[${index}]`;
        const missingFields: string[] = [];
        const percentage = readComponentNumber(
            component.percentage,
            `${basePath}.percentage`,
            missingFields,
        );
        const costPerOutput =
            percentage === null || isPreOverheadIncomplete
                ? null
                : finiteResult(
                      partialPreOverheadSubtotalPerOutput *
                          (percentage / 100),
                      `${basePath}.costPerOutput`,
                  );
        if (costPerOutput !== null) {
            partialOverheadCostPerOutput = finiteResult(
                partialOverheadCostPerOutput + costPerOutput,
                'partialOverheadCostPerOutput',
            );
        }
        missingInputs.push(...missingFields);
        componentResults.push({
            id: component.id,
            name: component.name,
            formula: component.formula,
            category: 'overhead',
            inputUnit: null,
            outputUnit: scenario.bom.primaryOutputUnit,
            costPerOutput,
            missingFields,
            hasExplicitManualZero: isHppSimulatorManualZero(
                component.percentage,
            ),
        });
    }

    const partialHppPerOutput = finiteResult(
        partialPreOverheadSubtotalPerOutput +
            partialOverheadCostPerOutput,
        'partialHppPerOutput',
    );

    const targetMarginPercent = readNumber(
        scenario.targetMarginPercent,
        'targetMarginPercent',
    );
    if (targetMarginPercent === null) {
        missingInputs.push('targetMarginPercent');
    } else if (targetMarginPercent >= 100) {
        throw new HppSimulatorValidationError(
            'INVALID_MARGIN',
            'targetMarginPercent',
            'Target margin must be below 100 percent.',
        );
    }

    const uniqueMissingInputs = Array.from(new Set(missingInputs));
    const hasMissingCostInput = uniqueMissingInputs.some(
        (path) => path !== 'targetMarginPercent',
    );
    const status = hasMissingCostInput ? 'incomplete' : 'complete';
    const hppPerOutput = status === 'complete' ? partialHppPerOutput : null;
    const targetPricePerOutput =
        hppPerOutput === null || targetMarginPercent === null
            ? null
            : finiteResult(
                  hppPerOutput / (1 - targetMarginPercent / 100),
                  'targetPricePerOutput',
              );

    const salePricePerOutput = scenario.salePrice
        ? readNumber(scenario.salePrice, 'salePrice')
        : null;
    if (salePricePerOutput === 0) {
        throw new HppSimulatorValidationError(
            'ZERO_DENOMINATOR',
            'salePrice',
            'Sale price must be greater than zero to calculate actual margin.',
        );
    }
    const actualProfitPerOutput =
        hppPerOutput === null || salePricePerOutput === null
            ? null
            : finiteResult(
                  salePricePerOutput - hppPerOutput,
                  'actualProfitPerOutput',
              );
    const actualMarginPercent =
        actualProfitPerOutput === null || salePricePerOutput === null
            ? null
            : finiteResult(
                  (actualProfitPerOutput / salePricePerOutput) * 100,
                  'actualMarginPercent',
              );

    return {
        id: scenario.id,
        name: scenario.name,
        status,
        bom: {
            id: scenario.bom.id,
            name: scenario.bom.name,
            outputQuantity,
            primaryOutputUnit: scenario.bom.primaryOutputUnit,
        },
        materialResults,
        componentResults,
        missingInputs: uniqueMissingInputs,
        partialMaterialCostPerOutput,
        partialConversionCostPerOutput,
        partialPreOverheadSubtotalPerOutput,
        partialOverheadCostPerOutput,
        partialHppPerOutput,
        hppPerOutput,
        targetMarginPercent,
        targetPricePerOutput,
        salePricePerOutput,
        actualProfitPerOutput,
        actualMarginPercent,
    };
}

export function calculateHppSimulatorScenarios(
    scenarios: readonly HppSimulatorScenarioInput[],
): HppSimulatorScenarioResult[] {
    if (scenarios.length > HPP_SIMULATOR_MAX_SCENARIOS) {
        throw new HppSimulatorValidationError(
            'SCENARIO_LIMIT',
            'scenarios',
            `At most ${HPP_SIMULATOR_MAX_SCENARIOS} scenarios can be compared.`,
        );
    }
    return scenarios.map(calculateHppSimulatorScenario);
}

function calculateNonPercentageComponent(
    component: Exclude<
        HppSimulatorDynamicComponent,
        HppSimulatorPercentageOverheadComponent
    >,
    index: number,
    outputUnit: string,
): HppSimulatorComponentResult {
    const basePath = `components[${index}]`;
    const missingFields: string[] = [];
    let costPerOutput: number | null;
    let inputUnit: string | null = null;
    let hasExplicitManualZero = false;

    switch (component.formula) {
        case 'quantity-times-unit-cost': {
            const quantity = readComponentNumber(
                component.quantity,
                `${basePath}.quantity`,
                missingFields,
            );
            const unitCost = readComponentNumber(
                component.unitCost,
                `${basePath}.unitCost`,
                missingFields,
                true,
            );
            costPerOutput =
                quantity === null || unitCost === null
                    ? null
                    : finiteResult(
                          quantity * unitCost,
                          `${basePath}.costPerOutput`,
                      );
            inputUnit = component.quantityUnit;
            hasExplicitManualZero = isHppSimulatorManualZero(
                component.unitCost,
            );
            break;
        }
        case 'batch-cost-per-good-output': {
            const batchQuantity = readComponentNumber(
                component.batchQuantity,
                `${basePath}.batchQuantity`,
                missingFields,
            );
            const costPerBatchUnit = readComponentNumber(
                component.costPerBatchUnit,
                `${basePath}.costPerBatchUnit`,
                missingFields,
                true,
            );
            const goodOutputQuantity = readComponentNumber(
                component.goodOutputQuantity,
                `${basePath}.goodOutputQuantity`,
                missingFields,
            );
            rejectZeroDenominator(
                goodOutputQuantity,
                `${basePath}.goodOutputQuantity`,
            );
            costPerOutput =
                batchQuantity === null ||
                costPerBatchUnit === null ||
                goodOutputQuantity === null
                    ? null
                    : finiteResult(
                          (batchQuantity * costPerBatchUnit) /
                              goodOutputQuantity,
                          `${basePath}.costPerOutput`,
                      );
            inputUnit = component.batchUnit;
            hasExplicitManualZero = isHppSimulatorManualZero(
                component.costPerBatchUnit,
            );
            break;
        }
        case 'fixed-per-output': {
            costPerOutput = readComponentNumber(
                component.costPerOutput,
                `${basePath}.costPerOutput`,
                missingFields,
                true,
            );
            hasExplicitManualZero = isHppSimulatorManualZero(
                component.costPerOutput,
            );
            break;
        }
    }

    return {
        id: component.id,
        name: component.name,
        formula: component.formula,
        category: component.category,
        inputUnit,
        outputUnit,
        costPerOutput,
        missingFields,
        hasExplicitManualZero,
    };
}

function readComponentNumber(
    input: HppSimulatorNumberInput,
    path: string,
    missingFields: string[],
    zeroMustBeManual = false,
): number | null {
    const value = readNumber(input, path, zeroMustBeManual);
    if (value === null) missingFields.push(path);
    return value;
}

function readNumber(
    input: HppSimulatorNumberInput,
    path: string,
    zeroMustBeManual = false,
): number | null {
    const value =
        input.mode === 'default' ? input.defaultSnapshot.value : input.value;
    if (value === null) return null;
    if (!Number.isFinite(value)) {
        throw new HppSimulatorValidationError(
            'NON_FINITE',
            path,
            `${path} must be finite.`,
        );
    }
    if (value < 0) {
        throw new HppSimulatorValidationError(
            'NEGATIVE',
            path,
            `${path} cannot be negative.`,
        );
    }
    if (zeroMustBeManual && value === 0 && input.mode !== 'manual') {
        throw new HppSimulatorValidationError(
            'DEFAULT_ZERO_COST',
            path,
            `${path} can only be zero as an explicit manual override.`,
        );
    }
    return value;
}

function rejectZeroDenominator(value: number | null, path: string): void {
    if (value === 0) {
        throw new HppSimulatorValidationError(
            'ZERO_DENOMINATOR',
            path,
            `${path} must be greater than zero.`,
        );
    }
}

function finiteResult(value: number, path: string): number {
    if (!Number.isFinite(value)) {
        throw new HppSimulatorValidationError(
            'NON_FINITE_RESULT',
            path,
            `${path} produced a non-finite result.`,
        );
    }
    return value;
}

function scalarCostCandidate(
    value: number | null,
): HppSimulatorScalarCostCandidate {
    if (value === null) {
        return { status: 'missing', value: null, reason: 'not_provided' };
    }
    if (!Number.isFinite(value) || value <= 0) {
        return {
            status: 'invalid',
            value: null,
            reason: 'not_positive_finite',
        };
    }
    return { status: 'available', value, reason: null };
}

function resolveInventoryAverage(
    balances: readonly HppSimulatorInventoryBalance[],
): HppSimulatorInventoryCostCandidate {
    let excludedCustomerOwnedRowCount = 0;
    let excludedNonPositiveQuantityRowCount = 0;
    let excludedInvalidQuantityRowCount = 0;
    const positiveInternalRows: HppSimulatorInventoryBalance[] = [];

    for (const balance of balances) {
        if (balance.locationType === 'CUSTOMER_OWNED') {
            excludedCustomerOwnedRowCount += 1;
            continue;
        }
        if (!Number.isFinite(balance.quantity)) {
            excludedInvalidQuantityRowCount += 1;
            continue;
        }
        if (balance.quantity <= 0) {
            excludedNonPositiveQuantityRowCount += 1;
            continue;
        }
        positiveInternalRows.push(balance);
    }

    const base = {
        positiveInternalRowCount: positiveInternalRows.length,
        excludedCustomerOwnedRowCount,
        excludedNonPositiveQuantityRowCount,
        excludedInvalidQuantityRowCount,
    };

    if (positiveInternalRows.length === 0) {
        return {
            ...base,
            status: 'missing',
            value: null,
            reason: 'no_positive_internal_inventory',
            totalQuantity: 0,
            totalValue: 0,
        };
    }

    if (
        positiveInternalRows.some(
            (row) =>
                row.averageCost === null ||
                !Number.isFinite(row.averageCost) ||
                row.averageCost <= 0,
        )
    ) {
        return {
            ...base,
            status: 'invalid',
            value: null,
            reason: 'invalid_positive_internal_average_cost',
            totalQuantity: positiveInternalRows.reduce(
                (sum, row) => sum + row.quantity,
                0,
            ),
            totalValue: 0,
        };
    }

    const totalQuantity = positiveInternalRows.reduce(
        (sum, row) => sum + row.quantity,
        0,
    );
    const totalValue = positiveInternalRows.reduce(
        (sum, row) => sum + row.quantity * (row.averageCost as number),
        0,
    );
    const average = totalValue / totalQuantity;
    if (
        !Number.isFinite(totalQuantity) ||
        !Number.isFinite(totalValue) ||
        !Number.isFinite(average)
    ) {
        return {
            ...base,
            status: 'invalid',
            value: null,
            reason: 'non_finite_inventory_value',
            totalQuantity: 0,
            totalValue: 0,
        };
    }

    return {
        ...base,
        status: 'available',
        value: average,
        reason: null,
        totalQuantity,
        totalValue,
    };
}

function costWarnings(
    inventory: HppSimulatorInventoryCostCandidate,
    standard: HppSimulatorScalarCostCandidate,
): HppSimulatorCostWarning[] {
    if (inventory.status !== 'selected' || inventory.value === null) return [];

    const warnings: HppSimulatorCostWarning[] = [];
    const isLowStock =
        inventory.totalQuantity > 0 &&
        inventory.totalQuantity <= LOW_STOCK_QUANTITY_THRESHOLD;
    if (isLowStock) warnings.push('low_internal_stock');

    const hasStandard =
        (standard.status === 'available' || standard.status === 'selected') &&
        standard.value !== null;
    const hasGap =
        hasStandard &&
        Math.abs(inventory.value - (standard.value as number)) /
            (standard.value as number) >=
            COST_GAP_RATIO_THRESHOLD;
    if (hasGap) warnings.push('inventory_standard_cost_gap');
    if (isLowStock && hasGap) warnings.push('low_stock_cost_outlier');
    return warnings;
}
