'use client';

import React from 'react';
import { ArrowLeft, Edit2, RefreshCw, Info } from 'lucide-react';
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
import {
    calculateBomItemCost,
    getCurrentUnitCost,
    getVariantCostDiagnostics,
    type CostAnomalyFlag,
    type CostSource,
    type VariantCostLike,
} from '@/lib/utils/current-cost';
import {
    formatCostGapLabel,
    getCostAlertMessage,
    getCostAlertShortLabel,
    getCostSourceLabel,
    getCostSourceTone,
} from '@/lib/utils/cost-diagnostics';
import { recalculateBomCostChain } from '@/actions/production/boms';
import { toast } from 'sonner';

interface BOMDetailsProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bom: any;
    showPrices?: boolean;
}

interface CostDiagnosticsView {
    breakdown: {
        currentCost: number;
        source: CostSource;
        stockQty: number;
        stockValue: number;
        standardCost: number;
        buyPrice: number;
        price: number;
    };
    flags: CostAnomalyFlag[];
    gapPercent: number | null;
    inventoryCount?: number;
}

interface BomIngredientWithDiagnostics {
    name: string;
    diagnostics: CostDiagnosticsView;
}

function resolveIngredientDiagnostics(variant: { costDiagnostics?: CostDiagnosticsView } & VariantCostLike): CostDiagnosticsView {
    return variant.costDiagnostics || getVariantCostDiagnostics(variant);
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
    const ingredientDiagnostics = bom.items.map((item: { productVariant: { costDiagnostics?: CostDiagnosticsView } & VariantCostLike }) => {
        return resolveIngredientDiagnostics(item.productVariant);
    });
    const outlierItems = bom.items
        .map((item: { productVariant: { name: string; costDiagnostics?: CostDiagnosticsView } & VariantCostLike }): BomIngredientWithDiagnostics => ({
            name: item.productVariant.name,
            diagnostics: resolveIngredientDiagnostics(item.productVariant),
        }))
        .filter((entry: BomIngredientWithDiagnostics) => entry.diagnostics.flags.length > 0);

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
                toast.success('Cost chain berhasil dihitung ulang.', {
                    description: `${bom.name}: ${updatedCount} BOM induk diperbarui`,
                });
            } else {
                toast.error('Gagal menghitung ulang cost chain', { description: result.error });
            }
        } catch (_error) {
            toast.error('Terjadi kesalahan tak terduga');
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
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[11px] font-normal border-blue-500/20 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10 dark:text-blue-400">
                                    {formatCurrency(totalCost)} total
                                </Badge>
                                <Badge variant={outlierItems.length > 0 ? 'destructive' : 'secondary'}>
                                    {outlierItems.length > 0 ? `${outlierItems.length} ingredient warning` : 'All ingredients within range'}
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

            {outlierItems.length > 0 && (
                <Card className="mb-8 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center text-amber-700 dark:text-amber-400">
                            <Info className="mr-2 h-4 w-4" /> Ingredient Cost Warnings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {outlierItems.map((entry: BomIngredientWithDiagnostics) => {
                            const { name, diagnostics } = entry;
                            const gapLabel = formatCostGapLabel(diagnostics.breakdown.currentCost, diagnostics.breakdown.standardCost);

                            return (
                                <div key={`${name}-${diagnostics.flags.join('-')}`} className="rounded-md border border-amber-200/60 bg-background/70 p-3">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">{name}</Badge>
                                        {diagnostics.flags.map((flag) => (
                                            <Badge key={`${name}-${flag}`} variant="destructive">
                                                {getCostAlertShortLabel(flag)}
                                            </Badge>
                                        ))}
                                        {gapLabel && (
                                            <Badge variant="outline">
                                                {gapLabel}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {diagnostics.flags.map((flag: CostAnomalyFlag) => getCostAlertMessage(flag)).join(' ')}
                                    </p>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

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
                                    const diagnostics = ingredientDiagnostics[index];
                                    const gapLabel = formatCostGapLabel(diagnostics.breakdown.currentCost, diagnostics.breakdown.standardCost);

                                    return (
                                        <TableRow key={index}>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col gap-2">
                                                    <div>
                                                        <span className="font-medium text-sm">{item.productVariant.name}</span>
                                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded w-fit mt-1 block">
                                                            {item.productVariant.skuCode}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        <Badge variant={getCostSourceTone(diagnostics.breakdown.source)}>
                                                            {getCostSourceLabel(diagnostics.breakdown.source)}
                                                        </Badge>
                                                        {gapLabel && (
                                                            <Badge variant={diagnostics.flags.length > 0 ? 'destructive' : 'outline'}>
                                                                {gapLabel}
                                                            </Badge>
                                                        )}
                                                        {diagnostics.flags.map((flag: CostAnomalyFlag) => (
                                                            <Badge key={`${item.productVariant.id}-${flag}`} variant="outline">
                                                                {getCostAlertShortLabel(flag)}
                                                            </Badge>
                                                        ))}
                                                    </div>
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
