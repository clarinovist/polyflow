'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, RefreshCcw, Search, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { simulateBomCosts, type BomSimulationDataset } from '@/lib/utils/bom-simulator';

interface SimulatorClientProps {
    initialData: BomSimulationDataset;
}

function formatPercent(value: number): string {
    return `${new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(value)}%`;
}

function formatInputPrice(value: number): string {
    return Number(value.toFixed(4)).toString();
}

export default function SimulatorClient({ initialData }: SimulatorClientProps) {
    const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
    const [bulkPercent, setBulkPercent] = useState('');
    const [materialSearch, setMaterialSearch] = useState('');
    const [bomSearch, setBomSearch] = useState('');
    const [showImpactedOnly, setShowImpactedOnly] = useState(false);

    const priceOverrides: Record<string, number> = {};
    for (const material of initialData.materials) {
        const nextValue = priceInputs[material.id];
        if (nextValue === undefined || nextValue.trim() === '') {
            continue;
        }

        const parsedValue = Number(nextValue);
        if (Number.isFinite(parsedValue) && parsedValue >= 0) {
            priceOverrides[material.id] = parsedValue;
        }
    }

    const impacts = simulateBomCosts(initialData.boms, priceOverrides);
    const overriddenMaterialCount = Object.keys(priceOverrides).length;
    const changedBomCount = impacts.filter((impact) => Math.abs(impact.varianceAmount) > 0.0001).length;
    const largestIncrease = impacts.reduce((current, impact) => {
        if (!current || impact.varianceAmount > current.varianceAmount) {
            return impact;
        }

        return current;
    }, null as (typeof impacts)[number] | null);
    const largestDecrease = impacts.reduce((current, impact) => {
        if (!current || impact.varianceAmount < current.varianceAmount) {
            return impact;
        }

        return current;
    }, null as (typeof impacts)[number] | null);

    const normalizedMaterialSearch = materialSearch.trim().toLowerCase();
    const filteredMaterials = initialData.materials.filter((material) => {
        if (!normalizedMaterialSearch) {
            return true;
        }

        const searchTarget = [material.name, material.productName, material.skuCode].join(' ').toLowerCase();
        return searchTarget.includes(normalizedMaterialSearch);
    });

    const normalizedBomSearch = bomSearch.trim().toLowerCase();
    const filteredImpacts = impacts
        .filter((impact) => {
            if (showImpactedOnly && Math.abs(impact.varianceAmount) <= 0.0001) {
                return false;
            }

            if (!normalizedBomSearch) {
                return true;
            }

            const searchTarget = [impact.name, impact.productVariantName, impact.productVariantSku, impact.category]
                .join(' ')
                .toLowerCase();

            return searchTarget.includes(normalizedBomSearch);
        })
        .sort((left, right) => Math.abs(right.varianceAmount) - Math.abs(left.varianceAmount));

    const handleMaterialPriceChange = (materialId: string, value: string) => {
        setPriceInputs((current) => {
            if (value === '') {
                const next = { ...current };
                delete next[materialId];
                return next;
            }

            return {
                ...current,
                [materialId]: value,
            };
        });
    };

    const handleApplyBulkIncrease = () => {
        const percent = Number(bulkPercent);
        if (!Number.isFinite(percent)) {
            return;
        }

        const multiplier = 1 + (percent / 100);

        setPriceInputs(() => {
            const next: Record<string, string> = {};
            for (const material of initialData.materials) {
                next[material.id] = formatInputPrice(material.currentPrice * multiplier);
            }
            return next;
        });
    };

    const handleReset = () => {
        setPriceInputs({});
        setBulkPercent('');
    };

    const hasLargestIncrease = Boolean(largestIncrease) && (largestIncrease?.varianceAmount ?? 0) > 0.0001;
    const hasLargestDecrease = Boolean(largestDecrease) && (largestDecrease?.varianceAmount ?? 0) < -0.0001;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/finance/costing">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Costing
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Raw Material Price Shock Simulator</h1>
                        <p className="text-muted-foreground">
                            Test how raw material price changes ripple through BOM unit costs before updating standard costs.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                        {initialData.materials.length} raw materials
                    </Badge>
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                        {initialData.boms.length} BOMs
                    </Badge>
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                        {changedBomCount} BOMs impacted
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle>Raw Material Price Adjustments</CardTitle>
                                <CardDescription>
                                    Override the current price for each material or apply a bulk percentage increase.
                                </CardDescription>
                            </div>
                            <Calculator className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-lg border bg-muted/30 p-4">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overrides</div>
                                <div className="mt-2 text-2xl font-semibold">{overriddenMaterialCount}</div>
                                <div className="text-xs text-muted-foreground">Materials with simulated prices</div>
                            </div>
                            <div className={cn(
                                'rounded-lg border p-4',
                                hasLargestIncrease && 'border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10',
                                !hasLargestIncrease && 'bg-muted/30'
                            )}>
                                <div className={cn(
                                    'flex items-center gap-2 text-xs font-medium uppercase tracking-wide',
                                    hasLargestIncrease ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                                )}>
                                    <TrendingUp className="h-3.5 w-3.5" />
                                    Largest Increase
                                </div>
                                <div className="mt-2 text-sm font-semibold text-foreground">{largestIncrease?.name ?? '-'}</div>
                                <div className={cn(
                                    'text-xs',
                                    hasLargestIncrease ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                                )}>
                                    {largestIncrease ? `${largestIncrease.varianceAmount > 0 ? '+' : ''}${formatRupiah(largestIncrease.varianceAmount)}` : 'No BOM data'}
                                </div>
                            </div>
                            <div className={cn(
                                'rounded-lg border p-4',
                                hasLargestDecrease && 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10',
                                !hasLargestDecrease && 'bg-muted/30'
                            )}>
                                <div className={cn(
                                    'flex items-center gap-2 text-xs font-medium uppercase tracking-wide',
                                    hasLargestDecrease ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                )}>
                                    <TrendingDown className="h-3.5 w-3.5" />
                                    Largest Decrease
                                </div>
                                <div className="mt-2 text-sm font-semibold text-foreground">{largestDecrease?.name ?? '-'}</div>
                                <div className={cn(
                                    'text-xs',
                                    hasLargestDecrease ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
                                )}>
                                    {largestDecrease ? `${largestDecrease.varianceAmount > 0 ? '+' : ''}${formatRupiah(largestDecrease.varianceAmount)}` : 'No BOM data'}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-end">
                            <div className="flex-1 space-y-2">
                                <label className="text-sm font-medium">Increase all by %</label>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    value={bulkPercent}
                                    onChange={(event) => setBulkPercent(event.target.value)}
                                    placeholder="e.g. 10"
                                />
                            </div>
                            <Button variant="outline" onClick={handleApplyBulkIncrease}>
                                Apply Bulk Change
                            </Button>
                            <Button variant="ghost" onClick={handleReset}>
                                <RefreshCcw className="h-4 w-4" />
                                Reset
                            </Button>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="relative w-full md:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={materialSearch}
                                    onChange={(event) => setMaterialSearch(event.target.value)}
                                    placeholder="Search materials, product, or SKU"
                                    className="pl-9"
                                />
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Showing {filteredMaterials.length} of {initialData.materials.length} materials
                            </div>
                        </div>

                        <div className="max-h-[640px] overflow-auto rounded-md border">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                                    <TableRow>
                                        <TableHead>Material</TableHead>
                                        <TableHead className="text-right">Current Price</TableHead>
                                        <TableHead className="text-right">Simulated Price</TableHead>
                                        <TableHead className="text-right">Difference</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredMaterials.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                {initialData.materials.length === 0
                                                    ? 'No BOM materials available for simulation.'
                                                    : 'No materials match the current search.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredMaterials.map((material) => {
                                            const overrideValue = priceOverrides[material.id];
                                            const simulatedPrice = overrideValue ?? material.currentPrice;
                                            const varianceAmount = simulatedPrice - material.currentPrice;

                                            return (
                                                <TableRow
                                                    key={material.id}
                                                    className={cn(
                                                        overrideValue !== undefined && 'bg-primary/5',
                                                        varianceAmount > 0 && 'hover:bg-amber-50/70 dark:hover:bg-amber-500/10',
                                                        varianceAmount < 0 && 'hover:bg-emerald-50/70 dark:hover:bg-emerald-500/10'
                                                    )}
                                                >
                                                    <TableCell>
                                                        <div className="space-y-1">
                                                            <div className="font-medium">{material.name}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {material.productName} · {material.skuCode}
                                                            </div>
                                                            {overrideValue !== undefined ? <Badge variant="outline">Overridden</Badge> : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatRupiah(material.currentPrice)}</TableCell>
                                                    <TableCell className="text-right min-w-40">
                                                        <Input
                                                            type="number"
                                                            inputMode="decimal"
                                                            min="0"
                                                            step="0.01"
                                                            value={priceInputs[material.id] ?? ''}
                                                            onChange={(event) => handleMaterialPriceChange(material.id, event.target.value)}
                                                            placeholder={formatInputPrice(material.currentPrice)}
                                                            className="text-right"
                                                        />
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        'text-right font-mono font-medium',
                                                        varianceAmount > 0 && 'text-amber-600 dark:text-amber-400',
                                                        varianceAmount < 0 && 'text-emerald-600 dark:text-emerald-400'
                                                    )}>
                                                        {varianceAmount === 0 ? formatRupiah(0) : `${varianceAmount > 0 ? '+' : ''}${formatRupiah(varianceAmount)}`}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {overriddenMaterialCount} of {initialData.materials.length} materials currently overridden.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Impact on BOM Unit Cost</CardTitle>
                        <CardDescription>
                            Compare current BOM unit cost against simulated cost under the adjusted material prices.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="relative w-full md:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={bomSearch}
                                    onChange={(event) => setBomSearch(event.target.value)}
                                    placeholder="Search BOM, FG, SKU, or category"
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={showImpactedOnly ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setShowImpactedOnly((current) => !current)}
                                >
                                    {showImpactedOnly ? 'Showing Impacted Only' : 'Show Impacted Only'}
                                </Button>
                            </div>
                        </div>

                        <div className="max-h-[640px] overflow-auto rounded-md border">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                                    <TableRow>
                                        <TableHead>BOM Name</TableHead>
                                        <TableHead className="text-right">Current Unit Cost</TableHead>
                                        <TableHead className="text-right">Simulated Unit Cost</TableHead>
                                        <TableHead className="text-right">Variance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredImpacts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                {impacts.length === 0
                                                    ? 'No BOMs available for simulation.'
                                                    : 'No BOMs match the current filters.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredImpacts.map((impact) => (
                                            <TableRow
                                                key={impact.id}
                                                className={cn(
                                                    impact.varianceAmount > 0.0001 && 'bg-amber-50/40 hover:bg-amber-50/80 dark:bg-amber-500/5 dark:hover:bg-amber-500/10',
                                                    impact.varianceAmount < -0.0001 && 'bg-emerald-50/40 hover:bg-emerald-50/80 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10'
                                                )}
                                            >
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <div className="font-medium">{impact.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {impact.productVariantName} · {impact.productVariantSku}
                                                        </div>
                                                        <Badge variant="outline">{impact.category}</Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono">{formatRupiah(impact.currentUnitCost)}</TableCell>
                                                <TableCell className="text-right font-mono font-medium">{formatRupiah(impact.simulatedUnitCost)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className="mb-1 flex justify-end">
                                                        <Badge variant="outline" className={cn(
                                                            impact.varianceAmount > 0.0001 && 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
                                                            impact.varianceAmount < -0.0001 && 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                                                        )}>
                                                            {impact.varianceAmount > 0.0001 ? 'Increase' : impact.varianceAmount < -0.0001 ? 'Decrease' : 'No Change'}
                                                        </Badge>
                                                    </div>
                                                    <div className={cn(
                                                        'font-mono font-medium',
                                                        impact.varianceAmount > 0 && 'text-amber-600 dark:text-amber-400',
                                                        impact.varianceAmount < 0 && 'text-emerald-600 dark:text-emerald-400'
                                                    )}>
                                                        {impact.varianceAmount === 0 ? formatRupiah(0) : `${impact.varianceAmount > 0 ? '+' : ''}${formatRupiah(impact.varianceAmount)}`}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {impact.varianceAmount === 0
                                                            ? formatPercent(0)
                                                            : `${impact.variancePercent > 0 ? '+' : ''}${formatPercent(impact.variancePercent)}`}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}