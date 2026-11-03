import {
    HppSimulatorValidationError,
    calculateHppSimulatorScenario,
    hppSimulatorManualNumber as manual,
    type HppSimulatorBomMaterialComponent,
    type HppSimulatorDynamicComponent,
    type HppSimulatorScenarioResult,
} from '@/lib/production/hpp-price-simulator';
import { materialSourceTag } from './material-source';
import { orderStages } from './stage-graph';
import type {
    OwnerHppCost,
    OwnerHppScenario,
    OwnerHppStage,
} from './workspace-schema';

export type StageStatus = 'complete' | 'incomplete' | 'blocked';

export interface StageResult {
    stageId: string;
    name: string;
    outputUnit: string;
    status: StageStatus;
    hppPerOutput: number | null;
    /** HPP minus the upstream cost carried in (scrap included here). */
    addedCostPerOutput: number | null;
    /** Share of the final HPP that originates in this stage; null if unused. */
    contributionPct: number | null;
    materialSubtotalPerOutput: number | null;
    materialCostById: Readonly<Record<string, number | null>>;
    costById: Readonly<Record<string, number | null>>;
    warnings: readonly string[];
    message: string | null;
}

export interface ScenarioResult {
    error: string | null;
    stages: StageResult[];
    finalStageId: string;
    finalHpp: number | null;
    finalUnit: string;
    sellPrice: number | null;
    profitPerOutput: number | null;
    marginPercent: number | null;
}

const NO_TARGET_MARGIN = manual(0);

function emptyResult(scenario: OwnerHppScenario, error: string): ScenarioResult {
    return {
        error,
        stages: [],
        finalStageId: scenario.finalStageId,
        finalHpp: null,
        finalUnit: '',
        sellPrice: scenario.sellPrice,
        profitPerOutput: null,
        marginPercent: null,
    };
}

function blockedStage(
    stage: OwnerHppStage,
    message: string,
    warnings: readonly string[] = [],
): StageResult {
    return {
        stageId: stage.id,
        name: stage.name,
        outputUnit: stage.outputUnit,
        status: 'blocked',
        hppPerOutput: null,
        addedCostPerOutput: null,
        contributionPct: null,
        materialSubtotalPerOutput: null,
        materialCostById: {},
        costById: {},
        warnings,
        message,
    };
}

function toEngineCost(cost: OwnerHppCost): HppSimulatorDynamicComponent {
    switch (cost.formula) {
        case 'fixed-per-output':
            return {
                id: cost.id,
                name: cost.label,
                formula: cost.formula,
                category: cost.category,
                costPerOutput: manual(cost.value),
            };
        case 'quantity-times-unit-cost':
            return {
                id: cost.id,
                name: cost.label,
                formula: cost.formula,
                category: cost.category,
                quantity: manual(cost.quantity),
                unitCost: manual(cost.unitCost),
                quantityUnit: cost.unit,
            };
        case 'batch-cost-per-good-output':
            return {
                id: cost.id,
                name: cost.label,
                formula: cost.formula,
                category: cost.category,
                batchQuantity: manual(cost.batchQuantity),
                costPerBatchUnit: manual(cost.costPerBatchUnit),
                goodOutputQuantity: manual(cost.goodOutputQuantity),
                batchUnit: cost.batchUnit,
            };
        case 'percentage-of-pre-overhead':
            return {
                id: cost.id,
                name: cost.label,
                formula: cost.formula,
                percentage: manual(cost.percentage),
            };
    }
}

function costMap(
    rows: ReadonlyArray<{ id: string; costPerOutput: number | null }>,
): Record<string, number | null> {
    return Object.fromEntries(rows.map((row) => [row.id, row.costPerOutput]));
}

function calculateStage(
    stage: OwnerHppStage,
    done: ReadonlyMap<string, StageResult>,
): StageResult {
    const warnings: string[] = [];
    const materials: HppSimulatorBomMaterialComponent[] = [];
    let carriedPerOutput = 0;

    for (const material of stage.materials) {
        if (material.kind === 'raw') {
            if (materialSourceTag(material) === 'empty') {
                warnings.push(`Harga "${material.name}" masih kosong.`);
            }
            materials.push({
                id: material.id,
                name: material.name,
                formula: 'bom-material',
                quantity: manual(material.qty),
                unitCost: manual(material.price),
                scrapPercentage: manual(material.scrapPercent),
                primaryUnit: material.unit,
            });
            continue;
        }

        const upstream = done.get(material.from);
        if (!upstream || upstream.hppPerOutput === null) {
            return blockedStage(
                stage,
                `Menunggu tahap "${upstream?.name ?? material.from}" yang belum lengkap.`,
                warnings,
            );
        }
        carriedPerOutput +=
            (material.qty * upstream.hppPerOutput) / stage.outputQty;
        materials.push({
            id: material.id,
            name: `Dari tahap ${upstream.name}`,
            formula: 'bom-material',
            quantity: manual(material.qty),
            unitCost: manual(upstream.hppPerOutput),
            scrapPercentage: manual(material.scrapPercent),
            primaryUnit: upstream.outputUnit,
        });
    }

    let engine: HppSimulatorScenarioResult;
    try {
        engine = calculateHppSimulatorScenario({
            id: stage.id,
            name: stage.name,
            bom: {
                id: stage.id,
                name: stage.name,
                outputQuantity: manual(stage.outputQty),
                primaryOutputUnit: stage.outputUnit,
            },
            materials,
            components: stage.costs.map(toEngineCost),
            targetMarginPercent: NO_TARGET_MARGIN,
        });
    } catch (error) {
        if (error instanceof HppSimulatorValidationError) {
            return blockedStage(stage, error.message, warnings);
        }
        throw error;
    }

    const hpp = engine.hppPerOutput;
    return {
        stageId: stage.id,
        name: stage.name,
        outputUnit: stage.outputUnit,
        status: engine.status,
        hppPerOutput: hpp,
        addedCostPerOutput: hpp === null ? null : hpp - carriedPerOutput,
        contributionPct: null,
        materialSubtotalPerOutput: engine.partialMaterialCostPerOutput,
        materialCostById: costMap(engine.materialResults),
        costById: costMap(engine.componentResults),
        warnings,
        message: null,
    };
}

/**
 * How many units of each stage's own (added) cost end up in one unit of the
 * final output. Summed over every path, so a stage feeding two consumers is
 * counted once per path and the contributions still add up to the final HPP.
 */
function flowMultipliers(
    order: readonly OwnerHppStage[],
    finalStageId: string,
): Map<string, number> {
    const multiplier = new Map<string, number>([[finalStageId, 1]]);
    for (const stage of [...order].reverse()) {
        const own = multiplier.get(stage.id) ?? 0;
        if (own === 0) continue;
        for (const material of stage.materials) {
            if (material.kind !== 'stage') continue;
            multiplier.set(
                material.from,
                (multiplier.get(material.from) ?? 0) +
                    (own * material.qty) / stage.outputQty,
            );
        }
    }
    return multiplier;
}

function withContribution(
    result: StageResult,
    multiplier: ReadonlyMap<string, number>,
    finalHpp: number | null,
): StageResult {
    const flow = multiplier.get(result.stageId);
    const isCountable =
        flow !== undefined &&
        result.addedCostPerOutput !== null &&
        finalHpp !== null &&
        finalHpp > 0;
    return {
        ...result,
        contributionPct: isCountable
            ? ((result.addedCostPerOutput as number) * flow * 100) /
              (finalHpp as number)
            : null,
    };
}

export function calculateScenario(scenario: OwnerHppScenario): ScenarioResult {
    const { order, error } = orderStages(scenario.stages);
    if (error) return emptyResult(scenario, error);

    const done = new Map<string, StageResult>();
    for (const stage of order) {
        done.set(stage.id, calculateStage(stage, done));
    }

    const finalStage = scenario.stages.find(
        (stage) => stage.id === scenario.finalStageId,
    );
    if (!finalStage) return emptyResult(scenario, 'Tahap akhir tidak ditemukan.');

    const finalHpp = done.get(finalStage.id)?.hppPerOutput ?? null;
    const multiplier = flowMultipliers(order, finalStage.id);
    const stages = order.map((stage) =>
        withContribution(
            done.get(stage.id) as StageResult,
            multiplier,
            finalHpp,
        ),
    );

    const { sellPrice } = scenario;
    const profitPerOutput =
        finalHpp === null || sellPrice === null ? null : sellPrice - finalHpp;
    const marginPercent =
        profitPerOutput === null || sellPrice === null || sellPrice <= 0
            ? null
            : (profitPerOutput * 100) / sellPrice;

    return {
        error: null,
        stages,
        finalStageId: finalStage.id,
        finalHpp,
        finalUnit: finalStage.outputUnit,
        sellPrice,
        profitPerOutput,
        marginPercent,
    };
}
