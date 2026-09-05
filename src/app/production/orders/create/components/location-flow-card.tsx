'use client';

import { Badge } from '@/components/ui/badge';
import { FormLabel } from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRightLeft, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import {
    isPackagingSuppliesWarehouse,
    isRiskyOutputLocation,
    stageLabelId,
    type ProductionStage,
    type LocationLike,
} from '@/lib/locations/resolve-location';

interface LocationFlowCardProps {
    stage: ProductionStage;
    sourceLocationName: string;
    /** Warehouses the materials actually resolve to, one entry per distinct one */
    materialSourceNames?: string[];
    outputLocationId: string;
    onOutputLocationChange: (id: string) => void;
    /** Lokasi Pemakaian Bahan — transfer destination + backflush source */
    consumptionLocationId: string;
    onConsumptionLocationChange: (id: string) => void;
    activeLocations: LocationLike[];
    recommendedOutputId: string;
    recommendedOutputName: string;
    recommendedConsumptionId: string;
    outputIsRisky: boolean;
    outputIsRecommended: boolean;
    consumptionManuallyOverridden: boolean;
    outputManuallyOverridden: boolean;
    onResetToDefault: () => void;
    onResetConsumptionToDefault: () => void;
}

export function LocationFlowCard({
    stage,
    sourceLocationName,
    materialSourceNames = [],
    outputLocationId,
    onOutputLocationChange,
    consumptionLocationId,
    onConsumptionLocationChange,
    activeLocations,
    recommendedOutputId,
    recommendedOutputName,
    recommendedConsumptionId,
    outputIsRisky,
    outputIsRecommended,
    consumptionManuallyOverridden,
    outputManuallyOverridden,
    onResetToDefault,
    onResetConsumptionToDefault,
}: LocationFlowCardProps) {
    // A location is only a valid Lokasi Pemakaian Bahan when it is a real
    // production/WIP floor — never the raw-material warehouse or a supplies
    // store, so bahan cannot be "consumed" out of a storage warehouse.
    const consumptionEligible = activeLocations.filter(
        (l) =>
            !isRiskyOutputLocation(l) && !isPackagingSuppliesWarehouse(l),
    );
    return (
        <div
            className={cn(
                'rounded-lg border p-4 space-y-3',
                outputIsRisky
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-border bg-muted/30',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Alur material</h3>
                {outputIsRecommended ? (
                    <Badge variant="secondary" className="text-[10px]">
                        Disarankan
                    </Badge>
                ) : outputManuallyOverridden && recommendedOutputId ? (
                    <Badge variant="outline" className="text-[10px]">
                        Diubah manual
                    </Badge>
                ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                        Lokasi Asal Bahan (cek stok)
                    </Label>
                    <div className="flex min-h-10 items-center rounded-md border bg-background px-3 py-1.5 text-sm">
                        {materialSourceNames.length > 0
                            ? materialSourceNames.join(' · ')
                            : sourceLocationName}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        {materialSourceNames.length > 1
                            ? 'Ditentukan per bahan — kemasan dari gudang pengemas, adonan dari WIP.'
                            : 'Dipakai untuk cek ketersediaan material. Bukan tujuan transfer.'}
                    </p>
                </div>
                <div className="hidden sm:flex items-center justify-center pb-6 text-muted-foreground">
                    <ArrowRightLeft className="h-4 w-4" />
                </div>
                <div className="space-y-1.5">
                    <FormLabel className="text-xs">
                        Lokasi Pemakaian Bahan
                    </FormLabel>
                    <Select
                        value={consumptionLocationId || ''}
                        onValueChange={onConsumptionLocationChange}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Pilih lokasi pemakaian" />
                        </SelectTrigger>
                        <SelectContent>
                            {consumptionEligible.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                    {l.name}
                                    {l.id === recommendedConsumptionId
                                        ? ' · disarankan'
                                        : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                        Tujuan transfer bahan; bahan dipotong otomatis di sini
                        saat hasil dicatat.
                        {consumptionManuallyOverridden &&
                            recommendedConsumptionId && (
                                <>
                                    {' · '}
                                    <button
                                        type="button"
                                        className="underline underline-offset-2 text-primary"
                                        onClick={onResetConsumptionToDefault}
                                    >
                                        Kembalikan ke default
                                    </button>
                                </>
                            )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                        Tahap produksi
                    </Label>
                    <div className="flex min-h-10 items-center rounded-md border bg-background px-3 py-1.5 text-sm">
                        {stageLabelId(stage)}
                    </div>
                </div>
                <div className="hidden sm:flex items-center justify-center pb-6 text-muted-foreground">
                    <ArrowRightLeft className="h-4 w-4" />
                </div>
                <div className="space-y-1.5">
                    <FormLabel className="text-xs">
                        Lokasi Penyimpanan Hasil
                    </FormLabel>
                    <Select
                        value={outputLocationId || ''}
                        onValueChange={onOutputLocationChange}
                    >
                        <SelectTrigger
                            className={cn(
                                outputIsRisky &&
                                    'border-destructive text-destructive focus:ring-destructive',
                            )}
                        >
                            <SelectValue placeholder="Pilih lokasi hasil" />
                        </SelectTrigger>
                        <SelectContent>
                            {activeLocations.map((l) => {
                                const isRisky = isRiskyOutputLocation(l);
                                return (
                                    <SelectItem
                                        key={l.id}
                                        value={l.id}
                                        disabled={isRisky}
                                    >
                                        {l.name}
                                        {l.id === recommendedOutputId
                                            ? ' · disarankan'
                                            : ''}
                                        {isRisky
                                            ? ' (Terlarang / Supplies / RM)'
                                            : ''}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                        Default stage {stageLabelId(stage)}:{' '}
                        <span className="font-medium text-foreground">
                            {recommendedOutputName}
                        </span>
                        {!outputIsRecommended && recommendedOutputId && (
                            <>
                                {' · '}
                                <button
                                    type="button"
                                    className="underline underline-offset-2 text-primary"
                                    onClick={onResetToDefault}
                                >
                                    Kembalikan ke default
                                </button>
                            </>
                        )}
                    </p>
                </div>
            </div>

            {outputIsRisky && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        Lokasi hasil ini gudang bahan baku atau nonaktif.
                        Transfer material akan gagal (asal = tujuan) dan stok
                        hasil bisa salah. Pilih WIP / FG / packing area.
                    </span>
                </div>
            )}
        </div>
    );
}
