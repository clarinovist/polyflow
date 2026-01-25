'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Edit2, Files, ChevronRight, Package, Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BrandCard, BrandCardContent } from '@/components/brand/BrandCard';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

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

export function BOMList({ boms: initialBoms, showPrices }: BOMListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [boms] = useState(initialBoms);

    const filteredBoms = boms.filter((bom) =>
        bom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bom.productVariant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bom.productVariant.skuCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search recipes, products, or SKUs..."
                        className="pl-9 bg-background/50 backdrop-blur-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Link href="/dashboard/boms/create">
                    <Button className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 border-0">
                        <Plus className="h-4 w-4 mr-2" />
                        New BOM
                    </Button>
                </Link>
            </div>

            <BrandCard>
                <BrandCardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                    <TableHead className="w-[300px]">Recipe & Product</TableHead>
                                    <TableHead>Basis Quantity</TableHead>
                                    <TableHead>Ingredients</TableHead>
                                    {showPrices && <TableHead className="text-right">Est. Cost</TableHead>}
                                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredBoms.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={showPrices ? 5 : 4} className="h-32 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <Files className="h-8 w-8 opacity-20" />
                                                <span>No recipes found</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredBoms.map((bom) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const totalCost = bom.items.reduce((acc: number, item: any) => {
                                            const cost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? 0);
                                            return acc + (cost * Number(item.quantity));
                                        }, 0);

                                        return (
                                            <TableRow key={bom.id} className="group border-white/5 hover:bg-primary/[0.02] transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm tracking-tight">{bom.name}</span>
                                                            {bom.isDefault && (
                                                                <Badge variant="secondary" className="bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400 border-blue-500/10 h-5 px-1.5 font-bold">
                                                                    Default
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1 rounded uppercase">
                                                                {bom.productVariant.skuCode}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                                                {bom.productVariant.name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5">
                                                        <Package className="h-3 w-3 text-muted-foreground" />
                                                        <span className="font-medium text-sm">
                                                            {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex -space-x-1.5">
                                                        {/* Visual representation of ingredients count */}
                                                        <Badge variant="outline" className="text-[11px] font-bold border-white/10 bg-background/50 h-6 px-2">
                                                            {bom.items.length} materials
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                {showPrices && (
                                                    <TableCell className="text-right">
                                                        <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                                            {formatCurrency(totalCost)}
                                                        </span>
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Link href={`/dashboard/boms/${bom.id}/edit`}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors">
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                        <Link href={`/dashboard/boms/${bom.id}`}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                                                <ChevronRight className="h-4 w-4" />
                                                            </Button>
                                                        </Link>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </BrandCardContent>
            </BrandCard>
        </div>
    );
}
