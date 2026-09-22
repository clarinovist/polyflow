'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/utils';
import {
    isPackagingSuppliesWarehouse,
    isRiskyOutputLocation,
    stageLabelId,
    type ProductionStage,
    type LocationLike,
} from '@/lib/locations/resolve-location';

export interface MaterialFlowRow {
    productVariantId: string;
    name: string;
    quantity: number;
    unit: string;
    sourceLocationId: string;
    sourceLocationName: string;
    currentStock?: number;
}
interface LocationFlowCardProps {
    stage: ProductionStage;
    sourceLocationName: string;
    materialSourceNames?: string[];
    outputLocationId: string;
    onOutputLocationChange: (id: string) => void;
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
    consumptionMode?: 'TRANSFER' | 'DIRECT';
    onConsumptionModeChange?: (mode: 'TRANSFER' | 'DIRECT') => void;
    allowDirect?: boolean;
    materials?: MaterialFlowRow[];
    sourceLocations?: { id: string; name: string }[];
    onMaterialSourceChange?: (variantId: string, locationId: string) => void;
    checkingStock?: boolean;
    stockError?: string | null;
    onRetryStock?: () => void;
}

function WarehouseSelect({
    label,
    value,
    locations,
    onChange,
}: {
    label: string;
    value: string;
    locations: { id: string; name: string }[];
    onChange: (id: string) => void;
}) {
    return (
        <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger
                aria-label={label}
                className="w-full min-w-0 min-h-11 data-[size=default]:h-auto whitespace-normal text-left [&>span]:block [&>span]:line-clamp-none [&>span]:break-words"
            >
                <SelectValue placeholder="Pilih gudang" />
            </SelectTrigger>
            <SelectContent
                position="popper"
                className="max-w-[calc(100vw-2rem)]"
                style={{ animation: 'none' }}
            >
                {locations.map((location) => (
                    <SelectItem
                        key={location.id}
                        value={location.id}
                        className="min-h-11 whitespace-normal break-words"
                    >
                        {location.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function ConsumptionModePicker({
    mode,
    onChange,
}: {
    mode: 'TRANSFER' | 'DIRECT';
    onChange: (mode: 'TRANSFER' | 'DIRECT') => void;
}) {
    return (
        <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
                Cara pemakaian bahan
            </legend>
            <div className="grid gap-2 xl:grid-cols-2">
                {(
                    [
                        [
                            'DIRECT',
                            'Langsung per bahan',
                            'Stok dipotong dari gudang asal masing-masing saat hasil dicatat.',
                        ],
                        [
                            'TRANSFER',
                            'Transfer ke satu lokasi',
                            'Pindahkan bahan dahulu, lalu catat hasil di lokasi pemakaian.',
                        ],
                    ] as const
                ).map(([value, title, description]) => (
                    <label
                        key={value}
                        className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 min-w-0',
                            mode === value
                                ? 'border-primary bg-primary/5'
                                : 'bg-background',
                        )}
                    >
                        <input
                            type="radio"
                            name="material-consumption-mode"
                            value={value}
                            checked={mode === value}
                            onChange={() => onChange(value)}
                            className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="space-y-1">
                            <span className="block text-sm font-medium">
                                {title}
                            </span>
                            <span className="block text-xs leading-relaxed text-muted-foreground">
                                {description}
                            </span>
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

export function LocationFlowCard(props: LocationFlowCardProps) {
    const {
        stage,
        materials = [],
        consumptionMode = 'TRANSFER',
        sourceLocations = [],
    } = props;
    const direct = consumptionMode === 'DIRECT';
    const consumptionEligible = props.activeLocations.filter(
        (l) => !isRiskyOutputLocation(l) && !isPackagingSuppliesWarehouse(l),
    );
    const outputEligible = props.activeLocations.filter(
        (l) => !isRiskyOutputLocation(l),
    );
    return (
        <section aria-label="Alur material" className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Alur material</h3>
                <Badge variant="secondary">Tahap {stageLabelId(stage)}</Badge>
            </div>
            {props.allowDirect && props.onConsumptionModeChange && (
                <ConsumptionModePicker
                    mode={consumptionMode}
                    onChange={props.onConsumptionModeChange}
                />
            )}
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <section className="min-w-0 space-y-3 rounded-lg border p-4 md:col-span-2">
                    <div>
                        <h4 className="text-sm font-semibold">1. Asal bahan</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {direct
                                ? 'Tentukan gudang yang stoknya akan dipotong untuk setiap bahan.'
                                : 'Bahan boleh berasal dari beberapa gudang. Asal transfer dapat diubah di detail SPK.'}
                        </p>
                    </div>
                    {materials.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {props.sourceLocationName ||
                                'Pilih resep dan target produksi terlebih dahulu.'}
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {materials.map((item) => (
                                <li
                                    key={item.productVariantId}
                                    className="grid min-w-0 gap-2 py-3 first:pt-0 last:pb-0 xl:grid-cols-2 xl:items-start"
                                >
                                    <div className="min-w-0">
                                        <p className="break-words text-sm font-medium">
                                            {item.name}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Kebutuhan{' '}
                                            {item.quantity.toLocaleString(
                                                'id-ID',
                                                {
                                                    maximumFractionDigits: 4,
                                                },
                                            )}{' '}
                                            {item.unit}
                                        </p>
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        {direct &&
                                        props.onMaterialSourceChange ? (
                                            <WarehouseSelect
                                                label={`Gudang asal ${item.name}`}
                                                value={item.sourceLocationId}
                                                locations={sourceLocations}
                                                onChange={(id) =>
                                                    props.onMaterialSourceChange?.(
                                                        item.productVariantId,
                                                        id,
                                                    )
                                                }
                                            />
                                        ) : (
                                            <p className="break-words text-sm">
                                                {item.sourceLocationName ||
                                                    'Belum ditentukan'}
                                            </p>
                                        )}
                                        {direct && (
                                            <p className="text-xs text-muted-foreground">
                                                {props.checkingStock
                                                    ? 'Memeriksa stok…'
                                                    : item.currentStock ===
                                                        undefined
                                                      ? 'Stok belum tersedia'
                                                      : `Stok: ${item.currentStock.toLocaleString('id-ID')} ${item.unit}`}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {props.stockError && (
                        <div role="alert" className="text-sm text-destructive">
                            <p>{props.stockError}</p>
                            <button
                                type="button"
                                onClick={props.onRetryStock}
                                className="min-h-11 underline"
                            >
                                Periksa stok lagi
                            </button>
                        </div>
                    )}
                </section>
                {!direct && (
                    <section className="space-y-3 rounded-lg border p-4">
                        <div>
                            <h4 className="text-sm font-semibold">
                                2. Tujuan transfer
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                Bahan dikumpulkan di sini sebelum dipakai. Stok
                                dipotong saat hasil dicatat.
                            </p>
                        </div>
                        <Label>Lokasi Pemakaian Bahan</Label>
                        <WarehouseSelect
                            label="Lokasi Pemakaian Bahan"
                            value={props.consumptionLocationId}
                            locations={consumptionEligible}
                            onChange={props.onConsumptionLocationChange}
                        />
                        {props.consumptionManuallyOverridden && (
                            <button
                                type="button"
                                className="text-xs text-primary underline min-h-9"
                                onClick={props.onResetConsumptionToDefault}
                            >
                                Gunakan lokasi pemakaian yang disarankan
                            </button>
                        )}
                    </section>
                )}
                <section
                    className={cn(
                        'min-w-0 space-y-3 rounded-lg border bg-muted/30 p-4',
                        direct && 'md:col-span-2',
                    )}
                >
                    <div>
                        <h4 className="text-sm font-semibold">
                            {direct ? '2' : '3'}. Penyimpanan hasil
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Terpisah dari asal bahan. Hasil produksi menambah
                            stok di gudang ini.
                        </p>
                    </div>
                    <Label>Lokasi Penyimpanan Hasil</Label>
                    <WarehouseSelect
                        label="Lokasi Penyimpanan Hasil"
                        value={props.outputLocationId}
                        locations={outputEligible}
                        onChange={props.onOutputLocationChange}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="break-words">
                            Disarankan: {props.recommendedOutputName}
                        </span>
                        {!props.outputIsRecommended &&
                            props.recommendedOutputId && (
                                <button
                                    type="button"
                                    className="text-primary underline min-h-9"
                                    onClick={props.onResetToDefault}
                                >
                                    Gunakan saran
                                </button>
                            )}
                    </div>
                    {props.outputIsRisky && (
                        <p role="alert" className="text-sm text-destructive">
                            Pilih gudang hasil atau area proses yang aktif,
                            bukan gudang bahan baku atau supplies.
                        </p>
                    )}
                </section>
            </div>
        </section>
    );
}
