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
} from '@/components/ui/dropdown-menu';
import {
    Search,
    Download,
    X,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Layers,
} from 'lucide-react';
import { ProductType } from '@prisma/client';
import { BulkTransferDialog } from './BulkTransferDialog';
import { warehouseLabels } from '@/lib/labels';
import { BulkAdjustDialog } from './BulkAdjustDialog';
import { InventoryDesktopTable } from './InventoryDesktopTable';
import { InventoryMobileCards } from './InventoryMobileCards';
import { stockTotalsByUnit } from './inventory-display';
import { downloadCsv, reportFilename } from '@/lib/utils/csv-export';
import type {
    InventoryItem,
    InventoryTableProps,
    SortField,
    SortOrder,
} from './inventory-table-types';

export function InventoryTable({
    inventory,
    variantTotals,
    comparisonData,
    showComparison,
    initialDate,
    initialCompareDate: _initialCompareDate,
    showPrices = false,
    abcMap,
    totalStock: _totalStock,
    totalValue,
    customerOwnedValue,
    topBadges,
    dataError,
    comparisonError,
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
    const isLocationSpecific =
        new Set(searchParams.getAll('locationId')).size === 1;
    const historical = !!initialDate;
    const allLocationsParams = new URLSearchParams(searchParams.toString());
    allLocationsParams.delete('locationId');
    const allLocationsHref = `?${allLocationsParams}`;

    // Check if any filters are active
    const hasFilters = !!(
        searchTerm ||
        productTypeFilter !== 'all' ||
        searchParams.get('lowStock') === 'true'
    );

    // Helper function to check if variant is low stock
    const isGlobalLowStock = useCallback(
        (item: InventoryItem) => {
            const threshold = item.productVariant.minStockAlert;
            if (!threshold) return false;
            return variantTotals[item.productVariantId] < threshold;
        },
        [variantTotals],
    );

    // Filter and sort inventory
    const processedInventory = useMemo(() => {
        let filtered = [...inventory];

        // Apply search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (item) =>
                    item.productVariant.name.toLowerCase().includes(search) ||
                    item.productVariant.skuCode
                        .toLowerCase()
                        .includes(search) ||
                    item.location.name.toLowerCase().includes(search),
            );
        }

        // Apply product type filter
        if (productTypeFilter !== 'all') {
            filtered = filtered.filter(
                (item) =>
                    item.productVariant.product.productType ===
                    productTypeFilter,
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
    }, [
        inventory,
        searchTerm,
        productTypeFilter,
        sortField,
        sortOrder,
        isGlobalLowStock,
    ]);

    // Reset pagination when filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, productTypeFilter, sortField, sortOrder, inventory]);

    // Reconcile/clear selection when filters or underlying inventory change
    React.useEffect(() => {
        setSelectedItems((prev) => {
            if (prev.size === 0) return prev;
            const validIds = new Set(processedInventory.map((i) => i.id));
            const updated = new Set<string>();
            for (const id of prev) {
                if (validIds.has(id)) updated.add(id);
            }
            return updated.size === prev.size ? prev : updated;
        });
    }, [processedInventory]);

    const totalPages = Math.ceil(processedInventory.length / ITEMS_PER_PAGE);
    const page = Math.min(currentPage, Math.max(totalPages, 1));
    const totalsByUnit = stockTotalsByUnit(processedInventory);
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const paginatedInventory = processedInventory.slice(
        startIndex,
        startIndex + ITEMS_PER_PAGE,
    );

    // Selection Logic
    const toggleSelectAll = () => {
        if (selectedItems.size === processedInventory.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(processedInventory.map((i) => i.id)));
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

    const isAllSelected =
        processedInventory.length > 0 &&
        selectedItems.size === processedInventory.length;
    const isSomeSelected =
        selectedItems.size > 0 &&
        selectedItems.size < processedInventory.length;

    const [showBulkTransfer, setShowBulkTransfer] = useState(false);
    const [showBulkAdjust, setShowBulkAdjust] = useState(false);

    React.useEffect(() => {
        setSelectedItems(new Set());
        setShowBulkTransfer(false);
        setShowBulkAdjust(false);
    }, [initialDate]);

    const selectedInventoryList = React.useMemo(
        () => processedInventory.filter((i) => selectedItems.has(i.id)),
        [processedInventory, selectedItems],
    );

    const isSameLocation = React.useMemo(() => {
        if (selectedInventoryList.length === 0) return true;
        const locId = selectedInventoryList[0].locationId;
        return selectedInventoryList.every((i) => i.locationId === locId);
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
        const itemsToExport =
            selectedItems.size > 0
                ? processedInventory.filter((i) => selectedItems.has(i.id))
                : processedInventory;

        const headers = [
            'Konteks waktu',
            'Nama Produk',
            'SKU',
            'Tipe Produk',
            'Lokasi',
            warehouseLabels.stock,
            'Unit',
            'Stok Min',
            'Status',
        ];
        const rows = itemsToExport.map((item) => {
            const isLowStock = isGlobalLowStock(item);
            const totalStock = variantTotals[item.productVariantId];
            const threshold = item.productVariant.minStockAlert || 0;

            return [
                initialDate
                    ? `Mutasi sampai ${initialDate} 00:00 UTC; master terkini`
                    : 'Stok saat ini',
                item.productVariant.name,
                item.productVariant.skuCode,
                item.productVariant.product.productType,
                item.location.name,
                item.quantity,
                item.productVariant.primaryUnit,
                threshold,
                historical
                    ? 'Historis; ambang master terkini'
                    : isLowStock
                      ? `Stok Menipis (${totalStock}/${threshold})`
                      : 'Di atas ambang minimum',
            ];
        });

        downloadCsv(
            reportFilename('Stok', initialDate ?? 'live'),
            headers,
            rows,
        );
    };

    return (
        <div className="h-full flex flex-col">
            {/* Filters Bar - Fixed at top */}
            <div className="flex flex-col items-stretch gap-3 shrink-0 p-3 border-b border-border bg-background">
                {/* Top Row: Date, Badges on mobile maybe keep simple or stack */}
                <div className="flex items-center gap-2 flex-wrap">
                    {topBadges && (
                        <>
                            {topBadges}
                            <div className="w-px h-6 bg-border" />
                        </>
                    )}
                    {/* Date Filter */}
                    <div className="flex flex-wrap items-center gap-2 bg-muted/50 border rounded-md px-2 py-1 min-h-11">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                            Stok per tanggal
                        </span>
                        <input
                            type="date"
                            aria-label="Stok per tanggal"
                            value={initialDate || ''}
                            onChange={(e) => {
                                const params = new URLSearchParams(
                                    searchParams.toString(),
                                );
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
                            <button
                                type="button"
                                aria-label="Kembali ke stok saat ini"
                                className="min-h-11 min-w-11 inline-flex items-center justify-center"
                                onClick={() => {
                                    const params = new URLSearchParams(
                                        searchParams.toString(),
                                    );
                                    params.delete('asOf');
                                    params.delete('compareWith');
                                    router.push(`?${params.toString()}`);
                                }}
                            >
                                <X className="h-4 w-4" />
                            </button>
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
                    {!historical && !dataError && selectedItems.size > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    <Layers className="mr-2 h-4 w-4" />
                                    {selectedItems.size} dipilih
                                    {isAllSelected &&
                                        processedInventory.length >
                                            ITEMS_PER_PAGE && (
                                            <span className="ml-1 opacity-70">
                                                (semua hasil filter)
                                            </span>
                                        )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Pilih</DropdownMenuLabel>
                                <DropdownMenuItem onClick={toggleSelectAll}>
                                    {isAllSelected
                                        ? 'Batal pilih semua'
                                        : 'Semua hasil filter'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        const pageIds = new Set(
                                            paginatedInventory.map((i) => i.id),
                                        );
                                        setSelectedItems(pageIds);
                                    }}
                                >
                                    Halaman ini saja
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>
                                    Aksi massal
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleExport}>
                                    Export yang dipilih
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    disabled={!isSameLocation}
                                    onClick={() => setShowBulkTransfer(true)}
                                >
                                    Transfer Massal
                                    {!isSameLocation && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            (Campur Lokasi)
                                        </span>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!isSameLocation}
                                    onClick={() => setShowBulkAdjust(true)}
                                >
                                    Penyesuaian Massal
                                    {!isSameLocation && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            (Campur Lokasi)
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {/* Search (Slim) */}
                    <div className="relative order-first w-full md:order-none md:flex-1 min-w-0">
                        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            aria-label="Cari produk / SKU"
                            placeholder="Cari produk / SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-11 h-11 text-sm bg-background border-border"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                aria-label="Hapus pencarian"
                                className="absolute right-0 top-0 h-11 w-11 inline-flex items-center justify-center"
                                onClick={() => setSearchTerm('')}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Product Type Filter (Slim) */}
                    <Select
                        value={productTypeFilter}
                        onValueChange={setProductTypeFilter}
                    >
                        <SelectTrigger
                            aria-label="Tipe produk"
                            className="w-auto flex-1 sm:flex-none sm:w-[180px] h-11 text-sm border-border bg-background"
                        >
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Tipe</SelectItem>
                            <SelectItem value={ProductType.RAW_MATERIAL}>
                                Bahan Baku
                            </SelectItem>
                            <SelectItem value={ProductType.INTERMEDIATE}>
                                Intermediate / WIP
                            </SelectItem>
                            <SelectItem value={ProductType.PACKAGING}>
                                Packaging
                            </SelectItem>
                            <SelectItem value={ProductType.WIP}>WIP</SelectItem>
                            <SelectItem value={ProductType.FINISHED_GOOD}>
                                Barang Jadi
                            </SelectItem>
                            <SelectItem value={ProductType.SCRAP}>
                                Scrap / Reject
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Export Button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={
                            !!dataError || processedInventory.length === 0
                        }
                        className="px-3 min-h-11"
                        title="Export semua/dipilih"
                        aria-label="Export CSV"
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>

                {!dataError && (
                    <div className="flex flex-wrap items-center gap-3 text-sm break-words">
                        {Object.entries(totalsByUnit).map(
                            ([unit, quantity]) => (
                                <div
                                    key={unit}
                                    className="text-muted-foreground"
                                >
                                    Stok hasil filter:{' '}
                                    <strong className="text-foreground">
                                        {formatQuantity(quantity)} {unit}
                                    </strong>
                                </div>
                            ),
                        )}
                        {showPrices &&
                            !historical &&
                            totalValue !== undefined && (
                                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                                    <span className="font-bold text-foreground text-blue-600 dark:text-blue-400">
                                        {formatRupiah(totalValue)}
                                    </span>
                                    <span className="text-[11px] uppercase tracking-wider opacity-70">
                                        nilai internal
                                    </span>
                                </div>
                            )}
                        {showPrices &&
                            !historical &&
                            customerOwnedValue !== undefined &&
                            customerOwnedValue > 0 && (
                                <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-md px-2 py-1 text-xs">
                                    <span className="font-bold">
                                        {formatRupiah(customerOwnedValue)}
                                    </span>
                                    <span className="opacity-70">
                                        milik customer
                                    </span>
                                </div>
                            )}
                    </div>
                )}
            </div>
            {historical && (
                <div
                    role="note"
                    className="p-3 text-sm text-muted-foreground border-b space-y-1"
                >
                    <p>
                        Mode baca-saja · kuantitas dari mutasi tercatat sampai{' '}
                        {initialDate} pukul 00.00 UTC (07.00 WIB), bukan saldo
                        akhir hari.
                    </p>
                    <p>
                        Reservasi, tersedia, biaya, dan ABC historis tidak
                        tersedia (—). Nama, kepemilikan lokasi, dan ambang
                        minimum memakai master terkini. Cakupan: pasangan
                        produk/lokasi yang masih tercatat pada daftar stok saat
                        ini.
                    </p>
                </div>
            )}
            {comparisonError && (
                <p role="alert" className="p-3 text-destructive">
                    {comparisonError}
                </p>
            )}
            {dataError ? (
                <div role="alert" className="p-4 space-y-3">
                    <p>{dataError}</p>
                    <Button variant="outline" onClick={() => router.refresh()}>
                        Coba lagi
                    </Button>
                </div>
            ) : (
                <>
                    <InventoryDesktopTable
                        paginatedInventory={paginatedInventory}
                        processedInventoryCount={processedInventory.length}
                        isLocationSpecific={isLocationSpecific}
                        showPrices={showPrices && !historical}
                        historical={historical}
                        allLocationsHref={allLocationsHref}
                        showComparison={showComparison}
                        comparisonData={comparisonData}
                        abcMap={historical ? undefined : abcMap}
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
                        historical={historical}
                        allLocationsHref={allLocationsHref}
                        paginatedInventory={paginatedInventory}
                        variantTotals={variantTotals}
                        selectedItems={selectedItems}
                        toggleSelectItem={toggleSelectItem}
                        isGlobalLowStock={isGlobalLowStock}
                        isLocationSpecific={isLocationSpecific}
                        hasFilters={hasFilters}
                        abcMap={historical ? undefined : abcMap}
                        sortField={sortField}
                        sortOrder={sortOrder}
                        handleSort={handleSort}
                    />

                    {/* Pagination Footer */}
                    <div className="flex flex-wrap gap-3 items-center justify-between px-3 shrink-0 py-2 border-t">
                        <div className="text-xs text-muted-foreground">
                            {selectedItems.size > 0 && (
                                <span className="mr-2 text-blue-600 dark:text-blue-400 font-medium">
                                    {selectedItems.size} dipilih ·{' '}
                                </span>
                            )}
                            Menampilkan{' '}
                            {processedInventory.length > 0 ? startIndex + 1 : 0}{' '}
                            sampai{' '}
                            {Math.min(
                                startIndex + ITEMS_PER_PAGE,
                                processedInventory.length,
                            )}{' '}
                            dari {processedInventory.length} item
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-11 w-11 p-0"
                                onClick={() =>
                                    setCurrentPage(Math.max(page - 1, 1))
                                }
                                disabled={page === 1}
                                aria-label="Halaman sebelumnya"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-xs font-medium min-w-[3rem] text-center">
                                Halaman {page} dari {Math.max(totalPages, 1)}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-11 w-11 p-0"
                                onClick={() =>
                                    setCurrentPage(
                                        Math.min(page + 1, totalPages),
                                    )
                                }
                                disabled={
                                    page === totalPages || totalPages === 0
                                }
                                aria-label="Halaman berikutnya"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
            <BulkTransferDialog
                open={!historical && !dataError && showBulkTransfer}
                onOpenChange={setShowBulkTransfer}
                items={selectedInventoryList}
                // userId={user?.id}
            />

            <BulkAdjustDialog
                open={!historical && !dataError && showBulkAdjust}
                onOpenChange={setShowBulkAdjust}
                items={selectedInventoryList}
                // userId={user?.id}
            />
        </div>
    );
}
