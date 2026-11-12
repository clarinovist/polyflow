import { formatRupiah } from '@/lib/utils/utils';
import { formatDecimal } from './number-input';
import {
    COST_FIELDS_BY_FORMULA,
    type CostFormula,
    type VoiceCommand,
    type VoiceOp,
} from './voice-commands';
import {
    addCost,
    addRawMaterial,
    addStage,
    removeCost,
    removeMaterial,
    updateCost,
    updateMaterial,
    updateStage,
    type IdFactory,
} from './workspace-edit';
import {
    OWNER_HPP_LIMITS,
    parseOwnerHppWorkspace,
    type OwnerHppCost,
    type OwnerHppRawMaterial,
    type OwnerHppScenario,
    type OwnerHppStage,
    type OwnerHppWorkspace,
    type ParseWorkspaceResult,
} from './workspace-schema';

export interface VoiceLine {
    text: string;
    heard: string;
}

export interface VoiceApplyResult {
    scenario: OwnerHppScenario;
    activeStageId: string;
    lines: VoiceLine[];
    warnings: string[];
}

interface EditState {
    scenario: OwnerHppScenario;
    activeStageId: string;
}

type Outcome =
    | { ok: true; state: EditState; line: string }
    | { ok: false; warning: string };

type NameMatch<T> =
    | { kind: 'found'; item: T }
    | { kind: 'none' }
    | { kind: 'ambiguous'; names: string[] };

function normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Exact match first; otherwise a substring match only if exactly one candidate fits. */
export function resolveByName<T>(
    items: readonly T[],
    getName: (item: T) => string,
    query: string,
): NameMatch<T> {
    const wanted = normalizeName(query);
    if (!wanted) return { kind: 'none' };
    const exact = items.filter(
        (item) => normalizeName(getName(item)) === wanted,
    );
    const partial = items.filter((item) =>
        normalizeName(getName(item)).includes(wanted),
    );
    const matches = exact.length > 0 ? exact : partial;
    if (matches.length === 1) return { kind: 'found', item: matches[0] };
    if (matches.length === 0) return { kind: 'none' };
    return { kind: 'ambiguous', names: matches.map(getName) };
}

function lookupWarning<T>(
    match: NameMatch<T>,
    noun: string,
    query: string,
): string | null {
    if (match.kind === 'found') return null;
    if (match.kind === 'none') {
        return `${noun} "${query}" tidak ditemukan, perintah dilewati.`;
    }
    return `${noun} "${query}" cocok dengan beberapa (${match.names.join(', ')}), perintah dilewati.`;
}

type Resolved<T> = { ok: true; item: T } | { ok: false; warning: string };

function resolveOne<T>(
    items: readonly T[],
    getName: (item: T) => string,
    query: string,
    noun: string,
): Resolved<T> {
    const match = resolveByName(items, getName, query);
    const warning = lookupWarning(match, noun, query);
    if (warning !== null || match.kind !== 'found') {
        return { ok: false, warning: warning ?? '' };
    }
    return { ok: true, item: match.item };
}

function resolveStage(
    state: EditState,
    stageName: string | undefined,
): Resolved<OwnerHppStage> {
    const { stages } = state.scenario;
    if (stageName === undefined) {
        const active =
            stages.find((stage) => stage.id === state.activeStageId) ??
            stages[0];
        return { ok: true, item: active };
    }
    return resolveOne(stages, (stage) => stage.name, stageName, 'Tahap');
}

function rawMaterials(stage: OwnerHppStage): OwnerHppRawMaterial[] {
    return stage.materials.filter(
        (material): material is OwnerHppRawMaterial => material.kind === 'raw',
    );
}

function normalizeUnit(unit: string): string {
    return unit.trim().toUpperCase();
}

function withStage(
    state: EditState,
    stage: OwnerHppStage,
    update: (stage: OwnerHppStage) => OwnerHppStage,
    line: string,
): Outcome {
    const scenario = updateStage(state.scenario, stage.id, update);
    return { ok: true, state: { ...state, scenario }, line };
}

function rupiah(value: number): string {
    return formatRupiah(value);
}

function scrapSuffix(scrapPercent: number): string {
    return scrapPercent > 0 ? `, scrap ${formatDecimal(scrapPercent)}%` : '';
}

function describeCost(cost: OwnerHppCost): string {
    switch (cost.formula) {
        case 'fixed-per-output':
            return `${rupiah(cost.value)} per output`;
        case 'quantity-times-unit-cost':
            return `${formatDecimal(cost.quantity)} ${cost.unit} x ${rupiah(cost.unitCost)}`;
        case 'batch-cost-per-good-output':
            return `${formatDecimal(cost.batchQuantity)} ${cost.batchUnit} x ${rupiah(cost.costPerBatchUnit)} untuk ${formatDecimal(cost.goodOutputQuantity)} output`;
        case 'percentage-of-pre-overhead':
            return `${formatDecimal(cost.percentage)}% dari biaya sebelum overhead`;
    }
}

type Handler<K extends VoiceOp> = (
    state: EditState,
    command: Extract<VoiceCommand, { op: K }>,
    makeId: IdFactory,
) => Outcome;

const setOutput: Handler<'set_output'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    const unit = command.unit ? normalizeUnit(command.unit) : stage.outputUnit;
    return withStage(
        state,
        stage,
        (current) => ({ ...current, outputQty: command.qty, outputUnit: unit }),
        `Output tahap "${stage.name}": ${formatDecimal(command.qty)} ${unit}`,
    );
};

const addMaterialOp: Handler<'add_material'> = (state, command, makeId) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    if (stage.materials.length >= OWNER_HPP_LIMITS.maxMaterials) {
        return {
            ok: false,
            warning: `Bahan di tahap "${stage.name}" sudah penuh, perintah dilewati.`,
        };
    }
    const id = makeId();
    const patch = {
        name: command.name,
        unit: normalizeUnit(command.unit),
        qty: command.qty,
        price: command.price,
        scrapPercent: command.scrapPercent ?? 0,
    };
    const line = `+ Bahan ${command.name} ${formatDecimal(command.qty)} ${patch.unit} @ ${rupiah(command.price)}${scrapSuffix(patch.scrapPercent)}`;
    return withStage(
        state,
        stage,
        (current) =>
            updateMaterial(
                addRawMaterial(current, () => id),
                id,
                patch,
            ),
        line,
    );
};

const updateMaterialOp: Handler<'update_material'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    const found = resolveOne(
        rawMaterials(stage),
        (material) => material.name,
        command.name,
        'Bahan',
    );
    if (!found.ok) return found;
    const patch: Record<string, number> = {};
    const parts: string[] = [];
    if (command.qty !== undefined) {
        patch.qty = command.qty;
        parts.push(`jumlah ${formatDecimal(command.qty)}`);
    }
    if (command.price !== undefined) {
        patch.price = command.price;
        parts.push(`harga ${rupiah(command.price)}`);
    }
    if (command.scrapPercent !== undefined) {
        patch.scrapPercent = command.scrapPercent;
        parts.push(`scrap ${formatDecimal(command.scrapPercent)}%`);
    }
    return withStage(
        state,
        stage,
        (current) => updateMaterial(current, found.item.id, patch),
        `Ubah bahan ${found.item.name}: ${parts.join(', ')}`,
    );
};

const removeMaterialOp: Handler<'remove_material'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    const found = resolveOne(
        rawMaterials(stage),
        (material) => material.name,
        command.name,
        'Bahan',
    );
    if (!found.ok) return found;
    return withStage(
        state,
        stage,
        (current) => removeMaterial(current, found.item.id),
        `- Bahan ${found.item.name}`,
    );
};

function costPatch(
    command: Record<string, unknown>,
    formula: CostFormula,
): Record<string, string | number> {
    const patch: Record<string, string | number> = {};
    for (const field of COST_FIELDS_BY_FORMULA[formula]) {
        const value = command[field];
        if (typeof value === 'number') patch[field] = value;
        if (typeof value === 'string') patch[field] = value;
    }
    return patch;
}

const addCostOp: Handler<'add_cost'> = (state, command, makeId) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    if (stage.costs.length >= OWNER_HPP_LIMITS.maxCosts) {
        return {
            ok: false,
            warning: `Biaya di tahap "${stage.name}" sudah penuh, perintah dilewati.`,
        };
    }
    const id = makeId();
    const patch = {
        ...costPatch(command, command.formula),
        label: command.label,
        ...(command.formula === 'percentage-of-pre-overhead'
            ? {}
            : { category: command.category }),
    };
    const next = updateCost(
        addCost(stage, command.formula, () => id),
        id,
        patch,
    );
    const created = next.costs.find((cost) => cost.id === id);
    const detail = created ? describeCost(created) : '';
    return withStage(
        state,
        stage,
        () => next,
        `+ Biaya ${command.label}: ${detail}`,
    );
};

const updateCostOp: Handler<'update_cost'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    const found = resolveOne(
        stage.costs,
        (cost) => cost.label,
        command.label,
        'Biaya',
    );
    if (!found.ok) return found;
    const patch = costPatch(command, found.item.formula);
    if (Object.keys(patch).length === 0) {
        return {
            ok: false,
            warning: `Biaya "${found.item.label}" tidak punya kolom yang disebut, perintah dilewati.`,
        };
    }
    const next = updateCost(stage, found.item.id, patch);
    const updated = next.costs.find((cost) => cost.id === found.item.id);
    return withStage(
        state,
        stage,
        () => next,
        `Ubah biaya ${found.item.label}: ${updated ? describeCost(updated) : ''}`,
    );
};

const removeCostOp: Handler<'remove_cost'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    const stage = target.item;
    const found = resolveOne(
        stage.costs,
        (cost) => cost.label,
        command.label,
        'Biaya',
    );
    if (!found.ok) return found;
    return withStage(
        state,
        stage,
        (current) => removeCost(current, found.item.id),
        `- Biaya ${found.item.label}`,
    );
};

const setSellPrice: Handler<'set_sell_price'> = (state, command) => ({
    ok: true,
    state: {
        ...state,
        scenario: { ...state.scenario, sellPrice: command.price },
    },
    line: `Harga jual ${rupiah(command.price)}`,
});

const addStageOp: Handler<'add_stage'> = (state, command, makeId) => {
    if (state.scenario.stages.length >= OWNER_HPP_LIMITS.maxStages) {
        return {
            ok: false,
            warning: 'Jumlah tahap sudah penuh, perintah dilewati.',
        };
    }
    const id = makeId();
    const added = addStage(state.scenario, () => id);
    const unit = command.outputUnit ? normalizeUnit(command.outputUnit) : 'KG';
    const qty = command.outputQty ?? 1;
    const scenario = updateStage(added, id, (stage) => ({
        ...stage,
        name: command.name,
        outputUnit: unit,
        outputQty: qty,
    }));
    return {
        ok: true,
        state: { scenario, activeStageId: id },
        line: `+ Tahap ${command.name} (output ${formatDecimal(qty)} ${unit})`,
    };
};

const selectStage: Handler<'select_stage'> = (state, command) => {
    const target = resolveStage(state, command.stage);
    if (!target.ok) return target;
    return {
        ok: true,
        state: { ...state, activeStageId: target.item.id },
        line: `Pindah ke tahap "${target.item.name}"`,
    };
};

const HANDLERS: { [K in VoiceOp]: Handler<K> } = {
    set_output: setOutput,
    add_material: addMaterialOp,
    update_material: updateMaterialOp,
    remove_material: removeMaterialOp,
    add_cost: addCostOp,
    update_cost: updateCostOp,
    remove_cost: removeCostOp,
    set_sell_price: setSellPrice,
    add_stage: addStageOp,
    select_stage: selectStage,
};

function runCommand(
    state: EditState,
    command: VoiceCommand,
    makeId: IdFactory,
): Outcome {
    const handler = HANDLERS[command.op] as (
        state: EditState,
        command: VoiceCommand,
        makeId: IdFactory,
    ) => Outcome;
    return handler(state, command, makeId);
}

/**
 * Applies spoken commands one after another without touching the inputs.
 * Unknown or ambiguous names skip that command with a warning (never a guess).
 */
export function applyVoiceCommands(
    scenario: OwnerHppScenario,
    activeStageId: string,
    commands: readonly VoiceCommand[],
    makeId: IdFactory,
): VoiceApplyResult {
    let state: EditState = { scenario, activeStageId };
    const lines: VoiceLine[] = [];
    const warnings: string[] = [];
    for (const command of commands) {
        const outcome = runCommand(state, command, makeId);
        if (outcome.ok) {
            state = outcome.state;
            lines.push({ text: outcome.line, heard: command.heard });
        } else {
            warnings.push(outcome.warning);
        }
    }
    return { ...state, lines, warnings };
}

/** The edited scenario swapped into the workspace and re-validated as a whole. */
export function validateAppliedScenario(
    workspace: OwnerHppWorkspace,
    next: OwnerHppScenario,
): ParseWorkspaceResult {
    return parseOwnerHppWorkspace({
        ...workspace,
        scenarios: workspace.scenarios.map((entry) =>
            entry.id === next.id ? next : entry,
        ),
    });
}
