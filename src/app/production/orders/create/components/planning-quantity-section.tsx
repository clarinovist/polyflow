'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { formatProductionQuantity } from '@/lib/utils/production-units';
import type { PlanningMode } from '../hooks/use-planning-intent';

interface PlanningQuantitySectionProps {
    planningMode: PlanningMode;
    onPlanningModeChange: (mode: PlanningMode) => void;
    batchCount: number;
    onBatchCountChange: (n: number) => void;
    enteredTargetQty: number;
    onEnteredTargetQtyChange: (n: number) => void;
    basePlannedQty: number;
    onBasePlannedQtyChange: (n: number) => void;
    bomOutputQty: number;
    bomPrimaryUnit: string;
    bomProductVariant: Record<string, unknown>;
    hasAlternateUnit: boolean;
    salesUnit: string;
    conversionFactor: number;
}

export function PlanningQuantitySection(props: PlanningQuantitySectionProps) {
    const {
        planningMode,
        bomPrimaryUnit,
        salesUnit,
        hasAlternateUnit,
        bomOutputQty,
    } = props;
    const isBatch = planningMode === 'batch';
    const isSales = planningMode === 'sales' && hasAlternateUnit;
    const unit = isBatch
        ? 'batch'
        : isSales
          ? salesUnit
          : bomPrimaryUnit || 'satuan dasar';
    const value = isBatch
        ? props.batchCount
        : isSales
          ? props.enteredTargetQty
          : props.basePlannedQty;
    const onChange = isBatch
        ? props.onBatchCountChange
        : isSales
          ? props.onEnteredTargetQtyChange
          : props.onBasePlannedQtyChange;
    const baseQty = isBatch
        ? props.batchCount * bomOutputQty
        : isSales
          ? props.enteredTargetQty * props.conversionFactor
          : props.basePlannedQty;
    const modes: { value: PlanningMode; label: string }[] = [
        {
            value: 'weight',
            label: `Satuan dasar (${bomPrimaryUnit || 'Base'})`,
        },
        ...(hasAlternateUnit
            ? [{ value: 'sales' as const, label: `Satuan jual (${salesUnit})` }]
            : []),
        { value: 'batch', label: 'Batch' },
    ];
    return (
        <section
            className="space-y-4 rounded-xl border bg-muted/30 p-4"
            aria-labelledby="spk-target-heading"
        >
            <h3 id="spk-target-heading" className="font-semibold">
                Berapa targetnya?
            </h3>
            <div
                role="group"
                aria-label="Metode target"
                className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
            >
                {modes.map((mode) => (
                    <Button
                        key={mode.value}
                        type="button"
                        variant={
                            planningMode === mode.value ? 'default' : 'ghost'
                        }
                        className="min-h-11 flex-1 text-xs sm:text-sm"
                        aria-pressed={planningMode === mode.value}
                        onClick={() => props.onPlanningModeChange(mode.value)}
                    >
                        {mode.label}
                    </Button>
                ))}
            </div>
            <div className="space-y-2">
                <Label htmlFor="spk-target">
                    {isBatch ? 'Total batch' : 'Target produksi'} ({unit})
                </Label>
                <div className="relative">
                    <Input
                        id="spk-target"
                        type="number"
                        step={isBatch ? undefined : '0.01'}
                        min={isBatch ? 1 : undefined}
                        value={value || ''}
                        onChange={(event) =>
                            onChange(Number(event.target.value) || 0)
                        }
                        aria-describedby="spk-target-equivalent"
                        className="h-14 pr-24 text-xl font-semibold tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-4 top-4 text-sm font-medium text-muted-foreground">
                        {unit}
                    </span>
                </div>
                <p
                    id="spk-target-equivalent"
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                >
                    {bomOutputQty <= 0
                        ? 'Pilih resep untuk menghitung kebutuhan bahan.'
                        : isBatch
                          ? `${props.batchCount} batch × ${bomOutputQty} ${bomPrimaryUnit} = ${formatProductionQuantity(baseQty, props.bomProductVariant)}`
                          : isSales
                            ? `${props.enteredTargetQty} ${salesUnit} × ${props.conversionFactor} ${bomPrimaryUnit}/${salesUnit} = ${baseQty.toLocaleString('id-ID')} ${bomPrimaryUnit}`
                            : `Output resep: ${bomOutputQty.toLocaleString('id-ID')} ${bomPrimaryUnit} / batch`}
                </p>
            </div>
        </section>
    );
}
