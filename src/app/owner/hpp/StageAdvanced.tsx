'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    addCost,
    availableUpstreamStages,
    changeCostFormula,
    randomId,
    removeCost,
    updateCost,
    updateMaterial,
} from '@/lib/owner-hpp/workspace-edit';
import type {
    OwnerHppCost,
    OwnerHppScenario,
    OwnerHppStage,
} from '@/lib/owner-hpp/workspace-schema';
import { CostRow } from './CostRow';
import { MaterialAdvancedRow } from './MaterialAdvancedRow';
import { NumberField } from './NumberField';
import { COST_FORMULA_LABELS, SELECT_CLASS } from './ui-classes';

interface StageAdvancedProps {
    scenario: OwnerHppScenario;
    stage: OwnerHppStage;
    result: StageResult | undefined;
    canDelete: boolean;
    onChange: (next: OwnerHppStage) => void;
    onSetFinal: () => void;
    onDelete: () => void;
}

const FORMULAS = Object.keys(COST_FORMULA_LABELS) as OwnerHppCost['formula'][];

function StageIdentity({
    stage,
    onChange,
}: Pick<StageAdvancedProps, 'stage' | 'onChange'>) {
    return (
        <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                    Nama tahap
                </span>
                <Input
                    maxLength={80}
                    value={stage.name}
                    onChange={(event) =>
                        onChange({ ...stage, name: event.target.value })
                    }
                />
            </label>
            <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                    Satuan keluaran
                </span>
                <Input
                    maxLength={16}
                    value={stage.outputUnit}
                    onChange={(event) =>
                        onChange({ ...stage, outputUnit: event.target.value })
                    }
                />
            </label>
            <NumberField
                label="Keluaran per batch"
                showLabel
                positive
                className="w-32"
                value={stage.outputQty}
                onChange={(outputQty) => onChange({ ...stage, outputQty })}
            />
        </div>
    );
}

function MaterialAdvancedList({
    scenario,
    stage,
    onChange,
}: Pick<StageAdvancedProps, 'scenario' | 'stage' | 'onChange'>) {
    if (stage.materials.length === 0) return null;
    const upstream = availableUpstreamStages(scenario, stage.id);
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-semibold">Bahan: satuan dan sumber</h4>
            {stage.materials.map((material) => {
                const from = material.kind === 'stage' ? material.from : null;
                const options = scenario.stages.filter(
                    (candidate) =>
                        candidate.id === from ||
                        upstream.some((entry) => entry.id === candidate.id),
                );
                return (
                    <MaterialAdvancedRow
                        key={material.id}
                        material={material}
                        upstreamOptions={options}
                        onChange={(patch) =>
                            onChange(updateMaterial(stage, material.id, patch))
                        }
                    />
                );
            })}
        </div>
    );
}

function CostList({
    stage,
    result,
    onChange,
}: Pick<StageAdvancedProps, 'stage' | 'result' | 'onChange'>) {
    return (
        <div className="space-y-3">
            <h4 className="text-sm font-semibold">Biaya lain</h4>
            {stage.costs.map((cost) => (
                <CostRow
                    key={cost.id}
                    cost={cost}
                    costPerOutput={result?.costById[cost.id]}
                    onChange={(patch) =>
                        onChange(updateCost(stage, cost.id, patch))
                    }
                    onFormulaChange={(formula) =>
                        onChange(changeCostFormula(stage, cost.id, formula))
                    }
                    onRemove={() => onChange(removeCost(stage, cost.id))}
                />
            ))}
            <label className="flex max-w-xs flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                    Tambah biaya
                </span>
                <select
                    aria-label="Tambah biaya"
                    className={SELECT_CLASS}
                    value=""
                    onChange={(event) => {
                        const formula = event.target
                            .value as OwnerHppCost['formula'];
                        if (formula)
                            onChange(addCost(stage, formula, randomId));
                    }}
                >
                    <option value="">Pilih rumus…</option>
                    {FORMULAS.map((formula) => (
                        <option key={formula} value={formula}>
                            {COST_FORMULA_LABELS[formula]}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-muted-foreground">
                Persentase overhead dihitung dari subtotal sebelum overhead,
                termasuk biaya yang dibawa dari tahap sebelumnya.
            </p>
        </div>
    );
}

/** Everything the simple card hides, for the stage that is currently open. */
export function StageAdvanced({
    scenario,
    stage,
    result,
    canDelete,
    onChange,
    onSetFinal,
    onDelete,
}: StageAdvancedProps) {
    const isFinal = scenario.finalStageId === stage.id;
    return (
        <section
            className="space-y-5"
            aria-label={`Lanjutan tahap ${stage.name}`}
        >
            <h3 className="text-sm font-semibold">Tahap: {stage.name}</h3>
            <StageIdentity stage={stage} onChange={onChange} />
            <MaterialAdvancedList
                scenario={scenario}
                stage={stage}
                onChange={onChange}
            />
            <CostList stage={stage} result={result} onChange={onChange} />
            <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isFinal}
                    onClick={onSetFinal}
                >
                    {isFinal ? 'Ini tahap akhir' : 'Jadikan tahap akhir'}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canDelete}
                    onClick={onDelete}
                >
                    Hapus tahap
                </Button>
            </div>
        </section>
    );
}
