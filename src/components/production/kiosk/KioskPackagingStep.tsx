'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { packagingUnitLabel } from '@/lib/production/packaging-material';
import {
    materialName,
    newPackagingRow,
    selectableStock,
    sourcesFor,
    switchGroupBrand,
    type KioskPackagingContext,
} from '@/lib/production/kiosk-packaging';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { PackagingMaterialPicker } from '@/components/production/order-detail/PackagingMaterialPicker';

type Groups = PackagedOutputValues['groups'];
type Group = Groups[number];
type Row = Group['packaging'][number];

interface KioskPackagingStepProps {
    context: KioskPackagingContext | null;
    isLoading: boolean;
    error: string;
    onRetry: () => void;
    groups: Groups;
    onChange: (groups: Groups) => void;
    /** Good output of this entry in the base unit, from the Hasil step. */
    baseQty: number;
    unit: string;
}

const MAX_BRAND_GROUPS = 2;

/** "Kemasan & etiket" step of the kiosk Catat Hasil wizard. */
export function KioskPackagingStep({
    context,
    isLoading,
    error,
    onRetry,
    groups,
    onChange,
    baseQty,
    unit,
}: KioskPackagingStepProps) {
    if (baseQty <= 0) {
        return (
            <p className="rounded-xl border p-4 text-muted-foreground">
                Hasil 0: tidak ada kemasan yang dicatat untuk catatan ini.
            </p>
        );
    }
    if (error) {
        return (
            <div className="space-y-3 rounded-xl border p-4">
                <p role="alert" className="font-semibold text-destructive">
                    {error}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    className="h-12"
                    onClick={onRetry}
                >
                    Coba lagi
                </Button>
            </div>
        );
    }
    if (!context || isLoading) {
        return (
            <p role="status" className="p-4 text-muted-foreground">
                Memuat data kemasan…
            </p>
        );
    }

    const updateGroup = (index: number, next: Group) =>
        onChange(groups.map((group, i) => (i === index ? next : group)));
    const secondBrand = context.brands.find(
        (brand) => brand.id !== groups[0]?.productVariantId,
    );
    const canAddBrand =
        !context.fixedBrandId &&
        groups.length < MAX_BRAND_GROUPS &&
        Boolean(secondBrand);

    return (
        <div className="space-y-4">
            {groups.map((group, index) => (
                <GroupEditor
                    key={index}
                    context={context}
                    groups={groups}
                    index={index}
                    baseQty={baseQty}
                    unit={unit}
                    onGroupsChange={onChange}
                    onGroupChange={(next) => updateGroup(index, next)}
                />
            ))}
            {canAddBrand && secondBrand && (
                <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full border-dashed"
                    onClick={() =>
                        onChange([
                            ...groups,
                            switchGroupBrand(
                                context,
                                [
                                    {
                                        productVariantId: secondBrand.id,
                                        quantity: 0,
                                        packaging: [],
                                    },
                                ],
                                0,
                                secondBrand.id,
                            )[0],
                        ])
                    }
                >
                    + Merek kedua (maks. 2)
                </Button>
            )}
            {groups.length > 1 && (
                <Button
                    type="button"
                    variant="ghost"
                    className="h-12 w-full"
                    onClick={() =>
                        onChange([{ ...groups[0], quantity: baseQty }])
                    }
                >
                    Hapus merek kedua
                </Button>
            )}
            <p className="text-sm text-muted-foreground">
                Hitung semua lembar yang diambil untuk batch ini, termasuk yang
                rusak.
            </p>
        </div>
    );
}

function GroupEditor({
    context,
    groups,
    index,
    baseQty,
    unit,
    onGroupsChange,
    onGroupChange,
}: {
    context: KioskPackagingContext;
    groups: Groups;
    index: number;
    baseQty: number;
    unit: string;
    onGroupsChange: (groups: Groups) => void;
    onGroupChange: (group: Group) => void;
}) {
    const group = groups[index];
    const brand = context.brands.find(
        (item) => item.id === group.productVariantId,
    );
    const brandName = brand?.name ?? 'Merek';
    const requiredIds = new Set([
        ...(brand?.labelVariantId ? [brand.labelVariantId] : []),
        ...context.plannedPackagingIds,
    ]);
    const otherBrandIds = groups
        .filter((_, i) => i !== index)
        .map((item) => item.productVariantId);
    const addable = selectableStock(
        context,
        groups.map((item) => item.productVariantId),
    ).filter(
        (row) =>
            !group.packaging.some(
                (item) => item.productVariantId === row.productVariantId,
            ),
    );
    const updateRow = (rowIndex: number, next: Row) =>
        onGroupChange({
            ...group,
            packaging: group.packaging.map((row, i) =>
                i === rowIndex ? next : row,
            ),
        });

    return (
        <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">
                {groups.length > 1 ? `Merek hasil ${index + 1}` : 'Merek hasil'}
            </legend>
            {context.brands.length > 1 && !context.fixedBrandId ? (
                <div className="flex flex-wrap gap-2">
                    {context.brands.map((item) => (
                        <Button
                            key={item.id}
                            type="button"
                            variant={
                                item.id === group.productVariantId
                                    ? 'default'
                                    : 'outline'
                            }
                            aria-pressed={item.id === group.productVariantId}
                            disabled={otherBrandIds.includes(item.id)}
                            className="h-12 text-base"
                            onClick={() =>
                                onGroupsChange(
                                    switchGroupBrand(
                                        context,
                                        groups,
                                        index,
                                        item.id,
                                    ),
                                )
                            }
                        >
                            {item.name}
                        </Button>
                    ))}
                </div>
            ) : (
                <p className="text-lg font-bold">{brandName}</p>
            )}
            {groups.length > 1 ? (
                <label className="block text-sm font-medium">
                    Hasil untuk merek ini ({unit})
                    <Input
                        aria-label={`Jumlah hasil ${brandName}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.0001"
                        className="mt-1 h-14 text-xl"
                        value={group.quantity || ''}
                        onChange={(e) =>
                            onGroupChange({
                                ...group,
                                quantity: Number(e.target.value) || 0,
                            })
                        }
                    />
                </label>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Hasil:{' '}
                    {baseQty.toLocaleString('id-ID', {
                        maximumFractionDigits: 4,
                    })}{' '}
                    {unit}
                </p>
            )}
            {group.packaging.map((row, rowIndex) => (
                <PackagingRow
                    key={`${row.productVariantId}-${rowIndex}`}
                    context={context}
                    row={row}
                    isRequired={requiredIds.has(row.productVariantId)}
                    onChange={(next) => updateRow(rowIndex, next)}
                    onRemove={() =>
                        onGroupChange({
                            ...group,
                            packaging: group.packaging.filter(
                                (_, i) => i !== rowIndex,
                            ),
                        })
                    }
                />
            ))}
            <PackagingMaterialPicker
                stock={addable}
                value=""
                label={`Tambah kemasan ${index + 1}`}
                onChange={(material) =>
                    onGroupChange({
                        ...group,
                        packaging: [
                            ...group.packaging,
                            newPackagingRow(context, material.productVariantId),
                        ],
                    })
                }
            />
        </fieldset>
    );
}

function PackagingRow({
    context,
    row,
    isRequired,
    onChange,
    onRemove,
}: {
    context: KioskPackagingContext;
    row: Row;
    isRequired: boolean;
    onChange: (row: Row) => void;
    onRemove: () => void;
}) {
    const name = materialName(context, row.productVariantId);
    const sources = sourcesFor(context, row.productVariantId);
    const source = sources.find(
        (item) => item.locationId === row.sourceLocationId,
    );
    const isWeight = source?.unit === 'KG';

    return (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-2">
                <p className="font-semibold">{name}</p>
                <select
                    aria-label={`Gudang ${name}`}
                    className="h-12 w-full rounded-md border bg-background px-3"
                    value={row.sourceLocationId}
                    onChange={(e) => {
                        const next = sources.find(
                            (item) => item.locationId === e.target.value,
                        );
                        onChange({
                            ...row,
                            sourceLocationId: next?.locationId ?? '',
                            ownerCustomerId: next?.ownerCustomerId ?? null,
                            unit:
                                next?.unit === 'KG' || next?.unit === 'PCS'
                                    ? next.unit
                                    : undefined,
                        });
                    }}
                >
                    <option value="">Pilih gudang asal</option>
                    {sources.map((item) => (
                        <option key={item.id} value={item.locationId}>
                            {item.locationName} · stok{' '}
                            {item.quantity.toLocaleString('id-ID', {
                                maximumFractionDigits: 4,
                            })}{' '}
                            {packagingUnitLabel(item.unit)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex items-end gap-2">
                <label className="block text-sm">
                    Terpakai (
                    {source ? packagingUnitLabel(source.unit) : 'pilih gudang'})
                    <Input
                        aria-label={`Jumlah ${name}`}
                        type="number"
                        inputMode={isWeight ? 'decimal' : 'numeric'}
                        min="0"
                        step={isWeight ? '0.0001' : '1'}
                        className="mt-1 h-14 w-36 text-xl"
                        value={row.quantity || ''}
                        onChange={(e) =>
                            onChange({
                                ...row,
                                quantity: Number(e.target.value) || 0,
                            })
                        }
                    />
                </label>
                {!isRequired && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-14 w-14"
                        aria-label={`Hapus ${name}`}
                        onClick={onRemove}
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                )}
            </div>
        </div>
    );
}
