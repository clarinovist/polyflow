'use client';

import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    countConversionCosts,
    readConversionCost,
    readOverheadPercent,
    setConversionCost,
    setOverheadPercent,
} from '@/lib/owner-hpp/conversion-cost';
import { randomId } from '@/lib/owner-hpp/workspace-edit';
import type { OwnerHppStage } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { formatPercent } from './format-result';
import { NumberField } from './NumberField';

interface ConversionFieldProps {
    stage: OwnerHppStage;
    result: StageResult | undefined;
    onChange: (next: OwnerHppStage) => void;
}

const SINGLE_HINT = 'tenaga kerja, listrik, mesin jadi satu angka';
const OVERHEAD_HINT = 'dari bahan + susut + tenaga';
const OVERHEAD_LABEL = 'Overhead %';

function ReadOnlyField({
    label,
    value,
    note,
    testId,
}: {
    label: string;
    value: string;
    note: string;
    testId: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-sm font-medium">{label}</p>
            <p
                className="flex h-11 items-center justify-end px-3 font-mono tabular-nums lg:h-9"
                data-testid={testId}
            >
                {value}
            </p>
            <p className="text-xs text-muted-foreground">{note}</p>
        </div>
    );
}

function LabourCostField({ stage, result, onChange }: ConversionFieldProps) {
    const state = readConversionCost(stage, result?.costById);
    const unit = stage.outputUnit.trim().toLowerCase() || 'satuan';
    const label = `Tenaga / biaya konversi per ${unit}`;

    if (state.mode === 'multi') {
        return (
            <ReadOnlyField
                label={label}
                value={state.value === null ? '-' : formatRupiah(state.value)}
                note={`${countConversionCosts(stage)} komponen biaya, ubah di Lanjutan`}
                testId="conversion-total"
            />
        );
    }
    return (
        <div className="space-y-1">
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

function OverheadField({ stage, onChange }: ConversionFieldProps) {
    const state = readOverheadPercent(stage);

    if (state.mode === 'multi') {
        return (
            <ReadOnlyField
                label={OVERHEAD_LABEL}
                value={formatPercent(state.value)}
                note={`${state.count} komponen overhead, ubah di Lanjutan`}
                testId="overhead-total"
            />
        );
    }
    return (
        <div className="space-y-1">
            <NumberField
                label={OVERHEAD_LABEL}
                showLabel
                suffix="%"
                value={state.value}
                onChange={(percent) =>
                    onChange(setOverheadPercent(stage, percent, randomId))
                }
            />
            <p className="text-xs text-muted-foreground">{OVERHEAD_HINT}</p>
        </div>
    );
}

/** Labour/conversion cost and overhead %, each one number; extra lines stay in Lanjutan. */
export function ConversionField(props: ConversionFieldProps) {
    return (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            <LabourCostField {...props} />
            <OverheadField {...props} />
        </div>
    );
}
