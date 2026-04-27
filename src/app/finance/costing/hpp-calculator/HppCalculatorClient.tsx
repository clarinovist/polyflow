'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, RefreshCcw, Search, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatRupiah } from '@/lib/utils/utils';
import {
    simulateHpp,
    type HppDataset,
    type HppMaterialOverrides,
    type HppOverrides,
} from '@/lib/utils/hpp-calculator';

interface HppCalculatorClientProps {
    initialData: HppDataset;
    backHref?: string;
    backLabel?: string;
}

function formatPercent(value: number): string {
    return `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}%`;
}

function parsePositiveNumber(value: string): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) return undefined;
    return parsed;
}

export default function HppCalculatorClient({
    initialData,
    backHref = '/finance/costing',
    backLabel = 'Back to Costing',
}: HppCalculatorClientProps) {
    const [laborInput, setLaborInput] = useState('');
    const [machineInput, setMachineInput] = useState('');
    const [overheadInput, setOverheadInput] = useState('');
    const [materialInputs, setMaterialInputs] = useState<Record<string, string>>({});
    const [materialSearch, setMaterialSearch] = useState('');
    const [bomSearch, setBomSearch] = useState('');
    const [showVarianceOnly, setShowVarianceOnly] = useState(false);

    // Build unique material list with names from BOM items
    const materialDetails = useMemo(() => {
        const map = new Map<string, { id: string; name: string; skuCode: string; productName: string; currentCost: number }>();
        for (const bom of initialData.boms) {
            for (const item of bom.items) {
                if (!map.has(item.productVariantId)) {
                    map.set(item.productVariantId, {
                        id: item.productVariantId,
                        name: item.productVariantId, // fallback; actual names come from action dataset
                        skuCode: '-',
                        productName: '-',
                        currentCost: item.currentMaterialCost,
                    });
                }
            }
        }
        return Array.from(map.values());
    }, [initialData.boms]);

    // Build overrides object
    const materialOverrides: HppMaterialOverrides = {};
    for (const material of materialDetails) {
        const raw = materialInputs[material.id];
        if (raw === undefined || raw.trim() === '') continue;
        const parsed = parsePositiveNumber(raw);
        if (parsed !== undefined) {
            materialOverrides[material.id] = parsed;
        }
    }

    const overrides: HppOverrides = {
        materialOverrides,
        ...(laborInput.trim() !== '' && parsePositiveNumber(laborInput) !== undefined
            ? { laborPerUnit: parsePositiveNumber(laborInput) }
            : {}),
        ...(machineInput.trim() !== '' && parsePositiveNumber(machineInput) !== undefined
            ? { machinePerUnit: parsePositiveNumber(machineInput) }
            : {}),
        ...(overheadInput.trim() !== '' && parsePositiveNumber(overheadInput) !== undefined
            ? { overheadPerUnit: parsePositiveNumber(overheadInput) }
            : {}),
    };

    const results = simulateHpp(initialData.boms, overrides);

    const overriddenMaterialCount = Object.keys(materialOverrides).length;
    const changedBomCount = results.filter((r) => Math.abs(r.varianceAmount) > 0.0001).length;

    const largestIncrease = results.reduce<(typeof results)[number] | null>((cur, r) => {
        if (!cur || r.varianceAmount > cur.varianceAmount) return r;
        return cur;
    }, null);
    const largestDecrease = results.reduce<(typeof results)[number] | null>((cur, r) => {
        if (!cur || r.varianceAmount < cur.varianceAmount) return r;
        return cur;
    }, null);

    const hasLargestIncrease = Boolean(largestIncrease) && (largestIncrease?.varianceAmount ?? 0) > 0.0001;
    const hasLargestDecrease = Boolean(largestDecrease) && (largestDecrease?.varianceAmount ?? 0) < -0.0001;

    const normalizedMaterialSearch = materialSearch.trim().toLowerCase();
    const filteredMaterials = materialDetails.filter((m) => {
        if (!normalizedMaterialSearch) return true;
        return [m.name, m.productName, m.skuCode, m.id].join(' ').toLowerCase().includes(normalizedMaterialSearch);
    });

    const normalizedBomSearch = bomSearch.trim().toLowerCase();
    const filteredResults = results
        .filter((r) => {
            if (showVarianceOnly && Math.abs(r.varianceAmount) <= 0.0001) return false;
            if (!normalizedBomSearch) return true;
            return [r.bomName, r.productVariantName, r.productVariantSku, r.category]
                .join(' ')
                .toLowerCase()
                .includes(normalizedBomSearch);
        })
        .sort((a, b) => Math.abs(b.simulated.totalHpp) - Math.abs(a.simulated.totalHpp));

    const handleMaterialChange = (id: string, value: string) => {
        setMaterialInputs((prev) => {
            if (value === '') {
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return { ...prev, [id]: value };
        });
    };

    const handleReset = () => {
        setLaborInput('');
        setMachineInput('');
        setOverheadInput('');
        setMaterialInputs({});
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" />
                            {backLabel}
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">HPP Calculator</h1>
                        <p className="text-muted-foreground">
                            Simulate Harga Pokok Produksi per unit: material + labor + machine + overhead.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                        {initialData.boms.length} BOMs
                    </Badge>
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                        {changedBomCount} BOMs impacted
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
                {/* ── Left Panel: Inputs ── */}
                <div className="space-y-6">
                    {/* Conversion Cost Inputs */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Conversion Cost per Unit</CardTitle>
                                    <CardDescription>
                                        Override benchmark labor &amp; machine, and enter overhead per unit. Leave blank to use benchmark.
                                    </CardDescription>
                                </div>
                                <Calculator className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Summary stats */}
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className={cn(
                                    'rounded-lg border p-4',
                                    hasLargestIncrease
                                        ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10'
                                        : 'bg-muted/30'
                                )}>
                                    <div className={cn(
                                        'flex items-center gap-2 text-xs font-medium uppercase tracking-wide',
                                        hasLargestIncrease ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                                    )}>
                                        <TrendingUp className="h-3.5 w-3.5" />
                                        Largest Increase
                                    </div>
                                    <div className="mt-2 text-sm font-semibold">{largestIncrease?.bomName ?? '-'}</div>
                                    <div className={cn(
                                        'text-xs',
                                        hasLargestIncrease ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                                    )}>
                                        {hasLargestIncrease
                                            ? `+${formatRupiah(largestIncrease!.varianceAmount)}`
                                            : 'No change'}
                                    </div>
                                </div>
                                <div className={cn(
                                    'rounded-lg border p-4',
                                    hasLargestDecrease
                                        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                                        : 'bg-muted/30'
                                )}>
                                    <div className={cn(
                                        'flex items-center gap-2 text-xs font-medium uppercase tracking-wide',
                                        hasLargestDecrease ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                    )}>
                                        <TrendingDown className="h-3.5 w-3.5" />
                                        Largest Decrease
                                    </div>
                                    <div className="mt-2 text-sm font-semibold">{largestDecrease?.bomName ?? '-'}</div>
                                    <div className={cn(
                                        'text-xs',
                                        hasLargestDecrease ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
                                    )}>
                                        {hasLargestDecrease
                                            ? `${formatRupiah(largestDecrease!.varianceAmount)}`
                                            : 'No change'}
                                    </div>
                                </div>
                                <div className="rounded-lg border bg-muted/30 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Material Overrides</div>
                                    <div className="mt-2 text-2xl font-semibold">{overriddenMaterialCount}</div>
                                    <div className="text-xs text-muted-foreground">materials overridden</div>
                                </div>
                            </div>

                            {/* Labor / Machine / Overhead inputs */}
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="labor-input" className="text-sm">
                                        Labor / unit (Rp)
                                    </Label>
                                    <Input
                                        id="labor-input"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="1"
                                        value={laborInput}
                                        onChange={(e) => setLaborInput(e.target.value)}
                                        placeholder="Use benchmark"
                                    />
                                    <p className="text-xs text-muted-foreground">Blank = auto from history</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="machine-input" className="text-sm">
                                        Machine / unit (Rp)
                                    </Label>
                                    <Input
                                        id="machine-input"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="1"
                                        value={machineInput}
                                        onChange={(e) => setMachineInput(e.target.value)}
                                        placeholder="Use benchmark"
                                    />
                                    <p className="text-xs text-muted-foreground">Blank = auto from history</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="overhead-input" className="text-sm">
                                        Overhead / unit (Rp)
                                    </Label>
                                    <Input
                                        id="overhead-input"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="1"
                                        value={overheadInput}
                                        onChange={(e) => setOverheadInput(e.target.value)}
                                        placeholder="e.g. 5000"
                                    />
                                    <p className="text-xs text-muted-foreground">Manual nominal per unit</p>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button variant="ghost" size="sm" onClick={handleReset}>
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Reset All
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Material Price Overrides */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Material Price Overrides</CardTitle>
                            <CardDescription>
                                Override current material price. Leave blank to use current weighted average cost.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={materialSearch}
                                    onChange={(e) => setMaterialSearch(e.target.value)}
                                    placeholder="Search material or SKU"
                                    className="pl-9"
                                />
                            </div>
                            <div className="max-h-[480px] overflow-auto rounded-md border">
                                <Table>
                                    <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                                        <TableRow>
                                            <TableHead>Material</TableHead>
                                            <TableHead className="text-right">Current Cost</TableHead>
                                            <TableHead className="text-right min-w-36">Override</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredMaterials.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                                    {materialDetails.length === 0
                                                        ? 'No BOM materials found.'
                                                        : 'No materials match the search.'}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredMaterials.map((material) => {
                                                const hasOverride = materialInputs[material.id] !== undefined && materialInputs[material.id] !== '';
                                                return (
                                                    <TableRow
                                                        key={material.id}
                                                        className={cn(hasOverride && 'bg-primary/5')}
                                                    >
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <div className="font-medium text-sm">{material.name !== material.id ? material.name : '—'}</div>
                                                                <div className="text-xs text-muted-foreground font-mono">{material.id.slice(0, 8)}…</div>
                                                                {hasOverride && <Badge variant="outline" className="text-xs">Overridden</Badge>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">{formatRupiah(material.currentCost)}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Input
                                                                type="number"
                                                                inputMode="decimal"
                                                                min="0"
                                                                step="0.01"
                                                                value={materialInputs[material.id] ?? ''}
                                                                onChange={(e) => handleMaterialChange(material.id, e.target.value)}
                                                                placeholder={material.currentCost.toFixed(0)}
                                                                className="text-right"
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
                </div>

                {/* ── Right Panel: HPP Results ── */}
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle>HPP per Unit per BOM</CardTitle>
                                <CardDescription>
                                    Baseline (from history) vs simulated HPP. Breakdown: material + labor + machine + overhead.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="relative w-full md:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={bomSearch}
                                    onChange={(e) => setBomSearch(e.target.value)}
                                    placeholder="Search BOM, FG, SKU, or category"
                                    className="pl-9"
                                />
                            </div>
                            <Button
                                variant={showVarianceOnly ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setShowVarianceOnly((prev) => !prev)}
                            >
                                {showVarianceOnly ? 'Showing Variance Only' : 'Show Variance Only'}
                            </Button>
                        </div>

                        <div className="max-h-[760px] overflow-auto rounded-md border">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                                    <TableRow>
                                        <TableHead>BOM</TableHead>
                                        <TableHead className="text-right">Material</TableHead>
                                        <TableHead className="text-right">Labor</TableHead>
                                        <TableHead className="text-right">Machine</TableHead>
                                        <TableHead className="text-right">Overhead</TableHead>
                                        <TableHead className="text-right font-semibold">HPP/unit</TableHead>
                                        <TableHead className="text-right">Variance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResults.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                                {results.length === 0
                                                    ? 'No BOM data available.'
                                                    : 'No BOMs match the current filters.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredResults.map((result) => {
                                            const variantAmount = result.varianceAmount;
                                            const isIncrease = variantAmount > 0.0001;
                                            const isDecrease = variantAmount < -0.0001;
                                            return (
                                                <TableRow
                                                    key={result.bomId}
                                                    className={cn(
                                                        isIncrease && 'bg-amber-50/40 hover:bg-amber-50/80 dark:bg-amber-500/5 dark:hover:bg-amber-500/10',
                                                        isDecrease && 'bg-emerald-50/40 hover:bg-emerald-50/80 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10'
                                                    )}
                                                >
                                                    <TableCell>
                                                        <div className="space-y-0.5">
                                                            <div className="font-medium">{result.bomName}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {result.productVariantName} · {result.productVariantSku}
                                                            </div>
                                                            <Badge variant="outline" className="text-xs">{result.category}</Badge>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {formatRupiah(result.simulated.materialCost)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {formatRupiah(result.simulated.laborCost)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {formatRupiah(result.simulated.machineCost)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                        {formatRupiah(result.simulated.overheadCost)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">
                                                        {formatRupiah(result.simulated.totalHpp)}
                                                        <div className="text-xs font-normal text-muted-foreground">
                                                            baseline: {formatRupiah(result.baseline.totalHpp)}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        'text-right font-mono font-medium',
                                                        isIncrease && 'text-amber-600 dark:text-amber-400',
                                                        isDecrease && 'text-emerald-600 dark:text-emerald-400'
                                                    )}>
                                                        <div>{variantAmount === 0 ? '—' : `${isIncrease ? '+' : ''}${formatRupiah(variantAmount)}`}</div>
                                                        {variantAmount !== 0 && (
                                                            <div className="text-xs">
                                                                {isIncrease ? '+' : ''}{formatPercent(result.variancePercent)}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Showing {filteredResults.length} of {results.length} BOMs.
                            Labor &amp; machine defaults are 90-day production benchmarks per BOM.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
