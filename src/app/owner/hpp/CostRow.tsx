'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OwnerHppCost } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { Trash2 } from 'lucide-react';
import { NumberField } from './NumberField';
import { COST_FORMULA_LABELS, SELECT_CLASS } from './ui-classes';

type Formula = OwnerHppCost['formula'];
type FieldSpec = {
    key: string;
    label: string;
    kind: 'number' | 'text';
    positive?: boolean;
    /** Rupiah amounts accept dot-grouping; counts and percentages do not. */
    money?: boolean;
};

const FIELDS: Record<Formula, readonly FieldSpec[]> = {
    'fixed-per-output': [
        { key: 'value', label: 'Rp per keluaran', kind: 'number', money: true },
    ],
    'quantity-times-unit-cost': [
        { key: 'quantity', label: 'Jumlah', kind: 'number' },
        { key: 'unit', label: 'Satuan', kind: 'text' },
        {
            key: 'unitCost',
            label: 'Rp per satuan',
            kind: 'number',
            money: true,
        },
    ],
    'batch-cost-per-good-output': [
        { key: 'batchQuantity', label: 'Jumlah batch', kind: 'number' },
        { key: 'batchUnit', label: 'Satuan batch', kind: 'text' },
        {
            key: 'costPerBatchUnit',
            label: 'Rp per satuan batch',
            kind: 'number',
            money: true,
        },
        {
            key: 'goodOutputQuantity',
            label: 'Hasil baik',
            kind: 'number',
            positive: true,
        },
    ],
    'percentage-of-pre-overhead': [
        { key: 'percentage', label: '% subtotal', kind: 'number' },
    ],
};

interface CostRowProps {
    cost: OwnerHppCost;
    costPerOutput: number | null | undefined;
    onChange: (patch: Record<string, string | number>) => void;
    onFormulaChange: (formula: Formula) => void;
    onRemove: () => void;
}

export function CostRow({
    cost,
    costPerOutput,
    onChange,
    onFormulaChange,
    onRemove,
}: CostRowProps) {
    const values = cost as unknown as Record<string, string | number>;
    return (
        <div className="flex flex-wrap items-end gap-2">
            <label className="flex w-full flex-col gap-1 md:w-48">
                <span className="text-xs text-muted-foreground md:sr-only">
                    Nama biaya
                </span>
                <Input
                    aria-label="Nama biaya"
                    maxLength={80}
                    value={cost.label}
                    onChange={(event) =>
                        onChange({ label: event.target.value })
                    }
                />
            </label>
            <label className="flex w-full flex-col gap-1 md:w-56">
                <span className="text-xs text-muted-foreground md:sr-only">
                    Rumus
                </span>
                <select
                    aria-label="Rumus biaya"
                    className={SELECT_CLASS}
                    value={cost.formula}
                    onChange={(event) =>
                        onFormulaChange(event.target.value as Formula)
                    }
                >
                    {(Object.keys(COST_FORMULA_LABELS) as Formula[]).map(
                        (formula) => (
                            <option key={formula} value={formula}>
                                {COST_FORMULA_LABELS[formula]}
                            </option>
                        ),
                    )}
                </select>
            </label>
            {FIELDS[cost.formula].map((field) =>
                field.kind === 'number' ? (
                    <NumberField
                        key={field.key}
                        label={field.label}
                        positive={field.positive}
                        kind={field.money ? 'money' : 'quantity'}
                        className="w-[calc(50%-0.25rem)] md:w-32"
                        showLabel
                        value={Number(values[field.key])}
                        onChange={(value) => onChange({ [field.key]: value })}
                    />
                ) : (
                    <label
                        key={field.key}
                        className="flex w-[calc(50%-0.25rem)] flex-col gap-1 md:w-24"
                    >
                        <span className="text-xs text-muted-foreground">
                            {field.label}
                        </span>
                        <Input
                            aria-label={field.label}
                            maxLength={16}
                            value={String(values[field.key])}
                            onChange={(event) =>
                                onChange({ [field.key]: event.target.value })
                            }
                        />
                    </label>
                ),
            )}
            <p className="ml-auto pb-2 font-mono text-sm tabular-nums">
                {costPerOutput === null || costPerOutput === undefined
                    ? '-'
                    : formatRupiah(costPerOutput)}
            </p>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Hapus biaya"
                onClick={onRemove}
            >
                <Trash2 />
            </Button>
        </div>
    );
}
