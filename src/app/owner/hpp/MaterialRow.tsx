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
import type { OwnerHppMaterial } from '@/lib/owner-hpp/workspace-schema';
import { formatRupiah } from '@/lib/utils/utils';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { NumberField } from './NumberField';

/** Phone: a card of three lines. lg: one row (Bahan, Jumlah, Harga, Subtotal). */
export const MATERIAL_ROW_GRID =
    'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_36px]';

const ROW_CLASS = `grid grid-cols-2 gap-2 rounded-md border p-3 lg:items-end lg:rounded-none lg:border-0 lg:p-0 ${MATERIAL_ROW_GRID}`;

const TAG_LABELS: Record<MaterialSourceTag | 'stage', string> = {
    erp: 'ERP',
    edited: 'diubah',
    manual: 'manual',
    empty: 'kosong',
    stage: 'tahap',
};

interface MaterialRowProps {
    material: OwnerHppMaterial;
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

function ReadOnlyPrice({ value }: { value: number | null | undefined }) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground lg:sr-only">
                Harga per unit
            </span>
            <p className="flex h-11 items-center justify-end px-1 font-mono text-sm tabular-nums lg:h-9">
                {value === null || value === undefined
                    ? '-'
                    : formatRupiah(value)}
            </p>
        </div>
    );
}

function Subtotal({ value }: { value: number | null | undefined }) {
    return (
        <p className="col-span-2 flex items-center justify-between text-sm lg:col-span-1 lg:h-9 lg:justify-end">
            <span className="text-muted-foreground lg:sr-only">Subtotal</span>
            <span className="font-mono font-medium tabular-nums">
                {value === null || value === undefined
                    ? '-'
                    : formatRupiah(value)}
            </span>
        </p>
    );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:order-last lg:size-9"
            aria-label="Hapus baris bahan"
            onClick={onRemove}
        >
            <Trash2 />
        </Button>
    );
}

/** First line: name + source tag on the left, remove on the right. */
function NameLine({
    name,
    tag,
    hint,
    onRemove,
}: {
    name: ReactNode;
    tag: MaterialSourceTag | 'stage';
    hint?: string;
    onRemove: () => void;
}) {
    return (
        <div className="col-span-2 flex items-center gap-2 lg:contents">
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-col lg:items-start lg:gap-1">
                {name}
                <div className="flex shrink-0 items-center gap-2">
                    <Tag tag={tag} />
                    {hint ? (
                        <span className="text-[11px] text-muted-foreground">
                            {hint}
                        </span>
                    ) : null}
                </div>
            </div>
            <RemoveButton onRemove={onRemove} />
        </div>
    );
}

export function MaterialRow({
    material,
    upstreamResult,
    costPerOutput,
    onChange,
    onRemove,
}: MaterialRowProps) {
    if (material.kind === 'stage') {
        return (
            <div className={ROW_CLASS}>
                <NameLine
                    name={
                        <p className="min-w-0 flex-1 truncate text-sm font-medium lg:w-full lg:flex-none">
                            {upstreamResult?.name ?? '-'}
                        </p>
                    }
                    tag="stage"
                    onRemove={onRemove}
                />
                <NumberField
                    label="Jumlah"
                    value={material.qty}
                    onChange={(qty) => onChange({ qty })}
                />
                <ReadOnlyPrice value={upstreamResult?.hppPerOutput} />
                <Subtotal value={costPerOutput} />
            </div>
        );
    }

    const tag = materialSourceTag(material);
    const erpHint =
        tag === 'edited' && material.erpPrice !== null
            ? `ERP ${formatDecimal(material.erpPrice, 2)}`
            : undefined;
    return (
        <div className={ROW_CLASS}>
            <NameLine
                name={
                    <Input
                        aria-label="Nama bahan"
                        maxLength={80}
                        className="h-11 min-w-0 flex-1 lg:h-9 lg:w-full lg:flex-none"
                        value={material.name}
                        onChange={(event) =>
                            onChange({ name: event.target.value })
                        }
                    />
                }
                tag={tag}
                hint={erpHint}
                onRemove={onRemove}
            />
            <NumberField
                label="Jumlah"
                value={material.qty}
                onChange={(qty) => onChange({ qty })}
            />
            <NumberField
                label="Harga per unit"
                kind="money"
                value={material.price}
                onChange={(price) => onChange({ price })}
            />
            <Subtotal value={costPerOutput} />
        </div>
    );
}
