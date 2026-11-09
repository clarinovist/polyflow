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

/**
 * Phone: a card (name, then quantity + scrap, price, subtotal).
 * lg: one row (Bahan, Jumlah, Susut %, Harga, Subtotal, remove).
 */
export const MATERIAL_ROW_GRID =
    'lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_36px]';

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
            className="px-1.5 py-0 text-[10px]"
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
        <div className="col-span-2 flex min-w-0 flex-col gap-1 lg:col-span-1">
            <span className="text-xs text-muted-foreground lg:sr-only">
                Harga per unit
            </span>
            <p className="flex h-11 items-center justify-end px-3 font-mono text-sm tabular-nums lg:h-9">
                {value === null || value === undefined
                    ? '-'
                    : formatRupiah(value)}
            </p>
        </div>
    );
}

function ScrapField({
    value,
    onChange,
}: {
    value: number;
    onChange: (value: number) => void;
}) {
    return <NumberField label="Susut %" value={value} onChange={onChange} />;
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

/**
 * First line: name with the source tag inside its right edge, remove button
 * on the right. The ERP hint lives in the tooltip so every row stays one line.
 */
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
            <div
                className="relative flex h-11 min-w-0 flex-1 items-center lg:h-9"
                title={hint}
            >
                {name}
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    <Tag tag={tag} />
                </span>
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
                        <p className="min-w-0 flex-1 truncate pr-14 text-sm font-medium">
                            {upstreamResult?.name ?? '-'}
                        </p>
                    }
                    tag="stage"
                    onRemove={onRemove}
                />
                <NumberField
                    label="Jumlah"
                    suffix={upstreamResult?.outputUnit.toLowerCase()}
                    value={material.qty}
                    onChange={(qty) => onChange({ qty })}
                />
                <ScrapField
                    value={material.scrapPercent}
                    onChange={(scrapPercent) => onChange({ scrapPercent })}
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
                        className="h-11 min-w-0 flex-1 pr-14 lg:h-9"
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
                suffix={material.unit.toLowerCase()}
                value={material.qty}
                onChange={(qty) => onChange({ qty })}
            />
            <ScrapField
                value={material.scrapPercent}
                onChange={(scrapPercent) => onChange({ scrapPercent })}
            />
            <NumberField
                label="Harga per unit"
                className="col-span-2 lg:col-span-1"
                kind="money"
                value={material.price}
                onChange={(price) => onChange({ price })}
            />
            <Subtotal value={costPerOutput} />
        </div>
    );
}
