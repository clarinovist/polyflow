'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
    AlertCircle,
    Warehouse,
    ArrowUp,
    ArrowDown,
    ChevronsUpDown,
    Search,
    Download,
    X,
    Calendar as CalendarIcon,
} from 'lucide-react';
import { ThresholdDialog } from './ThresholdDialog';
import { format } from 'date-fns';
import { ProductType } from '@prisma/client';

type SortField = 'name' | 'sku' | 'location' | 'stock' | 'type' | 'status';
type SortOrder = 'asc' | 'desc';

interface InventoryTableProps {
    inventory: any[];
    variantTotals: Record<string, number>;
    comparisonData?: Record<string, number>; // variantId-locationId -> quantity
    showComparison?: boolean;
    initialDate?: string;
    initialCompareDate?: string;
}

export function InventoryTable({ inventory, variantTotals, comparisonData, showComparison, initialDate, initialCompareDate }: InventoryTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [productTypeFilter, setProductTypeFilter] = useState<string>('all');

    // Helper function to check if variant is low stock
    const isGlobalLowStock = (item: any) => {
        const threshold = item.productVariant.minStockAlert;
        if (!threshold) return false;
        return variantTotals[item.productVariantId] < threshold;
    };

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
            let aValue: any;
            let bValue: any;

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
    }, [inventory, searchTerm, productTypeFilter, sortField, sortOrder, variantTotals]);

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
        const headers = ['Product Name', 'SKU', 'Product Type', 'Location', 'Current Stock', 'Unit', 'Min Stock Alert', 'Status'];
        const rows = processedInventory.map(item => {
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

    // Sort icon component
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ChevronsUpDown className="h-4 w-4 text-slate-400" />;
        }
        return sortOrder === 'asc'
            ? <ArrowUp className="h-4 w-4 text-blue-600" />
            : <ArrowDown className="h-4 w-4 text-blue-600" />;
    };

    return (
        <div className="space-y-4">
            {/* Filters Bar */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Date Filter */}
                <div className="flex items-center gap-2 bg-slate-50 border rounded-md px-2 py-1">
                    <CalendarIcon className="h-4 w-4 text-slate-500" />
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
                        className="bg-transparent border-none text-sm focus:ring-0 p-0 text-slate-700 w-[130px]"
                    />
                    {initialDate && (
                        <X
                            className="h-4 w-4 text-slate-400 cursor-pointer hover:text-red-500"
                            onClick={() => {
                                const params = new URLSearchParams(searchParams.toString());
                                params.delete('asOf');
                                params.delete('compareWith');
                                router.push(`?${params.toString()}`);
                            }}
                        />
                    )}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by product, SKU, or location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {searchTerm && (
                        <X
                            className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 cursor-pointer hover:text-slate-600"
                            onClick={() => setSearchTerm('')}
                        />
                    )}
                </div>

                {/* Product Type Filter */}
                <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All Types" />
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
                <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                </Button>

                {/* Results Count */}
                <Badge variant="outline" className="ml-auto">
                    {processedInventory.length} items
                </Badge>
            </div>

            {/* Table */}
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/30">
                            <TableHead
                                className="pl-6 cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-2">
                                    Product Name
                                    <SortIcon field="name" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('sku')}
                            >
                                <div className="flex items-center gap-2">
                                    SKU
                                    <SortIcon field="sku" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('location')}
                            >
                                <div className="flex items-center gap-2">
                                    Location
                                    <SortIcon field="location" />
                                </div>
                            </TableHead>
                            <TableHead
                                className="text-right cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('stock')}
                            >
                                <div className="flex items-center justify-end gap-2">
                                    {showComparison ? 'New Stock' : 'Current Stock'}
                                    <SortIcon field="stock" />
                                </div>
                            </TableHead>
                            {showComparison && (
                                <>
                                    <TableHead className="text-right text-slate-500">Prev. Stock</TableHead>
                                    <TableHead className="text-right">Change</TableHead>
                                </>
                            )}
                            <TableHead>Unit</TableHead>
                            <TableHead
                                className="cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center gap-2">
                                    Status
                                    <SortIcon field="status" />
                                </div>
                            </TableHead>
                            <TableHead className="pr-6 text-right">Settings</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {processedInventory.map((item: any) => {
                            const isLowStock = isGlobalLowStock(item);
                            const totalStockValue = variantTotals[item.productVariantId];
                            const thresholdValue = item.productVariant.minStockAlert || 0;

                            // Comparison logic
                            const prevStock = comparisonData ? (comparisonData[`${item.productVariantId}-${item.locationId}`] || 0) : 0;
                            const currentStock = item.quantity;

                            const delta = currentStock - prevStock;

                            return (
                                <React.Fragment key={item.id}>
                                    <TableRow
                                        className={`${isLowStock ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-slate-50/50"} transition-colors`}
                                    >
                                        <TableCell className="pl-6 font-medium">
                                            {item.productVariant.name}
                                            <div className="text-xs text-slate-500 font-normal">
                                                {item.productVariant.product.productType}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">
                                                {item.productVariant.skuCode}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-slate-600">{item.location.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-slate-900">
                                            {currentStock.toLocaleString()}
                                        </TableCell>
                                        {showComparison && (
                                            <>
                                                <TableCell className="text-right text-slate-500 italic">
                                                    {prevStock.toLocaleString()}
                                                </TableCell>
                                                <TableCell className={`text-right font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                    {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                                                </TableCell>
                                            </>
                                        )}
                                        <TableCell className="text-slate-500 font-medium">
                                            {item.productVariant.primaryUnit}
                                        </TableCell>
                                        <TableCell>
                                            {isLowStock ? (
                                                <div className="space-y-1">
                                                    <Badge variant="destructive" className="flex w-fit items-center gap-1 shadow-sm">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Low Stock
                                                    </Badge>
                                                    <div className="text-[10px] text-red-600">
                                                        Total: {totalStockValue} / {thresholdValue}
                                                    </div>
                                                </div>
                                            ) : (
                                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-medium">
                                                    In Stock
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="pr-6 text-right">
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
                                <TableCell colSpan={7} className="text-center py-12">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Search className="h-8 w-8" />
                                        <p>No inventory records found.</p>
                                        <p className="text-sm">Try adjusting your search or filters.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
