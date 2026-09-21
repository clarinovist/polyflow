'use client';

import { StockAgingResult } from '@/services/inventory/stock-aging-service';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah, formatQuantity } from '@/lib/utils/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { warehouseComponentLabels } from '@/lib/labels';

interface StockAgingTableProps {
    data: StockAgingResult[];
}

export function StockAgingTable({ data }: StockAgingTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const filteredData = data.filter(
        (item) =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.skuCode.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Sort by oldest stock (90+ bucket value) desc
    const sortedData = [...filteredData].sort(
        (a, b) => b.buckets['90+'].value - a.buckets['90+'].value,
    );

    const pageCount = Math.max(1, Math.ceil(sortedData.length / 25));
    const page = Math.min(currentPage, pageCount);
    const pageRows = sortedData.slice((page - 1) * 25, page * 25);
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                    <div>
                        <CardTitle>
                            {warehouseComponentLabels.stockAgingTitle}
                        </CardTitle>
                        <CardDescription>
                            Umur persediaan berdasarkan batch, bukan saldo
                            periode.
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            aria-label="Cari produk aging"
                            placeholder={warehouseComponentLabels.searchProduct}
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="pl-8"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div
                    role="region"
                    aria-label="Umur persediaan"
                    tabIndex={0}
                    className="overflow-x-auto"
                >
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[250px]">
                                    Product
                                </TableHead>
                                <TableHead className="text-right">
                                    Total Stock
                                </TableHead>
                                <TableHead className="text-right border-l border-border">
                                    0-30 Days
                                </TableHead>
                                <TableHead className="text-right border-l border-border">
                                    31-60 Days
                                </TableHead>
                                <TableHead className="text-right border-l border-border">
                                    61-90 Days
                                </TableHead>
                                <TableHead className="text-right border-l-2 border-red-500/50 font-bold text-red-600 dark:text-red-400">
                                    &gt; 90 Days
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedData.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center py-6 text-muted-foreground"
                                    >
                                        Tidak ada stok aging yang cocok dengan
                                        pencarian Anda.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                pageRows.map((item) => (
                                    <TableRow key={item.productVariantId}>
                                        <TableCell>
                                            <div className="font-medium">
                                                {item.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {item.skuCode}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatQuantity(item.totalStock)}
                                        </TableCell>
                                        <TableCell className="text-right border-l border-border">
                                            <div className="text-sm">
                                                {formatQuantity(
                                                    item.buckets['0-30']
                                                        .quantity,
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRupiah(
                                                    item.buckets['0-30'].value,
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right border-l border-border">
                                            <div className="text-sm">
                                                {formatQuantity(
                                                    item.buckets['31-60']
                                                        .quantity,
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRupiah(
                                                    item.buckets['31-60'].value,
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right border-l border-border">
                                            <div className="text-sm">
                                                {formatQuantity(
                                                    item.buckets['61-90']
                                                        .quantity,
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRupiah(
                                                    item.buckets['61-90'].value,
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right border-l-2 border-red-500/50">
                                            <div className="text-sm font-bold text-red-600 dark:text-red-400">
                                                {formatQuantity(
                                                    item.buckets['90+']
                                                        .quantity,
                                                )}
                                            </div>
                                            {item.buckets['90+'].value > 0 && (
                                                <div className="text-xs font-semibold text-red-500 dark:text-red-400/80">
                                                    {formatRupiah(
                                                        item.buckets['90+']
                                                            .value,
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm">
                        {sortedData.length} produk · Halaman {page} dari{' '}
                        {pageCount}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            disabled={page <= 1}
                            onClick={() => setCurrentPage(page - 1)}
                        >
                            Sebelumnya
                        </Button>
                        <Button
                            variant="outline"
                            disabled={page >= pageCount}
                            onClick={() => setCurrentPage(page + 1)}
                        >
                            Berikutnya
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
