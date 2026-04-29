'use client';

import React from 'react';
import { ArrowLeft, Edit2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { calculateBomItemCost, getCurrentUnitCost } from '@/lib/utils/current-cost';
import { recalculateBomCostChain } from '@/actions/production/boms';
import { toast } from 'sonner';

interface BOMDetailsProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bom: any;
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

export function BOMDetails({ bom, showPrices }: BOMDetailsProps) {
    const router = useRouter();
    const [isRecalculating, setIsRecalculating] = React.useState(false);

    // Calculate total cost
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalCost = bom.items.reduce((acc: number, item: any) => {
        return acc + calculateBomItemCost(item);
    }, 0);

    async function handleRecalculateChain() {
        setIsRecalculating(true);
        try {
            const result = await recalculateBomCostChain(bom.id);
            if (result.success) {
                const updatedCount = result.data?.updatedParentCount || 0;
                toast.success('Cost chain recalculated', {
                    description: `${bom.name}: ${updatedCount} parent BOM(s) updated`,
                });
            } else {
                toast.error('Failed to recalculate cost chain', { description: result.error });
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsRecalculating(false);
        }
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="h-10 w-10 rounded-full border bg-background"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Recipe Details</h1>
                        <p className="text-muted-foreground text-sm">
                            Viewing configuration for {bom.name}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleRecalculateChain} disabled={isRecalculating}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {isRecalculating ? 'Recalculating...' : 'Recalculate Cost Chain'}
                    </Button>
                    <Link href={`/dashboard/boms/${bom.id}/edit`}>
                        <Button>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit Recipe
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* General Info */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <CardTitle className="text-lg font-bold">General Information</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Recipe Name</div>
                                <div className="text-lg font-medium">{bom.name}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Output Product</div>
                                <div className="font-medium flex items-center gap-2">
                                    <span className="font-mono bg-muted px-1 rounded text-sm">{bom.productVariant.skuCode}</span>
                                    <span>{bom.productVariant.name}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Basis Output Quantity</div>
                                <div className="text-lg font-mono font-medium">
                                    {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground border-b pb-1 mb-1">Status</div>
                                <div>
                                    {bom.isDefault ? (
                                        <Badge className="text-[10px] h-5 px-1.5 font-bold bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-500/20 gap-1">
                                            <span className="relative flex h-1.5 w-1.5 mr-0.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                            </span>
                                            ACTIVE RECIPE
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">
                                            Standard Recipe
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Cost Summary */}
                {showPrices && (
                    <Card className="flex flex-col justify-center">
                        <CardContent className="pt-6">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Benchmark Cost per {bom.productVariant.primaryUnit}</div>
                            <div className="text-4xl font-bold tracking-tight">
                                {formatCurrency(totalCost / Number(bom.outputQuantity || 1))}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge variant="outline" className="text-[11px] font-normal border-blue-500/20 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10 dark:text-blue-400">
                                    {formatCurrency(totalCost)} total
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">for {Number(bom.outputQuantity).toLocaleString()} {bom.productVariant.primaryUnit} batch</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-dashed">
                                <p className="text-[11px] text-muted-foreground italic">Calculated from current weighted stock cost of ingredients, with standard cost as fallback.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Ingredients Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                        <CardTitle className="text-lg font-bold">Formula Components</CardTitle>
                        <Badge variant="secondary" className="ml-2">{bom.items.length} Components</Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[350px]">Ingredient Material & SKU</TableHead>
                                    <TableHead className="text-center w-[150px]">Base Quantity</TableHead>
                                    <TableHead className="text-center w-[120px]">Scrap %</TableHead>
                                    <TableHead className="text-center w-[180px]">Total Requirement</TableHead>
                                    {showPrices && <TableHead className="text-right w-[180px]">Line Cost</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {bom.items.map((item: any, index: number) => {
                                    const scrapPct = Number(item.scrapPercentage || 0);
                                    const baseQty = Number(item.quantity);
                                    const totalQty = baseQty * (1 + (scrapPct / 100));
                                    const unitCost = getCurrentUnitCost(item.productVariant);
                                    const lineCost = unitCost * totalQty;

                                    return (
                                        <TableRow key={index}>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{item.productVariant.name}</span>
                                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded w-fit mt-1">
                                                        {item.productVariant.skuCode}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                <span className="font-mono text-sm">
                                                    {baseQty.toLocaleString()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground ml-1">{item.productVariant.primaryUnit}</span>
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                {scrapPct > 0 ? (
                                                    <Badge variant="outline" className="text-[10px] font-normal border-amber-500/20 text-amber-600 bg-amber-50/50 dark:bg-amber-900/10 dark:text-amber-400">
                                                        {scrapPct}%
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4 text-center">
                                                <span className="font-mono text-base font-medium">
                                                    {totalQty.toLocaleString()}
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-1">{item.productVariant.primaryUnit}</span>
                                            </TableCell>
                                            {showPrices && (
                                                <TableCell className="py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-medium">
                                                            {formatCurrency(lineCost)}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            @ {formatCurrency(unitCost)}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
