'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MaterialRequirement } from '../hooks/use-bom-material-preview';

interface RawMaterial {
    id: string;
    name: string;
    primaryUnit: string;
}

interface MaterialPreviewPanelProps {
    sourceLocationName: string;
    items: { productVariantId: string; quantity: number }[];
    materialInfo: Record<string, Omit<MaterialRequirement, 'requiredQty'>>;
    suggestedSource: { id: string; name: string } | null;
    isCalculating: boolean;
    hasStockIssues: boolean;
    /** Set when the last material calculation request failed (see use-bom-material-preview) */
    error?: string | null;
    onAcceptSuggestedSource: () => void;
    /** C1: Editable mode — enables qty editing and add/remove lines */
    editable?: boolean;
    /** C1: Available raw materials for "add line" dropdown */
    rawMaterials?: RawMaterial[];
    /** C2: Warehouses the "Tambah bahan" gudang picker offers */
    sourceLocations?: { id: string; name: string }[];
    /** C2: Warehouse pre-selected in the gudang picker (the SPK's own source) */
    defaultLocationId?: string;
    /** C2: productVariantId -> locationId -> stock, for the item dropdown's stock badge */
    rawMaterialStock?: Record<string, Record<string, number>>;
    /** C1: Called when user changes a quantity */
    onItemQtyChange?: (productVariantId: string, newQty: number) => void;
    /** C2: Called when user adds a new material line — locationId is the gudang they picked */
    onAddItem?: (
        productVariantId: string,
        qty: number,
        locationId: string,
    ) => void;
    /** C1: Called when user removes a material line */
    onRemoveItem?: (productVariantId: string) => void;
}

export function MaterialPreviewPanel({
    sourceLocationName,
    items,
    materialInfo,
    suggestedSource,
    isCalculating,
    hasStockIssues,
    error,
    onAcceptSuggestedSource,
    editable = false,
    rawMaterials = [],
    sourceLocations = [],
    defaultLocationId = '',
    rawMaterialStock = {},
    onItemQtyChange,
    onAddItem,
    onRemoveItem,
}: MaterialPreviewPanelProps) {
    const [addVariantId, setAddVariantId] = useState('');
    const [addQty, setAddQty] = useState(0);
    const [addLocationId, setAddLocationId] = useState(defaultLocationId);

    // Keep the gudang picker in sync with the SPK's own source location until
    // the user explicitly changes it themselves.
    useEffect(() => {
        if (!addLocationId && defaultLocationId) {
            setAddLocationId(defaultLocationId);
        }
    }, [defaultLocationId, addLocationId]);

    const existingIds = new Set(items.map((i) => i.productVariantId));
    const availableToAdd = rawMaterials.filter((rm) => !existingIds.has(rm.id));

    // Materials resolve their own warehouse, so the header names all of them
    // rather than pretending the order draws from a single place.
    const sourceNames = Array.from(
        new Set(
            items
                .map(
                    (i) =>
                        materialInfo[i.productVariantId]?.sourceLocationName ||
                        '',
                )
                .filter(Boolean),
        ),
    );
    const sourceSummary = sourceNames.join(' · ');

    const handleAdd = () => {
        if (addVariantId && addQty > 0 && addLocationId && onAddItem) {
            onAddItem(addVariantId, addQty, addLocationId);
            setAddVariantId('');
            setAddQty(0);
            // addLocationId stays — the next add is usually from the same gudang.
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Kebutuhan Bahan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                    Sumber: {sourceSummary || sourceLocationName || '—'}
                </div>

                {suggestedSource && (
                    <Alert className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-sm">
                            Stok ditemukan di gudang lain
                        </AlertTitle>
                        <AlertDescription className="text-xs flex items-center justify-between gap-3">
                            <span>
                                Terdeteksi stok di{' '}
                                <span className="font-medium">
                                    {suggestedSource.name}
                                </span>
                                .
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={onAcceptSuggestedSource}
                            >
                                Pakai gudang ini
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                {error && items.length === 0 && (
                    <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="text-sm">
                            Gagal menghitung kebutuhan bahan
                        </AlertTitle>
                        <AlertDescription className="text-xs">
                            Coba lagi atau hubungi admin.
                        </AlertDescription>
                    </Alert>
                )}

                {hasStockIssues && (
                    <Alert
                        variant="default"
                        className="py-2 border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20"
                    >
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <AlertTitle className="text-sm text-amber-800 dark:text-amber-400">
                            Kekurangan bahan
                        </AlertTitle>
                        <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                            SPK akan berstatus <b>Menunggu Bahan</b>.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="border rounded-md overflow-x-auto max-h-[75vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="h-8 text-xs">
                                    Item
                                </TableHead>
                                <TableHead className="h-8 text-xs w-[100px] text-right">
                                    Kebutuhan
                                </TableHead>
                                <TableHead className="h-8 text-xs w-[70px] text-right">
                                    Stok
                                </TableHead>
                                <TableHead className="h-8 text-xs w-[110px]">
                                    Asal
                                </TableHead>
                                {editable && (
                                    <TableHead className="h-8 text-xs w-[40px]" />
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 && !isCalculating && (
                                <TableRow>
                                    <TableCell
                                        colSpan={editable ? 5 : 4}
                                        className="text-center text-slate-400 dark:text-slate-300 py-8 text-xs"
                                    >
                                        Pilih produk & target dulu
                                    </TableCell>
                                </TableRow>
                            )}

                            {isCalculating && (
                                <TableRow>
                                    <TableCell
                                        colSpan={editable ? 5 : 4}
                                        className="text-center py-8"
                                    >
                                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400 dark:text-slate-300" />
                                    </TableCell>
                                </TableRow>
                            )}

                            {items.map((item) => {
                                const info =
                                    materialInfo[item.productVariantId];
                                // BOM lines always have stock data. Ad-hoc lines
                                // do too once the user has picked a gudang in
                                // "Tambah bahan" (stdQty is set as a sentinel
                                // then — see mergedMaterialInfo in the parent).
                                // Still-unresolved ad-hoc lines have stdQty=0.
                                const hasStockData = info && info.stdQty > 0;
                                // Short only when no warehouse covers it — this
                                // must match the rule that sets WAITING_MATERIAL.
                                const isLowStock =
                                    hasStockData &&
                                    info &&
                                    item.quantity >
                                        (info.totalStock ?? info.currentStock);

                                return (
                                    <TableRow key={item.productVariantId}>
                                        <TableCell className="py-2">
                                            <div className="font-medium text-xs">
                                                {info?.name || 'Unknown'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2 text-right">
                                            {editable && onItemQtyChange ? (
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min={0}
                                                    className="h-7 text-xs text-right"
                                                    value={item.quantity}
                                                    onChange={(e) =>
                                                        onItemQtyChange(
                                                            item.productVariantId,
                                                            Number(
                                                                e.target.value,
                                                            ) || 0,
                                                        )
                                                    }
                                                    onWheel={(e) =>
                                                        e.currentTarget.blur()
                                                    }
                                                />
                                            ) : (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-xs font-semibold">
                                                        {Number(
                                                            item.quantity,
                                                        ).toFixed(2)}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-300">
                                                        {info?.unit}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-2 text-right">
                                            <div className="flex flex-col items-end">
                                                {hasStockData ? (
                                                    <>
                                                        <span
                                                            className={`text-xs ${isLowStock ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}
                                                        >
                                                            {info?.currentStock ??
                                                                0}
                                                        </span>
                                                        {isLowStock && (
                                                            <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                                                                Kurang
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-300">
                                                        —
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                                {info?.sourceLocationName ||
                                                    '—'}
                                            </span>
                                        </TableCell>
                                        {editable && onRemoveItem && (
                                            <TableCell className="py-2 text-right">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() =>
                                                        onRemoveItem(
                                                            item.productVariantId,
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* C2: Add material line — gudang first, then item (annotated
                    with stock at that gudang), then qty. Item picker stays
                    disabled until a gudang is chosen, so the order can't be
                    skipped. */}
                {editable && availableToAdd.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                        <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">
                                Gudang
                            </span>
                            <Select
                                value={addLocationId}
                                onValueChange={setAddLocationId}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Pilih gudang" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sourceLocations.map((loc) => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end gap-2">
                            <div className="flex-1 space-y-1">
                                <span className="text-[10px] text-muted-foreground">
                                    Tambah bahan
                                </span>
                                <Select
                                    value={addVariantId}
                                    onValueChange={setAddVariantId}
                                    disabled={!addLocationId}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Pilih bahan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableToAdd.map((rm) => (
                                            <SelectItem
                                                key={rm.id}
                                                value={rm.id}
                                            >
                                                <div className="flex items-center justify-between gap-3 w-full">
                                                    <span>{rm.name}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Stok:{' '}
                                                        {rawMaterialStock[
                                                            rm.id
                                                        ]?.[addLocationId] ?? 0}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="w-24 space-y-1">
                                <span className="text-[10px] text-muted-foreground">
                                    Qty
                                </span>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    className="h-8 text-xs"
                                    value={addQty || ''}
                                    onChange={(e) =>
                                        setAddQty(Number(e.target.value) || 0)
                                    }
                                    onWheel={(e) => e.currentTarget.blur()}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                aria-label="Tambah bahan ke daftar"
                                disabled={
                                    !addVariantId ||
                                    addQty <= 0 ||
                                    !addLocationId
                                }
                                onClick={handleAdd}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
