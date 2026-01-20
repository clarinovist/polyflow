
'use client';

import { StockAgingResult } from '@/services/stock-aging-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface StockAgingTableProps {
    data: StockAgingResult[];
}

export function StockAgingTable({ data }: StockAgingTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.skuCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort by oldest stock (90+ bucket value) desc
    const sortedData = [...filteredData].sort((a, b) => b.buckets['90+'].value - a.buckets['90+'].value);

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Aging Inventory List</CardTitle>
                        <CardDescription>Breakdown of stock value by age.</CardDescription>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search product..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[250px]">Product</TableHead>
                            <TableHead className="text-right">Total Stock</TableHead>
                            <TableHead className="text-right bg-slate-50">0-30 Days</TableHead>
                            <TableHead className="text-right bg-slate-50">31-60 Days</TableHead>
                            <TableHead className="text-right bg-slate-50">61-90 Days</TableHead>
                            <TableHead className="text-right bg-red-50 font-bold text-red-700">&gt; 90 Days</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                    No aging stock found matching your search.
                                </TableCell>
                            </TableRow>
                        ) : (
                            sortedData.map((item) => (
                                <TableRow key={item.productVariantId}>
                                    <TableCell>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-muted-foreground">{item.skuCode}</div>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {item.totalStock}
                                    </TableCell>
                                    <TableCell className="text-right bg-slate-50/50">
                                        <div className="text-sm">{item.buckets['0-30'].quantity}</div>
                                        <div className="text-xs text-muted-foreground">{formatRupiah(item.buckets['0-30'].value)}</div>
                                    </TableCell>
                                    <TableCell className="text-right bg-slate-50/50">
                                        <div className="text-sm">{item.buckets['31-60'].quantity}</div>
                                        <div className="text-xs text-muted-foreground">{formatRupiah(item.buckets['31-60'].value)}</div>
                                    </TableCell>
                                    <TableCell className="text-right bg-slate-50/50">
                                        <div className="text-sm">{item.buckets['61-90'].quantity}</div>
                                        <div className="text-xs text-muted-foreground">{formatRupiah(item.buckets['61-90'].value)}</div>
                                    </TableCell>
                                    <TableCell className="text-right bg-red-50/50">
                                        <div className="text-sm font-bold text-red-700">{item.buckets['90+'].quantity}</div>
                                        {item.buckets['90+'].value > 0 && (
                                            <div className="text-xs font-semibold text-red-600">{formatRupiah(item.buckets['90+'].value)}</div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
