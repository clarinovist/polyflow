'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StageResult } from '@/lib/owner-hpp/calculate-chain';
import {
    materialSourceTag,
    type MaterialSourceTag,
} from '@/lib/owner-hpp/material-source';
import { formatDecimal } from '@/lib/owner-hpp/number-input';
import type {
    OwnerHppMaterial,
    OwnerHppStage,
} from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { Trash2 } from 'lucide-react';
import { NumberField } from './NumberField';
import { SELECT_CLASS } from './ui-classes';

export const MATERIAL_GRID =
    'grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_72px_96px_72px_112px_72px_104px_36px] md:items-end';

const TAG_LABELS: Record<MaterialSourceTag | 'stage', string> = {
    erp: 'ERP',
    edited: 'diubah',
    manual: 'manual',
    empty: 'kosong',
    stage: 'tahap',
};

interface MaterialRowProps {
    material: OwnerHppMaterial;
    /** Stages this row may point at (no cycles), plus its current source. */
    upstreamOptions: readonly OwnerHppStage[];
    upstreamResult: StageResult | undefined;
    costPerOutput: number | null | undefined;
    onChange: (patch: Record<string, string | number | null>) => void;
    onRemove: () => void;
}

function Tag({ tag }: { tag: MaterialSourceTag | 'stage' }) {
    return (
        <Badge
            variant={
                tag === 'edited' || tag === 'empty' ? 'outline' : 'secondary'
            }
        >
            {TAG_LABELS[tag]}
        </Badge>
    );
}

function Subtotal({ value }: { value: number | null | undefined }) {
    return (
        <p className="text-right font-mono text-sm tabular-nums md:pb-2">
            {value === null || value === undefined ? '-' : formatRupiah(value)}
        </p>
    );
}

export function MaterialRow({
    material,
    upstreamOptions,
    upstreamResult,
    costPerOutput,
    onChange,
    onRemove,
}: MaterialRowProps) {
    const remove = (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Hapus baris bahan"
            onClick={onRemove}
        >
            <Trash2 />
        </Button>
    );

    if (material.kind === 'stage') {
        return (
            <div className={MATERIAL_GRID}>
                <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
                    <span className="text-xs text-muted-foreground md:sr-only">
                        Dari tahap
                    </span>
                    <select
                        aria-label="Dari tahap"
                        className={SELECT_CLASS}
                        value={material.from}
                        onChange={(event) =>
                            onChange({ from: event.target.value })
                        }
                    >
                        {upstreamOptions.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="self-end pb-2 text-sm text-muted-foreground">
                    {upstreamResult?.outputUnit ?? '-'}
                </p>
                <NumberField
                    label="Jumlah"
                    value={material.qty}
                    onChange={(qty) => onChange({ qty })}
                />
                <NumberField
                    label="Susut %"
                    value={material.scrapPercent}
                    onChange={(scrapPercent) => onChange({ scrapPercent })}
                />
                <p className="text-right font-mono text-sm tabular-nums md:pb-2">
                    {upstreamResult?.hppPerOutput == null
                        ? '-'
                        : formatRupiah(upstreamResult.hppPerOutput)}
                </p>
                <div className="md:pb-1.5">
                    <Tag tag="stage" />
                </div>
                <Subtotal value={costPerOutput} />
                {remove}
            </div>
        );
    }

    const tag = materialSourceTag(material);
    return (
        <div className={MATERIAL_GRID}>
            <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
                <span className="text-xs text-muted-foreground md:sr-only">
                    Nama bahan
                </span>
                <Input
                    aria-label="Nama bahan"
                    maxLength={80}
                    value={material.name}
                    onChange={(event) => onChange({ name: event.target.value })}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground md:sr-only">
                    Satuan
                </span>
                <Input
                    aria-label="Satuan"
                    maxLength={16}
                    value={material.unit}
                    onChange={(event) => onChange({ unit: event.target.value })}
                />
            </label>
            <NumberField
                label="Jumlah"
                value={material.qty}
                onChange={(qty) => onChange({ qty })}
            />
            <NumberField
                label="Susut %"
                value={material.scrapPercent}
                onChange={(scrapPercent) => onChange({ scrapPercent })}
            />
            <NumberField
                label="Harga"
                kind="money"
                value={material.price}
                onChange={(price) => onChange({ price })}
            />
            <div className="md:pb-1.5">
                <Tag tag={tag} />
                {tag === 'edited' && material.erpPrice !== null ? (
                    <p className="text-[11px] text-muted-foreground">
                        ERP {formatDecimal(material.erpPrice, 2)}
                    </p>
                ) : null}
            </div>
            <Subtotal value={costPerOutput} />
            {remove}
        </div>
    );
}
