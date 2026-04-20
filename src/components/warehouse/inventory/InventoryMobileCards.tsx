'use client';

import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';

import { ThresholdDialog } from './ThresholdDialog';
import { cn, formatQuantity } from '@/lib/utils/utils';
import type { InventoryItem } from './inventory-table-types';

interface InventoryMobileCardsProps {
    paginatedInventory: InventoryItem[];
    variantTotals: Record<string, number>;
    selectedItems: Set<string>;
    toggleSelectItem: (id: string) => void;
    isGlobalLowStock: (item: InventoryItem) => boolean;
}

export function InventoryMobileCards({
    paginatedInventory,
    variantTotals,
    selectedItems,
    toggleSelectItem,
    isGlobalLowStock,
}: InventoryMobileCardsProps) {
    return (
        <div className="flex-1 overflow-y-auto md:hidden p-4 space-y-3">
            {paginatedInventory.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center justify-center text-muted-foreground">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p>No inventory items found.</p>
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
                                        />
                                        <div>
                                            <h3 className="font-semibold text-sm leading-tight">{item.productVariant.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <code className="text-[10px] bg-background px-1 rounded border">{item.productVariant.skuCode}</code>
                                                <span className="text-[10px] text-muted-foreground">{item.location?.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {isLowStock ? (
                                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5 whitespace-nowrap">
                                            Low ({totalStockValue}/{thresholdValue})
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                            In Stock
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-3">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-background rounded p-2 border">
                                        <p className="text-[10px] text-muted-foreground uppercase">Stock</p>
                                        <p className="font-semibold text-sm">
                                            {formatQuantity(item.quantity)}
                                            <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{item.productVariant.primaryUnit}</span>
                                        </p>
                                    </div>
                                    <div className="bg-amber-500/5 rounded p-2 border border-amber-500/10">
                                        <p className="text-[10px] text-amber-600/80 uppercase">Reserved</p>
                                        <p className="font-semibold text-sm text-amber-700 dark:text-amber-500">
                                            {formatQuantity(item.reservedQuantity || 0)}
                                        </p>
                                    </div>
                                    <div className="bg-emerald-500/5 rounded p-2 border border-emerald-500/10">
                                        <p className="text-[10px] text-emerald-600/80 uppercase">Avail</p>
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
