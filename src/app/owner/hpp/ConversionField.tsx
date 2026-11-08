'use client';

import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    readConversionCost,
    setConversionCost,
} from '@/lib/owner-hpp/conversion-cost';
import { randomId } from '@/lib/owner-hpp/workspace-edit';
import type { OwnerHppStage } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { NumberField } from './NumberField';

interface ConversionFieldProps {
    stage: OwnerHppStage;
    result: StageResult | undefined;
    onChange: (next: OwnerHppStage) => void;
}

const SINGLE_HINT = 'tenaga kerja, listrik, mesin, overhead jadi satu angka';

/** One number for all the stage's own costs; many cost lines stay read-only. */
export function ConversionField({
    stage,
    result,
    onChange,
}: ConversionFieldProps) {
    const state = readConversionCost(stage, result?.costById);
    const unit = stage.outputUnit.trim().toLowerCase() || 'satuan';
    const label = `Biaya konversi per ${unit}`;

    if (state.mode === 'multi') {
        return (
            <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-medium">{label}</p>
                <p
                    className="flex h-11 items-center justify-end px-1 font-mono tabular-nums lg:h-9"
                    data-testid="conversion-total"
                >
                    {state.value === null ? '-' : formatRupiah(state.value)}
                </p>
                <p className="text-xs text-muted-foreground">
                    {stage.costs.length} komponen biaya, ubah di Lanjutan
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-1 border-t pt-3">
            <NumberField
                label={label}
                showLabel
                kind="money"
                value={state.value ?? 0}
                onChange={(value) =>
                    onChange(setConversionCost(stage, value, randomId))
                }
            />
            <p className="text-xs text-muted-foreground">{SINGLE_HINT}</p>
        </div>
    );
}
