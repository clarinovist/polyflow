import type { ErpChainResult } from './erp-chain';
import {
    OWNER_HPP_LIMITS,
    OWNER_HPP_WORKSPACE_VERSION,
    type OwnerHppCost,
    type OwnerHppMaterial,
    type OwnerHppRawMaterial,
    type OwnerHppScenario,
    type OwnerHppStage,
    type OwnerHppWorkspace,
} from './workspace-schema';

/** Id source; the UI passes a random one, tests pass a counter. */
export type IdFactory = () => string;

export function randomId(): string {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function emptyStage(id: string, name: string): OwnerHppStage {
    return {
        id,
        name,
        outputUnit: 'KG',
        outputQty: 1,
        materials: [],
        costs: [],
    };
}

export function createDefaultScenario(
    makeId: IdFactory,
    name = 'Skenario 1',
): OwnerHppScenario {
    const stage = emptyStage(makeId(), 'Tahap 1');
    return {
        id: makeId(),
        name,
        finalStageId: stage.id,
        sellPrice: null,
        stages: [stage],
    };
}

export function createDefaultWorkspace(makeId: IdFactory): OwnerHppWorkspace {
    return {
        version: OWNER_HPP_WORKSPACE_VERSION,
        scenarios: [createDefaultScenario(makeId)],
    };
}

export function addStage(
    scenario: OwnerHppScenario,
    makeId: IdFactory,
): OwnerHppScenario {
    if (scenario.stages.length >= OWNER_HPP_LIMITS.maxStages) return scenario;
    const stage = emptyStage(makeId(), `Tahap ${scenario.stages.length + 1}`);
    return { ...scenario, stages: [...scenario.stages, stage] };
}

export function removeStage(
    scenario: OwnerHppScenario,
    stageId: string,
): OwnerHppScenario {
    if (scenario.stages.length <= 1) return scenario;
    const stages = scenario.stages
        .filter((stage) => stage.id !== stageId)
        .map((stage) => ({
            ...stage,
            materials: stage.materials.filter(
                (material) =>
                    material.kind !== 'stage' || material.from !== stageId,
            ),
        }));
    const finalStageId = stages.some(
        (stage) => stage.id === scenario.finalStageId,
    )
        ? scenario.finalStageId
        : stages[stages.length - 1].id;
    return { ...scenario, stages, finalStageId };
}

export function updateStage(
    scenario: OwnerHppScenario,
    stageId: string,
    update: (stage: OwnerHppStage) => OwnerHppStage,
): OwnerHppScenario {
    return {
        ...scenario,
        stages: scenario.stages.map((stage) =>
            stage.id === stageId ? update(stage) : stage,
        ),
    };
}

export function addRawMaterial(
    stage: OwnerHppStage,
    makeId: IdFactory,
): OwnerHppStage {
    if (stage.materials.length >= OWNER_HPP_LIMITS.maxMaterials) return stage;
    const material: OwnerHppRawMaterial = {
        id: makeId(),
        kind: 'raw',
        name: 'Bahan baru',
        unit: 'KG',
        qty: 0,
        scrapPercent: 0,
        price: 0,
        erpPrice: null,
    };
    return { ...stage, materials: [...stage.materials, material] };
}

export function addStageLink(
    stage: OwnerHppStage,
    fromStageId: string,
    makeId: IdFactory,
): OwnerHppStage {
    if (stage.materials.length >= OWNER_HPP_LIMITS.maxMaterials) return stage;
    const material: OwnerHppMaterial = {
        id: makeId(),
        kind: 'stage',
        from: fromStageId,
        qty: 1,
        scrapPercent: 0,
    };
    return { ...stage, materials: [...stage.materials, material] };
}

export function updateMaterial(
    stage: OwnerHppStage,
    materialId: string,
    patch: Record<string, string | number | null>,
): OwnerHppStage {
    return {
        ...stage,
        materials: stage.materials.map((material) =>
            material.id === materialId
                ? ({ ...material, ...patch } as OwnerHppMaterial)
                : material,
        ),
    };
}

export function removeMaterial(
    stage: OwnerHppStage,
    materialId: string,
): OwnerHppStage {
    return {
        ...stage,
        materials: stage.materials.filter(
            (material) => material.id !== materialId,
        ),
    };
}

function emptyCost(formula: OwnerHppCost['formula'], id: string): OwnerHppCost {
    switch (formula) {
        case 'fixed-per-output':
            return {
                id,
                label: 'Biaya tetap',
                formula,
                category: 'conversion',
                value: 0,
            };
        case 'quantity-times-unit-cost':
            return {
                id,
                label: 'Biaya per satuan',
                formula,
                category: 'conversion',
                quantity: 0,
                unitCost: 0,
                unit: 'kWh',
            };
        case 'batch-cost-per-good-output':
            return {
                id,
                label: 'Biaya per batch',
                formula,
                category: 'conversion',
                batchQuantity: 1,
                costPerBatchUnit: 0,
                goodOutputQuantity: 1,
                batchUnit: 'shift',
            };
        case 'percentage-of-pre-overhead':
            return { id, label: 'Overhead', formula, percentage: 0 };
    }
}

export function addCost(
    stage: OwnerHppStage,
    formula: OwnerHppCost['formula'],
    makeId: IdFactory,
): OwnerHppStage {
    if (stage.costs.length >= OWNER_HPP_LIMITS.maxCosts) return stage;
    return { ...stage, costs: [...stage.costs, emptyCost(formula, makeId())] };
}

export function updateCost(
    stage: OwnerHppStage,
    costId: string,
    patch: Record<string, string | number>,
): OwnerHppStage {
    return {
        ...stage,
        costs: stage.costs.map((cost) =>
            cost.id === costId ? ({ ...cost, ...patch } as OwnerHppCost) : cost,
        ),
    };
}

/** Switches a cost line to another formula, keeping its id and label. */
export function changeCostFormula(
    stage: OwnerHppStage,
    costId: string,
    formula: OwnerHppCost['formula'],
): OwnerHppStage {
    return {
        ...stage,
        costs: stage.costs.map((cost) =>
            cost.id === costId
                ? { ...emptyCost(formula, costId), label: cost.label }
                : cost,
        ),
    };
}

export function removeCost(
    stage: OwnerHppStage,
    costId: string,
): OwnerHppStage {
    return {
        ...stage,
        costs: stage.costs.filter((cost) => cost.id !== costId),
    };
}

function dependsOn(
    scenario: OwnerHppScenario,
    stageId: string,
    targetId: string,
    seen: Set<string> = new Set(),
): boolean {
    if (seen.has(stageId)) return false;
    seen.add(stageId);
    const stage = scenario.stages.find((entry) => entry.id === stageId);
    return (stage?.materials ?? []).some(
        (material) =>
            material.kind === 'stage' &&
            (material.from === targetId ||
                dependsOn(scenario, material.from, targetId, seen)),
    );
}

/** Stages that can feed `stageId` without creating a cycle. */
export function availableUpstreamStages(
    scenario: OwnerHppScenario,
    stageId: string,
): OwnerHppStage[] {
    return scenario.stages.filter(
        (candidate) =>
            candidate.id !== stageId &&
            !dependsOn(scenario, candidate.id, stageId),
    );
}

export function duplicateScenario(
    scenario: OwnerHppScenario,
    makeId: IdFactory,
): OwnerHppScenario {
    const suffix = ' (salinan)';
    const name = `${scenario.name.slice(0, OWNER_HPP_LIMITS.maxTextLength - suffix.length)}${suffix}`;
    return { ...scenario, id: makeId(), name };
}

/** Swaps in a chain built from the ERP, keeping name and selling price. */
export function applyErpChain(
    scenario: OwnerHppScenario,
    chain: ErpChainResult,
): OwnerHppScenario {
    if (chain.stages.length === 0) return scenario;
    return {
        ...scenario,
        stages: chain.stages,
        finalStageId: chain.finalStageId,
    };
}
