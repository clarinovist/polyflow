'use client';

import { Button } from '@/components/ui/button';
import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    addRawMaterial,
    addStageLink,
    availableUpstreamStages,
    randomId,
    removeMaterial,
    updateMaterial,
} from '@/lib/owner-hpp/workspace-edit';
import type {
    OwnerHppScenario,
    OwnerHppStage,
} from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { Plus } from 'lucide-react';
import { ConversionField } from './ConversionField';
import { MATERIAL_ROW_GRID, MaterialRow } from './MaterialRow';

interface StageEditorProps {
    scenario: OwnerHppScenario;
    stage: OwnerHppStage;
    result: StageResult | undefined;
    stageResults: ReadonlyMap<string, StageResult>;
    onChange: (next: OwnerHppStage) => void;
}

const MATERIAL_HEADERS = ['Bahan', 'Jumlah', 'Harga per unit', 'Subtotal'];

function Money({ value }: { value: number | null | undefined }) {
    return (
        <span className="font-mono tabular-nums">
            {value === null || value === undefined ? '-' : formatRupiah(value)}
        </span>
    );
}

/** The simple main card: materials, one conversion cost, the stage HPP. */
export function StageEditor({
    scenario,
    stage,
    result,
    stageResults,
    onChange,
}: StageEditorProps) {
    const upstream = availableUpstreamStages(scenario, stage.id);
    const unit = stage.outputUnit.trim().toLowerCase() || 'satuan';

    return (
        <section
            className="space-y-4 rounded-lg border bg-card p-3 lg:p-4"
            aria-live="polite"
        >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {stage.name} · per 1 {unit} keluaran
            </h2>

            {result?.message ? (
                <p role="alert" className="text-sm text-destructive">
                    {result.message}
                </p>
            ) : null}

            <div className="space-y-2">
                <div
                    className={`hidden gap-2 text-xs text-muted-foreground lg:grid ${MATERIAL_ROW_GRID}`}
                    aria-hidden="true"
                >
                    {MATERIAL_HEADERS.map((header) => (
                        <span key={header} className="truncate">
                            {header}
                        </span>
                    ))}
                    <span />
                </div>
                {stage.materials.map((material) => (
                    <MaterialRow
                        key={material.id}
                        material={material}
                        upstreamResult={
                            material.kind === 'stage'
                                ? stageResults.get(material.from)
                                : undefined
                        }
                        costPerOutput={result?.materialCostById[material.id]}
                        onChange={(patch) =>
                            onChange(updateMaterial(stage, material.id, patch))
                        }
                        onRemove={() =>
                            onChange(removeMaterial(stage, material.id))
                        }
                    />
                ))}
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 lg:min-h-9"
                        onClick={() =>
                            onChange(addRawMaterial(stage, randomId))
                        }
                    >
                        <Plus /> Bahan baku
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 lg:min-h-9"
                        disabled={upstream.length === 0}
                        onClick={() =>
                            onChange(
                                addStageLink(stage, upstream[0].id, randomId),
                            )
                        }
                    >
                        <Plus /> Dari tahap lain
                    </Button>
                </div>
                <p className="flex justify-between text-sm font-medium">
                    <span>Subtotal bahan</span>
                    <Money value={result?.materialSubtotalPerOutput} />
                </p>
            </div>

            <ConversionField
                stage={stage}
                result={result}
                onChange={onChange}
            />

            <p className="flex justify-between border-t-2 border-foreground pt-3 font-semibold">
                <span>HPP tahap ini</span>
                <Money value={result?.hppPerOutput} />
            </p>
        </section>
    );
}
