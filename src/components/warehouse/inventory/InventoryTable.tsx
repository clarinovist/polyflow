'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import React, { useState, useMemo, useCallback } from 'react';
import { formatRupiah, formatQuantity } from '@/lib/utils/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Search,
    Download,
    X,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Layers
} from 'lucide-react';
import { ProductType } from '@prisma/client';
import { BulkTransferDialog } from './BulkTransferDialog';
import { warehouseLabels } from '@/lib/labels';
import { BulkAdjustDialog } from './BulkAdjustDialog';
import { InventoryDesktopTable } from './InventoryDesktopTable';
import { InventoryMobileCards } from './InventoryMobileCards';
import type { InventoryItem, InventoryTableProps, SortField, SortOrder } from './inventory-table-types';

export function InventoryTable({
    inventory,
    variantTotals,
    comparisonData,
    showComparison,
    initialDate,
    initialCompareDate: _initialCompareDate,
    showPrices = false,
    abcMap,
    totalStock,
    totalValue,
    customerOwnedValue
}: InventoryTableProps) {

    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('stock');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [productTypeFilter, setProductTypeFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const ITEMS_PER_PAGE = 20;

    // Check if we are filtering by a specific location
    const locationIdFilter = searchParams.get('locationId');
    const isLocationSpecific = !!locationIdFilter;

    // Check if any filters are active
    const hasFilters = searchTerm || productTypeFilter !== 'all' || searchParams.get('lowStock') === 'true';

    // Helper function to check if variant is low stock
    const isGlobalLowStock = useCallback((item: InventoryItem) => {
        const threshold = item.productVariant.minStockAlert;
        if (!threshold) return false;
        return variantTotals[item.productVariantId] < threshold;
    }, [variantTotals]);

    // Filter and sort inventory
    const processedInventory = useMemo(() => {
        let filtered = [...inventory];

        // Apply search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                item.productVariant.name.toLowerCase().includes(search) ||
                item.productVariant.skuCode.toLowerCase().includes(search) ||
                item.location.name.toLowerCase().includes(search)
            );
        }

        // Apply product type filter
        if (productTypeFilter !== 'all') {
            filtered = filtered.filter(item =>
                item.productVariant.product.productType === productTypeFilter
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue: string | number;
            let bValue: string | number;

            switch (sortField) {
                case 'name':
                    aValue = a.productVariant.name.toLowerCase();
                    bValue = b.productVariant.name.toLowerCase();
                    break;
                case 'sku':
                    aValue = a.productVariant.skuCode.toLowerCase();
                    bValue = b.productVariant.skuCode.toLowerCase();
                    break;
                case 'location':
                    aValue = a.location.name.toLowerCase();
                    bValue = b.location.name.toLowerCase();
                    break;
                case 'stock':
                    aValue = a.quantity;
                    bValue = b.quantity;
                    break;
                case 'type':
                    aValue = a.productVariant.product.productType;
                    bValue = b.productVariant.product.productType;
                    break;
                case 'status':
                    aValue = isGlobalLowStock(a) ? 0 : 1; // Low stock first
                    bValue = isGlobalLowStock(b) ? 0 : 1;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [inventory, searchTerm, productTypeFilter, sortField, sortOrder, isGlobalLowStock]);

    // Reset pagination when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, productTypeFilter, sortField, sortOrder]);

    const totalPages = Math.ceil(processedInventory.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedInventory = processedInventory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // Selection Logic
    const toggleSelectAll = () => {
        if (selectedItems.size === processedInventory.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(processedInventory.map(i => i.id)));
        }
    };

    const toggleSelectItem = (id: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const isAllSelected = processedInventory.length > 0 && selectedItems.size === processedInventory.length;
    const isSomeSelected = selectedItems.size > 0 && selectedItems.size < processedInventory.length;

    const [showBulkTransfer, setShowBulkTransfer] = useState(false);
    const [showBulkAdjust, setShowBulkAdjust] = useState(false);

    const selectedInventoryList = React.useMemo(() =>
        processedInventory.filter(i => selectedItems.has(i.id)),
        [processedInventory, selectedItems]);

    const isSameLocation = React.useMemo(() => {
        if (selectedInventoryList.length === 0) return true;
        const locId = selectedInventoryList[0].locationId;
        return selectedInventoryList.every(i => i.locationId === locId);
    }, [selectedInventoryList]);

    // Handle column header click for sorting
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            // Toggle order if clicking same field
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new field with ascending order
            setSortField(field);
            setSortOrder('asc');
        }
    };

    // Export to CSV
    const handleExport = () => {
        const itemsToExport = selectedItems.size > 0
            ? processedInventory.filter(i => selectedItems.has(i.id))
            : processedInventory;

        const headers = ['Nama Produk', 'SKU', 'Tipe Produk', 'Lokasi', warehouseLabels.stock, 'Unit', 'Stok Min', 'Status'];
        const rows = itemsToExport.map(item => {
            const isLowStock = isGlobalLowStock(item);
            const totalStock = variantTotals[item.productVariantId];
            const threshold = item.productVariant.minStockAlert || 0;

            return [
                item.productVariant.name,
                item.productVariant.skuCode,
                item.productVariant.product.productType,
                item.location.name,
                item.quantity,
                item.productVariant.primaryUnit,
                threshold,
                isLowStock ? `Stok Menipis (${totalStock}/${threshold})` : 'Tersedia'
            ];
        });

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.setAttribute('href', url);
        link.setAttribute('download', `inventory_export_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Filters Bar - Fixed at top */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 px-4 pb-2 border-b border-border bg-background pt-2">
                {/* Top Row: Date, Badges on mobile maybe keep simple or stack */}
                <div className="flex items-center gap-2 flex-wrap">
                    {topBadges && (
                        <>
                            {topBadges}
                            <div className="w-px h-6 bg-border" />
                        </>
                    )}
                    {/* Date Filter */}
                    <div className="flex items-center gap-2 bg-muted/50 border rounded-md px-2 py-1">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Stok per tanggal</span>
                        <input
                            type="date"
                            value={initialDate || ''}
                            onChange={(e) => {
                                const params = new URLSearchParams(searchParams.toString());
                                if (e.target.value) {
                                    params.set('asOf', e.target.value);
                                } else {
                                    params.delete('asOf');
                                }
                                router.push(`?${params.toString()}`);
                            }}
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-transparent border-none text-sm focus:ring-0 p-0 text-foreground w-[130px]"
                        />
                        {initialDate && (
                            <X
                                className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-red-500"
                                onClick={() => {
                                    const params = new URLSearchParams(searchParams.toString());
                                    params.delete('asOf');
                                    params.delete('compareWith');
                                    router.push(`?${params.toString()}`);
                                }}
                            />
                        )}
                    </div>

                    {initialDate && (
                        <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-md px-2 py-1 text-xs">
                            <span className="font-medium">Mode historis</span>
                            <span className="opacity-70">·</span>
                            <span>{initialDate}</span>
                        </div>
                    )}

                    {/* Bulk Actions Checkbox or Dropdown */}
                    {selectedItems.size > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
                                    <Layers className="mr-2 h-4 w-4" />
                                    {selectedItems.size} dipilih
                                    {isAllSelected && processedInventory.length > ITEMS_PER_PAGE && (
                                        <span className="ml-1 opacity-70">(semua hasil filter)</span>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Aksi massal</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleExport}>
                                    Export yang dipilih
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    disabled={!isSameLocation}
                                    onClick={() => setShowBulkTransfer(true)}
                                >
                                    Transfer Massal
                                    {!isSameLocation && <span className="ml-2 text-xs text-muted-foreground">(Campur Lokasi)</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!isSameLocation}
                                    onClick={() => setShowBulkAdjust(true)}
                                >
                                    Penyesuaian Massal
                                    {!isSameLocation && <span className="ml-2 text-xs text-muted-foreground">(Campur Lokasi)</span>}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {/* Search (Slim) */}
                    <div className="relative flex-1 min-w-[150px]">
                        <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground/40" />
                        <Input
                            placeholder="Cari produk / SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 pr-8 h-8 text-[13px] bg-background border-border"
                        />
                        {searchTerm && (
                            <X
                                className="absolute right-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground"
                                onClick={() => setSearchTerm('')}
                            />
                        )}
                    </div>

                    {/* Product Type Filter (Slim) */}
                    <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
                        <SelectTrigger className="w-full sm:w-[130px] h-8 text-[13px] border-border bg-background">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Tipe</SelectItem>
                            <SelectItem value={ProductType.RAW_MATERIAL}>Bahan Baku</SelectItem>
                            <SelectItem value={ProductType.INTERMEDIATE}>Intermediate / WIP</SelectItem>
                            <SelectItem value={ProductType.PACKAGING}>Packaging</SelectItem>
                            <SelectItem value={ProductType.WIP}>WIP</SelectItem>
                            <SelectItem value={ProductType.FINISHED_GOOD}>Barang Jadi</SelectItem>
                            <SelectItem value={ProductType.SCRAP}>Scrap / Reject</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Export Button */}
                    <Button variant="outline" size="sm" onClick={handleExport} className="px-3" title="Export semua/dipilih" aria-label="Export CSV">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-4 ml-auto text-sm px-2">
                    {totalStock !== undefined && (
                        <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                            <span className="font-bold text-foreground">{formatQuantity(totalStock)}</span>
                            <span className="text-[11px] uppercase tracking-wider opacity-70">total stok</span>
                        </div>
                    )}
                    {totalValue !== undefined && (
                        <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap border-l border-border pl-4">
                            <span className="font-bold text-foreground text-blue-600 dark:text-blue-400">{formatRupiah(totalValue)}</span>
                            <span className="text-[11px] uppercase tracking-wider opacity-70">nilai internal</span>
                        </div>
                    )}
                    {customerOwnedValue !== undefined && customerOwnedValue > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-md px-2 py-1 text-xs">
                            <span className="font-bold">{formatRupiah(customerOwnedValue)}</span>
                            <span className="opacity-70">milik customer</span>
                        </div>
                    )}
                </div>
            </div>

            <InventoryDesktopTable
                paginatedInventory={paginatedInventory}
                processedInventoryCount={processedInventory.length}
                isLocationSpecific={isLocationSpecific}
                showPrices={showPrices}
                showComparison={showComparison}
                comparisonData={comparisonData}
                abcMap={abcMap}
                variantTotals={variantTotals}
                selectedItems={selectedItems}
                isAllSelected={isAllSelected}
                isSomeSelected={isSomeSelected}
                sortField={sortField}
                sortOrder={sortOrder}
                toggleSelectAll={toggleSelectAll}
                toggleSelectItem={toggleSelectItem}
                handleSort={handleSort}
                isGlobalLowStock={isGlobalLowStock}
                hasFilters={hasFilters}
            />

            <InventoryMobileCards
                paginatedInventory={paginatedInventory}
                variantTotals={variantTotals}
                selectedItems={selectedItems}
                toggleSelectItem={toggleSelectItem}
                isGlobalLowStock={isGlobalLowStock}
                isLocationSpecific={isLocationSpecific}
                hasFilters={hasFilters}
            />

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-2 shrink-0 py-2 border-t">
                <div className="text-xs text-muted-foreground">
                    {selectedItems.size > 0 && (
                        <span className="mr-2 text-blue-600 dark:text-blue-400 font-medium">
                            {selectedItems.size} dipilih ·{' '}
                        </span>
                    )}
                    Menampilkan {processedInventory.length > 0 ? startIndex + 1 : 0} sampai {Math.min(startIndex + ITEMS_PER_PAGE, processedInventory.length)} dari {processedInventory.length} item
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        aria-label="Halaman sebelumnya"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-xs font-medium min-w-[3rem] text-center">
                        Halaman {currentPage} dari {Math.max(totalPages, 1)}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        aria-label="Halaman berikutnya"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <BulkTransferDialog
                open={showBulkTransfer}
                onOpenChange={setShowBulkTransfer}
                items={selectedInventoryList}
            // userId={user?.id}
            />

            <BulkAdjustDialog
                open={showBulkAdjust}
                onOpenChange={setShowBulkAdjust}
                items={selectedInventoryList}
            // userId={user?.id}
            />
        </div>
    );
}
