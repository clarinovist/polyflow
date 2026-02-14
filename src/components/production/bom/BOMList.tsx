'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState('ALL');
    const [costSort, setCostSort] = useState<'none' | 'asc' | 'desc'>('none');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getUnitCost = (bom: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalCost = bom.items.reduce((acc: number, item: any) => {
            const cost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? item.productVariant.price ?? 0);
            const quantity = Number(item.quantity);
            const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100);
            return acc + (cost * quantity * scrap);
        }, 0);
        return totalCost / Number(bom.outputQuantity || 1);
    };

    const filteredBoms = useMemo(() => {
        const filtered = boms.filter((bom) => {
            const matchesSearch = bom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                bom.productVariant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                bom.productVariant.skuCode.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = activeTab === 'ALL' || (bom.category || 'STANDARD') === activeTab;

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
    }, [boms, searchTerm, activeTab, costSort]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search recipes, products, or SKUs..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Link href="/dashboard/boms/create">
                    <Button className="w-full md:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        New BOM
                    </Button>
                </Link>
            </div>

            <Tabs defaultValue="ALL" onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="ALL">All Recipes</TabsTrigger>
                    <TabsTrigger value="MIXING">Mixing</TabsTrigger>
                    <TabsTrigger value="EXTRUSION">Extrusion</TabsTrigger>
                    <TabsTrigger value="PACKING">Packing</TabsTrigger>
                    <TabsTrigger value="STANDARD">Standard</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab}>
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[300px]">Recipe & Product</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead>Basis Quantity</TableHead>
                                            <TableHead>Ingredients</TableHead>
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
                                            <TableHead className="text-right w-[100px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredBoms.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={showPrices ? 6 : 5} className="h-24 text-center text-muted-foreground">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <span>No recipes found in {activeTab}</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredBoms.map((bom) => {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                const totalCost = bom.items.reduce((acc: number, item: any) => {
                                                    const cost = Number(item.productVariant.standardCost ?? item.productVariant.buyPrice ?? item.productVariant.price ?? 0);
                                                    const quantity = Number(item.quantity);
                                                    const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100);
                                                    return acc + (cost * quantity * scrap);
                                                }, 0);

                                                return (
                                                    <TableRow key={bom.id} className="group">
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
                                                                            ACTIVE
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
                                                            <BOMActions id={bom.id} name={bom.name} />
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
        </div>
    );
}
