'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import React, { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatRupiah } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    Warehouse,
    ArrowUp,
    ArrowDown,
    ChevronsUpDown,
    Search,
    Download,
    X,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Layers
} from 'lucide-react';
import { ThresholdDialog } from './ThresholdDialog';
import { ProductType } from '@prisma/client';
import { BulkTransferDialog } from './BulkTransferDialog';
import { BulkAdjustDialog } from './BulkAdjustDialog';

type SortField = 'name' | 'sku' | 'location' | 'stock' | 'type' | 'status';
type SortOrder = 'asc' | 'desc';

// Sort icon component
const SortIcon = ({ field, currentSortField, currentSortOrder }: { field: SortField, currentSortField: SortField, currentSortOrder: SortOrder }) => {
    if (currentSortField !== field) {
        return <ChevronsUpDown className="h-4 w-4 text-slate-400" />;
    }
    return currentSortOrder === 'asc'
        ? <ArrowUp className="h-4 w-4 text-blue-600" />
        : <ArrowDown className="h-4 w-4 text-blue-600" />;
};

export interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    updatedAt: string | Date;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
        minStockAlert: number | null;
        price: number | null;
        product: {
            id: string;
            name: string;
            productType: string;
        };
    };
    location: {
        id: string;
        name: string;
    };
    reservedQuantity?: number;
    availableQuantity?: number;
}

interface InventoryTableProps {
    inventory: InventoryItem[];
    variantTotals: Record<string, number>;
    comparisonData?: Record<string, number>; // variantId-locationId -> quantity
    showComparison?: boolean;
    initialDate?: string;
    initialCompareDate?: string;
    showPrices?: boolean;
}

export function InventoryTable({ inventory, variantTotals, comparisonData, showComparison, initialDate, initialCompareDate: _initialCompareDate, showPrices = false }: InventoryTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [productTypeFilter, setProductTypeFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const ITEMS_PER_PAGE = 6;

    // Check if we are filtering by a specific location
    const locationIdFilter = searchParams.get('locationId');
    const isLocationSpecific = !!locationIdFilter;

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

        const headers = ['Product Name', 'SKU', 'Product Type', 'Location', 'Current Stock', 'Unit', 'Min Stock Alert', 'Status'];
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
                isLowStock ? `Low Stock (${totalStock}/${threshold})` : 'In Stock'
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
        <div className="space-y-4 h-full flex flex-col">
            {/* Filters Bar - Fixed at top */}
            <div className="flex items-center gap-3 flex-wrap shrink-0">
                {/* Date Filter */}
                <div className="flex items-center gap-2 bg-muted/50 border rounded-md px-2 py-1">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
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

                {/* Bulk Actions Checkbox or Dropdown */}
                {selectedItems.size > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
                                <Layers className="mr-2 h-4 w-4" />
                                {selectedItems.size} Selected
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleExport}>
                                Export Selected
                            </DropdownMenuItem>

                            <DropdownMenuItem
                                disabled={!isSameLocation}
                                onClick={() => setShowBulkTransfer(true)}
                            >
                                Bulk Transfer
                                {!isSameLocation && <span className="ml-2 text-xs text-muted-foreground">(Mix Locs)</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={!isSameLocation}
                                onClick={() => setShowBulkAdjust(true)}
                            >
                                Bulk Adjust
                                {!isSameLocation && <span className="ml-2 text-xs text-muted-foreground">(Mix Locs)</span>}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/50" />
                    <Input
                        placeholder="Search product..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {searchTerm && (
                        <X
                            className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground"
                            onClick={() => setSearchTerm('')}
                        />
                    )}
                </div>

                {/* Product Type Filter */}
                <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value={ProductType.RAW_MATERIAL}>RAW_MATERIAL</SelectItem>
                        <SelectItem value={ProductType.INTERMEDIATE}>INTERMEDIATE</SelectItem>
                        <SelectItem value={ProductType.PACKAGING}>PACKAGING</SelectItem>
                        <SelectItem value={ProductType.WIP}>WIP</SelectItem>
                        <SelectItem value={ProductType.FINISHED_GOOD}>FINISHED_GOOD</SelectItem>
                        <SelectItem value={ProductType.SCRAP}>SCRAP</SelectItem>
                    </SelectContent>
                </Select>

                {/* Export Button */}
                <Button variant="outline" size="sm" onClick={handleExport} className="px-3" title="Export All/Selected">
                    <Download className="h-4 w-4" />
                </Button>
            </div>

            {/* Table - Scrollable Area */}
            <div className="flex-1 overflow-auto rounded-lg border bg-background relative">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm shadow-sm">
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            {/* Checkbox Header */}
                            <TableHead className="w-[40px] pl-4">
                                <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={toggleSelectAll}
                                    aria-label="Select all"
                                    className={isSomeSelected && !isAllSelected ? "opacity-50" : ""}
                                />
                            </TableHead>

                            <TableHead
                                className="w-[40%] cursor-pointer hover:bg-muted transition-colors"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-2">
                                    Product Details
                                    <div className="flex flex-col">
                                        <SortIcon field="name" currentSortField={sortField} currentSortOrder={sortOrder} />
                                    </div>
                                </div>
                            </TableHead>

                            {!isLocationSpecific && (
                                <TableHead
                                    className="w-[20%] cursor-pointer hover:bg-muted transition-colors hidden md:table-cell"
                                    onClick={() => handleSort('location')}
                                >
                                    <div className="flex items-center gap-2">
                                        Location
                                        <SortIcon field="location" currentSortField={sortField} currentSortOrder={sortOrder} />
                                    </div>
                                </TableHead>
                            )}

                            <TableHead
                                className="text-right w-[20%] cursor-pointer hover:bg-muted transition-colors"
                                onClick={() => handleSort('stock')}
                            >
                                <div className="flex items-center justify-end gap-2">
                                    Stock
                                    <SortIcon field="stock" currentSortField={sortField} currentSortOrder={sortOrder} />
                                </div>
                            </TableHead>
                            <TableHead className="text-center">Reserved</TableHead>
                            <TableHead className="text-center">Available</TableHead>
                            {showPrices && (
                                <>
                                    <TableHead className="text-right">Unit Price</TableHead>
                                    <TableHead className="text-right">Value</TableHead>
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

                            // Comparison logic
                            const prevStock = comparisonData ? (comparisonData[`${item.productVariantId}-${item.locationId}`] || 0) : 0;
                            const currentStock = item.quantity;
                            const delta = currentStock - prevStock;

                            return (
                                <React.Fragment key={item.id}>
                                    <TableRow
                                        className={`${isLowStock ? "bg-red-500/10 hover:bg-red-500/20" : "hover:bg-muted/50"} transition-colors ${isSelected ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/10 dark:hover:bg-blue-900/20" : ""}`}
                                    >
                                        <TableCell className="pl-4 py-3 align-middle">
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => toggleSelectItem(item.id)}
                                            />
                                        </TableCell>

                                        <TableCell className="py-3 align-middle">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-sm text-foreground leading-tight">
                                                    {item.productVariant.name}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <code className="bg-muted px-1 py-0.5 rounded border border-border text-foreground">
                                                        {item.productVariant.skuCode}
                                                    </code>
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
                                                </div>
                                            </TableCell>
                                        )}

                                        <TableCell className="text-right align-middle">
                                            <div className="flex flex-col items-end">
                                                <div className="font-semibold text-sm text-foreground tabular-nums inline-flex items-baseline">
                                                    <span>{currentStock.toLocaleString()}</span>
                                                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                                                        {item.productVariant.primaryUnit}
                                                    </span>
                                                </div>
                                                {showComparison && delta !== 0 && (
                                                    <div className={`text-[10px] font-medium flex items-center gap-0.5 tabular-nums ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {delta > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                                                        {Math.abs(delta).toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center align-middle">
                                            {item.reservedQuantity ? (
                                                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 tabular-nums">
                                                    {item.reservedQuantity.toLocaleString()} {item.productVariant.primaryUnit}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center align-middle">
                                            <div className={cn(
                                                "font-medium tabular-nums",
                                                (item.availableQuantity || 0) <= 0 ? "text-red-600" : "text-green-600"
                                            )}>
                                                {(item.availableQuantity ?? item.quantity).toLocaleString()} {item.productVariant.primaryUnit}
                                            </div>
                                        </TableCell>

                                        {showPrices && (
                                            <>
                                                <TableCell className="text-right align-middle tabular-nums text-sm">
                                                    {formatRupiah(item.productVariant.price)}
                                                </TableCell>
                                                <TableCell className="text-right align-middle tabular-nums font-medium text-sm">
                                                    {formatRupiah((item.productVariant.price || 0) * item.quantity)}
                                                </TableCell>
                                            </>
                                        )}

                                        <TableCell className="align-middle">
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
                                                <Badge variant="outline" className="h-5 text-[10px] px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-normal">
                                                    In Stock
                                                </Badge>
                                            )}
                                        </TableCell>

                                        <TableCell className="pr-4 text-right align-middle">
                                            <ThresholdDialog
                                                productVariantId={item.productVariantId}
                                                productName={item.productVariant.name}
                                                initialThreshold={thresholdValue}
                                            />
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
                            );
                        })}
                        {processedInventory.length === 0 && (
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
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-2 shrink-0 py-2 border-t">
                <div className="text-xs text-muted-foreground">
                    Showing {processedInventory.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + ITEMS_PER_PAGE, processedInventory.length)} of {processedInventory.length} items
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-xs font-medium min-w-[3rem] text-center">
                        Page {currentPage} of {Math.max(totalPages, 1)}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
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
