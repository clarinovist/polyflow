'use client';

import Link from 'next/link';

import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, Warehouse } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ThresholdDialog } from './ThresholdDialog';
import { cn, formatQuantity, formatRupiah } from '@/lib/utils/utils';
import type { InventoryItem, SortField, SortOrder } from './inventory-table-types';

function SortIcon({ field, currentSortField, currentSortOrder }: { field: SortField; currentSortField: SortField; currentSortOrder: SortOrder }) {
    if (currentSortField !== field) {
        return <ChevronsUpDown className="h-4 w-4 text-muted-foreground/30" />;
    }

    return currentSortOrder === 'asc'
        ? <ArrowUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        : <ArrowDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
}

interface InventoryDesktopTableProps {
    paginatedInventory: InventoryItem[];
    processedInventoryCount: number;
    isLocationSpecific: boolean;
    showPrices: boolean;
    showComparison?: boolean;
    comparisonData?: Record<string, number>;
    abcMap?: Record<string, string>;
    variantTotals: Record<string, number>;
    selectedItems: Set<string>;
    isAllSelected: boolean;
    isSomeSelected: boolean;
    sortField: SortField;
    sortOrder: SortOrder;
    toggleSelectAll: () => void;
    toggleSelectItem: (id: string) => void;
    handleSort: (field: SortField) => void;
    isGlobalLowStock: (item: InventoryItem) => boolean;
}

export function InventoryDesktopTable({
    paginatedInventory,
    processedInventoryCount,
    isLocationSpecific,
    showPrices,
    showComparison,
    comparisonData,
    abcMap,
    variantTotals,
    selectedItems,
    isAllSelected,
    isSomeSelected,
    sortField,
    sortOrder,
    toggleSelectAll,
    toggleSelectItem,
    handleSort,
    isGlobalLowStock,
}: InventoryDesktopTableProps) {
    return (
        <div className="flex-1 overflow-hidden relative hidden md:block">
            <ResponsiveTable minWidth={900} className="h-full">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm shadow-sm">
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="w-[40px] pl-4 py-2">
                                <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={toggleSelectAll}
                                    aria-label="Select all"
                                    className={isSomeSelected && !isAllSelected ? 'opacity-50' : ''}
                                />
                            </TableHead>

                            <TableHead className="w-[40%] cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort('name')}>
                                <div className="flex items-center gap-2">
                                    Product Details
                                    <div className="flex flex-col">
                                        <SortIcon field="name" currentSortField={sortField} currentSortOrder={sortOrder} />
                                    </div>
                                </div>
                            </TableHead>

                            {!isLocationSpecific && (
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted transition-colors hidden md:table-cell" onClick={() => handleSort('location')}>
                                    <div className="flex items-center gap-2">
                                        Location
                                        <SortIcon field="location" currentSortField={sortField} currentSortOrder={sortOrder} />
                                    </div>
                                </TableHead>
                            )}

                            <TableHead className="text-right w-[20%] cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort('stock')}>
                                <div className="flex items-center justify-end gap-2">
                                    Stock
                                    <SortIcon field="stock" currentSortField={sortField} currentSortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="text-center hidden sm:table-cell">Reserved</TableHead>
                            <TableHead className="text-center hidden sm:table-cell">Available</TableHead>
                            {showPrices && (
                                <>
                                    <TableHead className="text-right">Unit Cost</TableHead>
                                    <TableHead className="text-right">Stock Value</TableHead>
                                </>
                            )}
                            <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                                <div className="flex items-center gap-2">
                                    Status
                                    <SortIcon field="status" currentSortField={sortField} currentSortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedInventory.map((item) => {
                            const isLowStock = isGlobalLowStock(item);
                            const totalStockValue = variantTotals[item.productVariantId];
                            const thresholdValue = item.productVariant.minStockAlert || 0;
                            const isSelected = selectedItems.has(item.id);
                            const prevStock = comparisonData ? (comparisonData[`${item.productVariantId}-${item.locationId}`] || 0) : 0;
                            const currentStock = item.quantity;
                            const delta = currentStock - prevStock;

                            return (
                                <TableRow
                                    key={item.id}
                                    className={cn(
                                        'transition-colors',
                                        isLowStock ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/30',
                                        isSelected ? 'bg-primary/20 hover:bg-primary/30' : ''
                                    )}
                                >
                                    <TableCell className="pl-4 py-1 align-middle">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleSelectItem(item.id)}
                                        />
                                    </TableCell>

                                    <TableCell className="py-1 align-middle">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-sm text-foreground leading-tight">
                                                    {item.productVariant.name}
                                                </span>
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
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Link
                                                    href={`/warehouse/inventory/${item.productVariantId}`}
                                                    className="bg-muted px-1 py-0.5 rounded border border-border text-foreground hover:bg-primary/10 hover:text-primary transition-colors font-mono"
                                                >
                                                    {item.productVariant.skuCode}
                                                </Link>
                                                <span>•</span>
                                                <span className="capitalize text-[10px]">
                                                    {item.productVariant.product.productType.toLowerCase().replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {!isLocationSpecific && (
                                        <TableCell className="align-middle hidden md:table-cell">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                                <Warehouse className="h-3 w-3 text-muted-foreground/50" />
                                                <span className="truncate max-w-[120px] block" title={item.location.name}>
                                                    {item.location.name}
                                                </span>
                                                {item.location.locationType === 'CUSTOMER_OWNED' && (
                                                    <Badge variant="outline" className="h-4 px-1 text-[9px] border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                                        Off-balance
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                    )}

                                    <TableCell className="text-right py-1 align-middle">
                                        <div className="flex flex-col items-end">
                                            <div className="font-semibold text-sm text-foreground tabular-nums inline-flex items-baseline">
                                                <span>{formatQuantity(currentStock)}</span>
                                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                                    {item.productVariant.primaryUnit}
                                                </span>
                                            </div>
                                            {showComparison && delta !== 0 && (
                                                <div className={`text-[10px] font-medium flex items-center gap-0.5 tabular-nums ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {delta > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                                                    {formatQuantity(Math.abs(delta))}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center py-1 align-middle hidden sm:table-cell">
                                        <div className="flex flex-col items-center gap-1">
                                            {item.reservedQuantity ? (
                                                <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10 tabular-nums">
                                                    {formatQuantity(item.reservedQuantity)} {item.productVariant.primaryUnit}
                                                </Badge>
                                            ) : !item.waitingQuantity ? (
                                                <span className="text-muted-foreground">-</span>
                                            ) : null}

                                            {item.waitingQuantity && item.waitingQuantity > 0 ? (
                                                <Badge variant="outline" className="text-slate-500 dark:text-slate-400 border-slate-500/20 bg-slate-500/10 tabular-nums flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                                                    {formatQuantity(item.waitingQuantity)} Waiting
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center py-1 align-middle hidden sm:table-cell">
                                        <div className={cn(
                                            'font-medium tabular-nums',
                                            (item.availableQuantity || 0) <= 0 ? 'text-red-500' : 'text-green-500'
                                        )}>
                                            {formatQuantity(item.availableQuantity ?? item.quantity)} {item.productVariant.primaryUnit}
                                        </div>
                                    </TableCell>

                                    {showPrices && (
                                        <>
                                            <TableCell className="text-right py-1 align-middle tabular-nums text-sm">
                                                {formatRupiah(item.averageCost || 0)}
                                            </TableCell>
                                            <TableCell className="text-right py-1 align-middle tabular-nums font-medium text-sm">
                                                {formatRupiah((item.averageCost || 0) * item.quantity)}
                                            </TableCell>
                                        </>
                                    )}

                                    <TableCell className="py-1 align-middle">
                                        {isLowStock ? (
                                            <div className="space-y-1">
                                                <Badge variant="destructive" className="h-5 text-[10px] px-1.5 shadow-none font-normal">
                                                    Low Stock
                                                </Badge>
                                                <div className="text-[10px] text-destructive font-medium whitespace-nowrap">
                                                    {totalStockValue}/{thresholdValue}
                                                </div>
                                            </div>
                                        ) : (
                                            <Badge variant="outline" className="h-5 text-[10px] px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-normal">
                                                In Stock
                                            </Badge>
                                        )}
                                    </TableCell>

                                    <TableCell className="pr-4 py-1 text-right align-middle">
                                        <ThresholdDialog
                                            productVariantId={item.productVariantId}
                                            productName={item.productVariant.name}
                                            initialThreshold={thresholdValue}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {processedInventoryCount === 0 && (
                            <TableRow>
                                <TableCell colSpan={isLocationSpecific ? 5 : 6} className="text-center py-8">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                                        <Search className="h-6 w-6" />
                                        <p className="text-sm">No items found.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </ResponsiveTable>
        </div>
    );
}
