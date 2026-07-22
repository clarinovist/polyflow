'use client';

import Link from 'next/link';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';

import { ThresholdDialog } from './ThresholdDialog';
import { cn, formatQuantity } from '@/lib/utils/utils';
import { warehouseComponentLabels } from '@/lib/labels';
import type { InventoryItem, SortField, SortOrder } from './inventory-table-types';

interface InventoryMobileCardsProps {
    paginatedInventory: InventoryItem[];
    variantTotals: Record<string, number>;
    selectedItems: Set<string>;
    toggleSelectItem: (id: string) => void;
    isGlobalLowStock: (item: InventoryItem) => boolean;
    isLocationSpecific?: boolean;
    hasFilters?: boolean;
    abcMap?: Record<string, string>;
    sortField?: SortField;
    sortOrder?: SortOrder;
    handleSort?: (field: SortField) => void;
}

export function InventoryMobileCards({
    paginatedInventory,
    variantTotals,
    selectedItems,
    toggleSelectItem,
    isGlobalLowStock,
    isLocationSpecific = false,
    hasFilters = false,
    abcMap,
    sortField = 'stock',
    sortOrder = 'desc',
    handleSort,
}: InventoryMobileCardsProps) {
    return (
        <div className="flex-1 overflow-y-auto md:hidden p-4 space-y-3">
            {/* Sort dropdown for mobile */}
            {handleSort && paginatedInventory.length > 0 && (
                <div className="flex items-center gap-2 pb-2">
                    <span className="text-xs text-muted-foreground">Urutkan:</span>
                    <Select value={sortField} onValueChange={(value) => handleSort(value as SortField)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="name">Nama</SelectItem>
                            <SelectItem value="stock">Stok</SelectItem>
                            <SelectItem value="location">Lokasi</SelectItem>
                            <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                    </Select>
                    <button
                        onClick={() => handleSort(sortField)}
                        className="h-8 w-8 flex items-center justify-center rounded border hover:bg-muted transition-colors"
                        aria-label={sortOrder === 'asc' ? 'Urutkan menurun' : 'Urutkan menaik'}
                    >
                        {sortOrder === 'asc' ? (
                            <ArrowUp className="h-4 w-4 text-blue-600" />
                        ) : (
                            <ArrowDown className="h-4 w-4 text-blue-600" />
                        )}
                    </button>
                </div>
            )}

            {paginatedInventory.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center justify-center text-muted-foreground">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    {isLocationSpecific ? (
                        <>
                            <p>Tidak ada stok di lokasi ini.</p>
                            <Link href="/warehouse/inventory" className="text-xs text-primary hover:underline mt-1">
                                Lihat semua lokasi
                            </Link>
                        </>
                    ) : hasFilters ? (
                        <>
                            <p>Tidak ada item yang cocok.</p>
                            <Link href="/warehouse/inventory" className="text-xs text-primary hover:underline mt-1">
                                Hapus filter
                            </Link>
                        </>
                    ) : (
                        <>
                            <p>Belum ada stok tercatat.</p>
                            <Link href="/warehouse/incoming" className="text-xs text-primary hover:underline mt-1">
                                Catat penerimaan barang
                            </Link>
                        </>
                    )}
                </div>
            ) : (
                paginatedInventory.map((item) => {
                    const isLowStock = isGlobalLowStock(item);
                    const totalStockValue = variantTotals[item.productVariantId];
                    const thresholdValue = item.productVariant.minStockAlert || 0;
                    const isSelected = selectedItems.has(item.id);

                    return (
                        <Card key={item.id} className={cn('overflow-hidden', isSelected && 'border-primary')}>
                            <CardHeader className="p-3 pb-2 bg-muted/40">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-3">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleSelectItem(item.id)}
                                            className="h-5 w-5 min-w-[20px]"
                                        />
                                        <div>
                                            <Link href={`/warehouse/inventory/${item.productVariantId}`}>
                                                <h3 className="font-semibold text-sm leading-tight hover:text-primary transition-colors">{item.productVariant.name}</h3>
                                            </Link>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <code className="text-[10px] bg-background px-1 rounded border">{item.productVariant.skuCode}</code>
                                                <span className="text-[10px] text-muted-foreground">{item.location?.name}</span>
                                                {abcMap && abcMap[item.productVariantId] && (
                                                    <Badge variant="outline" className={cn(
                                                        'h-4 px-1 text-[10px] font-bold',
                                                        abcMap[item.productVariantId] === 'A' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                                                            abcMap[item.productVariantId] === 'B' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                                                                'bg-muted text-muted-foreground border-border'
                                                    )}>
                                                        {abcMap[item.productVariantId]}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isLowStock ? (
                                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5 whitespace-nowrap">
                                            {warehouseComponentLabels.lowStock} ({totalStockValue}/{thresholdValue})
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                            Tersedia
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-3">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-background rounded p-2 border">
                                        <p className="text-[10px] text-muted-foreground uppercase">Stok</p>
                                        <p className="font-semibold text-sm">
                                            {formatQuantity(item.quantity)}
                                            <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{item.productVariant.primaryUnit}</span>
                                        </p>
                                    </div>
                                    <div className="bg-amber-500/5 rounded p-2 border border-amber-500/10">
                                        <p className="text-[10px] text-amber-600/80 uppercase">Terpesan</p>
                                        <p className="font-semibold text-sm text-amber-700 dark:text-amber-500">
                                            {formatQuantity(item.reservedQuantity || 0)}
                                        </p>
                                    </div>
                                    <div className="bg-emerald-500/5 rounded p-2 border border-emerald-500/10">
                                        <p className="text-[10px] text-emerald-600/80 uppercase">Tersedia</p>
                                        <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-500">
                                            {formatQuantity(item.availableQuantity || item.quantity)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end mt-3">
                                    <ThresholdDialog
                                        productVariantId={item.productVariantId}
                                        productName={item.productVariant.name}
                                        initialThreshold={thresholdValue}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
