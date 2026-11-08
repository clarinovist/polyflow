'use client';

import type { ScenarioResult } from '@/lib/owner-hpp/calculate-chain';
import type { OwnerHppScenario } from '@/lib/owner-hpp/workspace-schema';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { AlertTriangle } from 'lucide-react';
import { formatPercent } from './format-result';
import { NumberField } from './NumberField';
import { SaveButton } from './SaveDock';
import { STAGE_BAR_COLORS } from './ui-classes';

interface ResultPanelProps {
    scenario: OwnerHppScenario;
    result: ScenarioResult;
    isDirty: boolean;
    isSaving: boolean;
    statusText: string;
    onSave: () => void;
    onSellPriceChange: (price: number | null) => void;
    onSelectStage: (stageId: string) => void;
}

export function ResultPanel({
    scenario,
    result,
    isDirty,
    isSaving,
    statusText,
    onSave,
    onSellPriceChange,
    onSelectStage,
}: ResultPanelProps) {
    const warnings = result.stages.flatMap((stage) => stage.warnings);
    const counted = result.stages.filter(
        (stage) => stage.contributionPct !== null,
    );

    return (
        <aside
            className="space-y-4 rounded-lg border bg-card p-3 lg:sticky lg:top-4 lg:p-4"
            aria-label="Hasil"
        >
            <div className="hidden lg:block">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    HPP akhir per {result.finalUnit.toLowerCase() || 'satuan'}
                </p>
                <p className="font-mono text-3xl font-semibold tabular-nums">
                    {result.finalHpp === null
                        ? '-'
                        : formatRupiah(result.finalHpp)}
                </p>
            </div>

            {result.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {result.error}
                </p>
            ) : null}

            <div className="space-y-2 lg:border-t lg:pt-3">
                <NumberField
                    label={`Harga jual per ${result.finalUnit.toLowerCase() || 'satuan'}`}
                    showLabel
                    kind="money"
                    value={scenario.sellPrice ?? 0}
                    onChange={(price) =>
                        onSellPriceChange(price > 0 ? price : null)
                    }
                />
                <dl className="grid grid-cols-2 gap-x-3 text-sm">
                    <dt className="hidden text-muted-foreground lg:block">
                        Margin atas harga jual
                    </dt>
                    <dd className="hidden text-right font-mono font-semibold tabular-nums lg:block">
                        {formatPercent(result.marginPercent)}
                    </dd>
                    <dt className="text-muted-foreground">
                        Laba per {result.finalUnit.toLowerCase() || 'satuan'}
                    </dt>
                    <dd className="text-right font-mono tabular-nums">
                        {result.profitPerOutput === null
                            ? '-'
                            : formatRupiah(result.profitPerOutput)}
                    </dd>
                </dl>
            </div>

            {counted.length > 0 ? (
                <div className="space-y-2 border-t pt-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Biaya tambah per tahap
                    </p>
                    <div
                        className="flex h-3 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label="Porsi biaya tiap tahap"
                    >
                        {counted.map((stage, index) => (
                            <div
                                key={stage.stageId}
                                className={
                                    STAGE_BAR_COLORS[
                                        index % STAGE_BAR_COLORS.length
                                    ]
                                }
                                style={{ width: `${stage.contributionPct}%` }}
                            />
                        ))}
                    </div>
                    <ul className="space-y-1 text-sm">
                        {counted.map((stage, index) => (
                            <li key={stage.stageId}>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 text-left"
                                    onClick={() => onSelectStage(stage.stageId)}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'size-2.5 shrink-0 rounded-full',
                                            STAGE_BAR_COLORS[
                                                index % STAGE_BAR_COLORS.length
                                            ],
                                        )}
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                        {stage.name}
                                    </span>
                                    <span className="font-mono tabular-nums">
                                        {formatPercent(stage.contributionPct)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {warnings.length > 0 ? (
                <ul className="space-y-1 border-t pt-3 text-sm text-muted-foreground">
                    {warnings.map((warning) => (
                        <li key={warning} className="flex gap-2">
                            <AlertTriangle
                                className="mt-0.5 size-4 shrink-0"
                                aria-hidden="true"
                            />
                            {warning}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="hidden flex-col gap-2 border-t pt-3 lg:flex">
                <SaveButton
                    isDirty={isDirty}
                    isSaving={isSaving}
                    onSave={onSave}
                />
                <span
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                    suppressHydrationWarning
                >
                    {statusText}
                </span>
            </div>
        </aside>
    );
}
