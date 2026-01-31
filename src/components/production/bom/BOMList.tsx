'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
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

    const filteredBoms = boms.filter((bom) => {
        const matchesSearch = bom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bom.productVariant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bom.productVariant.skuCode.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesCategory = activeTab === 'ALL' || (bom.category || 'STANDARD') === activeTab;

        return matchesSearch && matchesCategory;
    });

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
                                            {showPrices && <TableHead className="text-right">Est. Cost</TableHead>}
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
                                                    return acc + (cost * Number(item.quantity));
                                                }, 0);

                                                return (
                                                    <TableRow key={bom.id} className="group">
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-sm">{bom.name}</span>
                                                                    {bom.isDefault && (
                                                                        <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal">
                                                                            Default
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
                                                                        {formatCurrency(totalCost)}
                                                                    </span>
                                                                    <span className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                                                        {formatCurrency(totalCost / Number(bom.outputQuantity || 1))} / {bom.productVariant.primaryUnit}
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
