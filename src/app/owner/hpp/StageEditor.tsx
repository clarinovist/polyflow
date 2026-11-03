'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    addCost,
    addRawMaterial,
    addStageLink,
    availableUpstreamStages,
    changeCostFormula,
    randomId,
    removeCost,
    removeMaterial,
    updateCost,
    updateMaterial,
} from '@/lib/owner-hpp/workspace-edit';
import type { OwnerHppCost, OwnerHppScenario, OwnerHppStage } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { Plus } from 'lucide-react';
import { CostRow } from './CostRow';
import { MATERIAL_GRID, MaterialRow } from './MaterialRow';
import { NumberField } from './NumberField';
import { COST_FORMULA_LABELS, SELECT_CLASS } from './ui-classes';

interface StageEditorProps {
    scenario: OwnerHppScenario;
    stage: OwnerHppStage;
    result: StageResult | undefined;
    stageResults: ReadonlyMap<string, StageResult>;
    canDelete: boolean;
    onChange: (next: OwnerHppStage) => void;
    onSetFinal: () => void;
    onDelete: () => void;
}

const MATERIAL_HEADERS = ['Bahan', 'Satuan', 'Jumlah', 'Susut %', 'Harga', 'Sumber', 'Biaya/keluaran'];

export function StageEditor({
    scenario,
    stage,
    result,
    stageResults,
    canDelete,
    onChange,
    onSetFinal,
    onDelete,
}: StageEditorProps) {
    const upstream = availableUpstreamStages(scenario, stage.id);
    const isFinal = scenario.finalStageId === stage.id;

    return (
        <section className="space-y-5 rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 basis-48">
                    <span className="text-xs text-muted-foreground">Nama tahap</span>
                    <Input
                        maxLength={80}
                        value={stage.name}
                        onChange={(event) => onChange({ ...stage, name: event.target.value })}
                    />
                </label>
                <label className="flex w-24 flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Satuan keluaran</span>
                    <Input
                        maxLength={16}
                        value={stage.outputUnit}
                        onChange={(event) => onChange({ ...stage, outputUnit: event.target.value })}
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

            {result?.message ? (
                <p role="alert" className="text-sm text-destructive">
                    {result.message}
                </p>
            ) : null}

            <div className="space-y-2">
                <h2 className="text-sm font-semibold">Bahan</h2>
                <div className={`${MATERIAL_GRID} hidden text-xs text-muted-foreground md:grid`} aria-hidden="true">
                    {MATERIAL_HEADERS.map((header) => (
                        <span key={header} className="truncate">
                            {header}
                        </span>
                    ))}
                    <span />
                </div>
                {stage.materials.map((material) => {
                    const from = material.kind === 'stage' ? material.from : null;
                    const options = scenario.stages.filter(
                        (candidate) => candidate.id === from || upstream.some((u) => u.id === candidate.id),
                    );
                    return (
                        <MaterialRow
                            key={material.id}
                            material={material}
                            upstreamOptions={options}
                            upstreamResult={from ? stageResults.get(from) : undefined}
                            costPerOutput={result?.materialCostById[material.id]}
                            onChange={(patch) => onChange(updateMaterial(stage, material.id, patch))}
                            onRemove={() => onChange(removeMaterial(stage, material.id))}
                        />
                    );
                })}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onChange(addRawMaterial(stage, randomId))}>
                        <Plus /> Bahan baku
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={upstream.length === 0}
                        onClick={() => onChange(addStageLink(stage, upstream[0].id, randomId))}
                    >
                        <Plus /> Dari tahap lain
                    </Button>
                </div>
                <p className="flex justify-between text-sm font-medium">
                    <span>Subtotal bahan</span>
                    <span className="font-mono tabular-nums">
                        {result?.materialSubtotalPerOutput == null ? '-' : formatRupiah(result.materialSubtotalPerOutput)}
                    </span>
                </p>
            </div>

            <div className="space-y-3">
                <h2 className="text-sm font-semibold">Biaya lain</h2>
                {stage.costs.map((cost) => (
                    <CostRow
                        key={cost.id}
                        cost={cost}
                        costPerOutput={result?.costById[cost.id]}
                        onChange={(patch) => onChange(updateCost(stage, cost.id, patch))}
                        onFormulaChange={(formula) => onChange(changeCostFormula(stage, cost.id, formula))}
                        onRemove={() => onChange(removeCost(stage, cost.id))}
                    />
                ))}
                <label className="flex max-w-xs flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Tambah biaya</span>
                    <select
                        aria-label="Tambah biaya"
                        className={SELECT_CLASS}
                        value=""
                        onChange={(event) => {
                            const formula = event.target.value as OwnerHppCost['formula'];
                            if (formula) onChange(addCost(stage, formula, randomId));
                        }}
                    >
                        <option value="">Pilih rumus…</option>
                        {(Object.keys(COST_FORMULA_LABELS) as OwnerHppCost['formula'][]).map((formula) => (
                            <option key={formula} value={formula}>
                                {COST_FORMULA_LABELS[formula]}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="text-xs text-muted-foreground">
                    Persentase overhead dihitung dari subtotal sebelum overhead, termasuk biaya yang dibawa dari tahap
                    sebelumnya.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button type="button" variant="outline" size="sm" disabled={isFinal} onClick={onSetFinal}>
                    {isFinal ? 'Ini tahap akhir' : 'Jadikan tahap akhir'}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={!canDelete} onClick={onDelete}>
                    Hapus tahap
                </Button>
            </div>
        </section>
    );
}
