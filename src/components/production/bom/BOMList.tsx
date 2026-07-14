'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, Archive } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BOMActions } from './BOMActions';
import { calculateBomItemCost } from '@/lib/utils/current-cost';
import { productionComponentLabels } from '@/lib/labels';
import { useBomBasePath } from './useBomBasePath';
import { bulkArchiveBom } from '@/actions/production/boms';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BOMListProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    boms: any[];
    showPrices?: boolean;
}

// Helper for currency formatting
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export function BOMList({ boms, showPrices }: BOMListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusTab, setStatusTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
    const [categoryTab, setCategoryTab] = useState('ALL');
    const [costSort, setCostSort] = useState<'none' | 'asc' | 'desc'>('none');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkArchiveDialog, setShowBulkArchiveDialog] = useState(false);
    const [isBulkArchiving, setIsBulkArchiving] = useState(false);
    const basePath = useBomBasePath();

    // Split boms by status
    const activeBoms = useMemo(() => boms.filter((b) => b.isActive !== false), [boms]);
    const archivedBoms = useMemo(() => boms.filter((b) => b.isActive === false), [boms]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getUnitCost = (bom: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalCost = bom.items.reduce((acc: number, item: any) => {
            return acc + calculateBomItemCost(item);
        }, 0);
        return totalCost / Number(bom.outputQuantity || 1);
    };

    const sourceBoms = statusTab === 'ACTIVE' ? activeBoms : archivedBoms;

    // Selection handlers
    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const selectableIds = filteredBoms
            .filter((b) => b.isActive !== false && !b.isDefault)
            .map((b) => b.id);
        if (selectableIds.length === 0) return;
        setSelectedIds((prev) => {
            if (selectableIds.every((id) => prev.has(id))) {
                return new Set();
            }
            return new Set(selectableIds);
        });
    };

    async function handleBulkArchive() {
        if (selectedIds.size === 0) return;
        setIsBulkArchiving(true);
        try {
            const result = await bulkArchiveBom(Array.from(selectedIds));
            if (result.success) {
                const data = result.data;
                const successCount = data?.success?.length || 0;
                const failedCount = data?.failed?.length || 0;
                if (successCount > 0) {
                    toast.success(`${successCount} resep berhasil dinonaktifkan.`);
                }
                if (failedCount > 0) {
                    toast.warning(`${failedCount} resep gagal dinonaktifkan (default atau error).`);
                }
                setSelectedIds(new Set());
            } else {
                toast.error('Gagal menonaktifkan resep', { description: result.error });
            }
        } catch (_error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsBulkArchiving(false);
            setShowBulkArchiveDialog(false);
        }
    }

    const filteredBoms = useMemo(() => {
        const filtered = sourceBoms.filter((bom) => {
            const matchesSearch = bom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                bom.productVariant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                bom.productVariant.skuCode.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = categoryTab === 'ALL' || (bom.category || 'STANDARD') === categoryTab;

            return matchesSearch && matchesCategory;
        });

        if (costSort !== 'none') {
            filtered.sort((a, b) => {
                const costA = getUnitCost(a);
                const costB = getUnitCost(b);
                return costSort === 'asc' ? costA - costB : costB - costA;
            });
        }

        return filtered;
    }, [sourceBoms, searchTerm, categoryTab, costSort]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={productionComponentLabels.search}
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && statusTab === 'ACTIVE' && (
                        <Button
                            variant="outline"
                            onClick={() => setShowBulkArchiveDialog(true)}
                            className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                            <Archive className="h-4 w-4 mr-2" />
                            Nonaktifkan ({selectedIds.size})
                        </Button>
                    )}
                    <Link href={`${basePath}/create`}>
                        <Button className="w-full md:w-auto">
                            <Plus className="h-4 w-4 mr-2" />
                            New BOM
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Status tabs */}
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as 'ACTIVE' | 'ARCHIVED')} className="w-full">
                <TabsList>
                    <TabsTrigger value="ACTIVE">
                        Aktif
                        {activeBoms.length > 0 && (
                            <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">
                                {activeBoms.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="ARCHIVED">
                        Nonaktif
                        {archivedBoms.length > 0 && (
                            <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">
                                {archivedBoms.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={statusTab}>
                    {/* Category sub-tabs */}
                    <Tabs defaultValue="ALL" onValueChange={setCategoryTab} className="w-full mt-4">
                        <TabsList>
                            <TabsTrigger value="ALL">All Recipes</TabsTrigger>
                            <TabsTrigger value="MIXING">Mixing</TabsTrigger>
                            <TabsTrigger value="EXTRUSION">Extrusion</TabsTrigger>
                            <TabsTrigger value="PACKING">Packing</TabsTrigger>
                            <TabsTrigger value="STANDARD">Standard</TabsTrigger>
                        </TabsList>

                        <TabsContent value={categoryTab}>
                            <Card>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    {statusTab === 'ACTIVE' && (
                                                        <TableHead className="w-[40px]">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-gray-300"
                                                                checked={filteredBoms.filter((b) => b.isActive !== false && !b.isDefault).length > 0 && filteredBoms.filter((b) => b.isActive !== false && !b.isDefault).every((b) => selectedIds.has(b.id))}
                                                                onChange={toggleSelectAll}
                                                            />
                                                        </TableHead>
                                                    )}
                                                    <TableHead className="w-[300px]">Recipe & Product</TableHead>
                                                    <TableHead>Category</TableHead>
                                                    <TableHead>Basis Quantity</TableHead>
                                                    <TableHead>Ingredients</TableHead>
                                                    <TableHead className="text-center w-[100px]">Dipakai di WO</TableHead>
                                                    {showPrices && (
                                                        <TableHead className="text-right">
                                                            <button
                                                                onClick={() => setCostSort(prev => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none')}
                                                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                                            >
                                                                Cost / Unit
                                                                {costSort === 'none' && <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
                                                                {costSort === 'asc' && <ArrowUp className="h-3 w-3 text-blue-500" />}
                                                                {costSort === 'desc' && <ArrowDown className="h-3 w-3 text-blue-500" />}
                                                            </button>
                                                        </TableHead>
                                                    )}
                                                    <TableHead className="text-right w-[100px]">{productionComponentLabels.actions}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredBoms.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={showPrices ? 7 : 6} className="h-24 text-center text-muted-foreground">
                                                            <div className="flex flex-col items-center gap-2">
                                                                <span>
                                                                    {statusTab === 'ARCHIVED'
                                                                        ? 'Belum ada resep dinonaktifkan'
                                                                        : `Tidak ada resep ditemukan di ${categoryTab}`}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    filteredBoms.map((bom) => {
                                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                        const totalCost = bom.items.reduce((acc: number, item: any) => {
                                                            return acc + calculateBomItemCost(item);
                                                        }, 0);
                                                        const usageCount = bom._count?.ProductionOrder ?? 0;

                                                        return (
                                                            <TableRow key={bom.id} className="group">
                                                                {statusTab === 'ACTIVE' && (
                                                                    <TableCell className="w-[40px]">
                                                                        {!bom.isDefault && (
                                                                            <input
                                                                                type="checkbox"
                                                                                className="rounded border-gray-300"
                                                                                checked={selectedIds.has(bom.id)}
                                                                                onChange={() => toggleSelect(bom.id)}
                                                                            />
                                                                        )}
                                                                    </TableCell>
                                                                )}
                                                                <TableCell>
                                                                    <div className="flex flex-col">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-medium text-sm">{bom.name}</span>
                                                                            {bom.isDefault && (
                                                                                <Badge className="text-[10px] h-5 px-1.5 font-bold bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-500/20 gap-1">
                                                                                    <span className="relative flex h-1.5 w-1.5 mr-0.5">
                                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                                                                    </span>
                                                                                    DEFAULT
                                                                                </Badge>
                                                                            )}
                                                                            {bom.isActive === false && (
                                                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold text-muted-foreground">
                                                                                    Nonaktif
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded uppercase">
                                                                                {bom.productVariant.skuCode}
                                                                            </span>
                                                                            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                                                                {bom.productVariant.name}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant="outline" className="text-[10px] font-normal px-2 py-0.5">
                                                                        {bom.category || 'STANDARD'}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-sm">
                                                                            {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant="secondary" className="font-normal text-[11px]">
                                                                        {bom.items.length} materials
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    {usageCount > 0 ? (
                                                                        <Link href="/production/orders">
                                                                            <Badge variant="outline" className="text-[10px] font-normal border-blue-500/20 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10 dark:text-blue-400 hover:bg-blue-100 cursor-pointer">
                                                                                {usageCount} WO
                                                                            </Badge>
                                                                        </Link>
                                                                    ) : (
                                                                        <span className="text-[10px] text-muted-foreground">—</span>
                                                                    )}
                                                                </TableCell>
                                                                {showPrices && (
                                                                    <TableCell className="text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="font-medium text-sm">
                                                                                {formatCurrency(totalCost / Number(bom.outputQuantity || 1))} / {bom.productVariant.primaryUnit}
                                                                            </span>
                                                                            <span className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                                                                {formatCurrency(totalCost)} total
                                                                            </span>
                                                                        </div>
                                                                    </TableCell>
                                                                )}
                                                                <TableCell className="text-right">
                                                                    <BOMActions
                                                                        id={bom.id}
                                                                        name={bom.name}
                                                                        isActive={bom.isActive !== false}
                                                                        isDefault={bom.isDefault}
                                                                        usageCount={usageCount}
                                                                        productVariantId={bom.productVariantId}
                                                                        productVariantName={bom.productVariant.name}
                                                                        outputQuantity={bom.outputQuantity}
                                                                        itemCount={bom.items.length}
                                                                        category={bom.category}
                                                                        activeBomOptions={activeBoms
                                                                            .filter(
                                                                                (b) =>
                                                                                    b.productVariantId === bom.productVariantId &&
                                                                                    b.id !== bom.id
                                                                            )
                                                                            .map((b) => ({
                                                                                id: b.id,
                                                                                name: b.name,
                                                                                isDefault: b.isDefault,
                                                                            }))}
                                                                    />
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>

            {/* Bulk Archive Dialog */}
            <AlertDialog open={showBulkArchiveDialog} onOpenChange={setShowBulkArchiveDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Nonaktifkan {selectedIds.size} resep?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Resep yang dipilih akan dinonaktifkan dan tidak muncul di daftar produksi baru.
                            Resep yang merupakan default akan dilewati (pilih pengganti manual).
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isBulkArchiving}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleBulkArchive();
                            }}
                            disabled={isBulkArchiving}
                            className="bg-orange-600 text-white hover:bg-orange-700"
                        >
                            {isBulkArchiving ? 'Menonaktifkan...' : `Nonaktifkan ${selectedIds.size} resep`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
