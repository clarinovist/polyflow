'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Save, Loader2, ArrowLeft, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { createBom, updateBom } from '@/actions/production/boms';
import { toast } from 'sonner';
import { ProductCombobox } from '@/components/products/product-combobox';
import {
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

interface BOMFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bom?: any; // If present, we are editing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    productVariants: any[];
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

function resolveCostDiagnostics(variant?: ({ costDiagnostics?: CostDiagnosticsView } & VariantCostLike) | null): CostDiagnosticsView | null {
    if (!variant) return null;
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

export function BOMForm({
    bom,
    productVariants,
    showPrices
}: BOMFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreateBomValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createBomSchema) as any,
        defaultValues: {
            name: '',
            productVariantId: '',
            outputQuantity: 1,
            isDefault: false,
            category: 'STANDARD',
            items: [{ productVariantId: '', quantity: 1, scrapPercentage: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });
    const watchedItems = form.watch('items');
    const selectedOutputVariant = productVariants.find((variant) => variant.id === form.watch('productVariantId'));
    const outputDiagnostics = resolveCostDiagnostics(selectedOutputVariant);
    const outputGapLabel = outputDiagnostics
        ? formatCostGapLabel(outputDiagnostics.breakdown.currentCost, outputDiagnostics.breakdown.standardCost)
        : null;
    const formulaTotalInvestment = watchedItems.reduce((acc, item) => {
        const variant = productVariants.find(v => v.id === item.productVariantId);
        if (!variant) return acc;
        const cost = getCurrentUnitCost(variant);
        const quantity = Number(item.quantity ?? 0);
        const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100);
        return acc + (cost * quantity * scrap);
    }, 0);
    const formulaWarnings = watchedItems.flatMap((item) => {
        const variant = productVariants.find(v => v.id === item.productVariantId);
        const diagnostics = resolveCostDiagnostics(variant);
        if (!variant || !diagnostics || diagnostics.flags.length === 0) return [];

        return diagnostics.flags.map((flag: CostAnomalyFlag) => ({
            variantId: variant.id,
            variantName: variant.name,
            flag,
            message: getCostAlertMessage(flag),
            gapLabel: formatCostGapLabel(diagnostics.breakdown.currentCost, diagnostics.breakdown.standardCost),
        }));
    });

    // Reset form when BOM changes (e.g. for editing)
    useEffect(() => {
        if (bom) {
            form.reset({
                name: bom.name,
                productVariantId: bom.productVariantId,
                outputQuantity: Number(bom.outputQuantity),
                isDefault: bom.isDefault,
                category: bom.category || 'STANDARD',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                items: bom.items.map((item: any) => ({
                    productVariantId: item.productVariantId,
                    quantity: Number(item.quantity),
                    scrapPercentage: Number(item.scrapPercentage || 0)
                }))
            });
        }
    }, [bom, form]);

    async function onSubmit(values: CreateBomValues) {
        // Validation 1: Check for Physical Impossibility (Output > Total Input)
        // It is impossible to create more mass than input (Conservation of Mass)
        const totalInput = values.items.reduce((acc, item) => acc + Number(item.quantity), 0);
        const output = Number(values.outputQuantity);

        if (output > totalInput) {
            const confirmed = window.confirm(
                `⚠️ PHYSICAL IMPOSSIBILITY DETECTED ⚠️\n\n` +
                `Total Material Input: ${totalInput.toLocaleString()} ${productVariants[0]?.primaryUnit || 'Unit'}\n` +
                `Target Output: ${output.toLocaleString()} ${productVariants[0]?.primaryUnit || 'Unit'}\n\n` +
                `PROHIBITED: You cannot produce MORE items than your input materials. This will cause negative COGS.\n` +
                `Likely error: Basis Output is too high.\n\n` +
                `Are you sure you want to proceed?`
            );
            if (!confirmed) return;
        }

        // Validation 2: Check for Suspicious Ratio (High Shrinkage/Unit Mismatch)
        // If Input is > 20% higher than Output, it might be a unit error (100kg vs 1 Sack)
        if (totalInput > output * 1.2) {
            const confirmed = window.confirm(
                `⚠️ HIGH SHRINKAGE / POTENTIAL UNIT ERROR ⚠️\n\n` +
                `Total Material Input: ${totalInput.toLocaleString()}\n` +
                `Target Output: ${output.toLocaleString()}\n` +
                `Implied Shrinkage: ${((totalInput - output) / totalInput * 100).toFixed(1)}%\n\n` +
                `This is unusually high. Did you mean to use '1 Sack' instead of 'Mass in KG'?\n` +
                `POLYFLOW STANDARD: Use KG for both Input and Output.\n\n` +
                `Click OK to save if this is intentional (e.g. high evaporation).\n` +
                `Click Cancel to fix quantities.`
            );
            if (!confirmed) return;
        }

        setIsSubmitting(true);
        try {
            const res = bom
                ? await updateBom(bom.id, values)
                : await createBom(values);

            if (res.success) {
                toast.success(bom ? 'BOM berhasil diperbarui.' : 'BOM berhasil dibuat.');
                router.push('/dashboard/boms');
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal menyimpan BOM');
            }
        } catch (_error) {
            toast.error('Terjadi kesalahan tak terduga');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                    className="h-10 w-10 rounded-full border bg-background"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {bom ? 'Edit Recipe' : 'Design New Recipe'}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {bom ? `Refining ${bom.name}` : 'Construct a new Bill of Materials architecture.'}
                    </p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* Header Section: General Info & Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <Card className="lg:col-span-2">
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Recipe Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Standard Recipe v1" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="productVariantId"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Output Product</FormLabel>
                                            <FormControl>
                                                <ProductCombobox
                                                    products={productVariants}
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={!!bom}
                                                    placeholder="Select product to produce"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Production Stage (Category)</FormLabel>
                                            <Select key={field.value} onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Stage" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="STANDARD">Standard (General)</SelectItem>
                                                    <SelectItem value="MIXING">Mixing (Adonan)</SelectItem>
                                                    <SelectItem value="EXTRUSION">Extrusion (Bahan Setengah Jadi)</SelectItem>
                                                    <SelectItem value="PACKING">Packing (Finishing)</SelectItem>
                                                    <SelectItem value="REWORK">Rework / Reject (Seset Affal)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="outputQuantity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Basis Output Quantity</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.0001" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="isDefault"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 mt-auto">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <div className="leading-none">
                                                <FormLabel className="cursor-pointer">Set as Primary Default Recipe</FormLabel>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        {/* Summary Box */}
                        {showPrices && (
                            <Card className="flex flex-col justify-center">
                                <CardContent className="pt-6">
                                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Total Formula Investment</div>
                                    <div className="text-4xl font-bold tracking-tight">
                                        {formatCurrency(formulaTotalInvestment)}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge variant={formulaWarnings.length > 0 ? 'destructive' : 'secondary'}>
                                            {formulaWarnings.length > 0 ? `${formulaWarnings.length} ingredient warning` : 'All ingredients within range'}
                                        </Badge>
                                        {outputDiagnostics && (
                                            <>
                                                <Badge variant={getCostSourceTone(outputDiagnostics.breakdown.source)}>
                                                    Output basis: {getCostSourceLabel(outputDiagnostics.breakdown.source)}
                                                </Badge>
                                                {outputGapLabel && (
                                                    <Badge variant={outputDiagnostics.flags.length > 0 ? 'destructive' : 'outline'}>
                                                        {outputGapLabel}
                                                    </Badge>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-4 flex flex-col gap-2">
                                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary w-[60%]" />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground italic">Calculated from current weighted stock cost, with standard cost as fallback.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {showPrices && formulaWarnings.length > 0 && (
                        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Ingredient cost warning</AlertTitle>
                            <AlertDescription className="space-y-2">
                                {formulaWarnings.map((warning, index) => (
                                    <div key={`${warning.variantId}-${warning.flag}-${index}`} className="rounded-md border border-amber-200/60 bg-background/70 p-3">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{warning.variantName}</Badge>
                                            <Badge variant="destructive">{getCostAlertShortLabel(warning.flag)}</Badge>
                                            {warning.gapLabel && <Badge variant="outline">{warning.gapLabel}</Badge>}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{warning.message}</p>
                                    </div>
                                ))}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Ingredients Listing (Table Based) */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-lg font-bold">Formula Configuration</CardTitle>
                                <Badge variant="secondary" className="ml-2">{fields.length} Components</Badge>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => append({ productVariantId: '', quantity: 1, scrapPercentage: 0 })}
                                size="sm"
                            >
                                <Plus className="h-4 w-4 mr-2" /> Add Material
                            </Button>
                        </CardHeader>

                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[400px]">Ingredient Material & SKU</TableHead>
                                            <TableHead className="text-center w-[150px]">Quantity</TableHead>
                                            <TableHead className="text-center w-[120px]">Scrap %</TableHead>
                                            {showPrices && <TableHead className="text-right w-[180px]">Line Investment</TableHead>}
                                            <TableHead className="text-right w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fields.map((field, index) => {
                                            const materialId = form.watch(`items.${index}.productVariantId`);
                                            const quantity = form.watch(`items.${index}.quantity`);
                                            const scrapPct = form.watch(`items.${index}.scrapPercentage`) || 0;
                                            const variant = productVariants.find(v => v.id === materialId);
                                            const diagnostics = resolveCostDiagnostics(variant);
                                            const gapLabel = diagnostics
                                                ? formatCostGapLabel(diagnostics.breakdown.currentCost, diagnostics.breakdown.standardCost)
                                                : null;

                                            // Effective quantity considering scrap
                                            const effectiveQty = Number(quantity ?? 0) * (1 + (Number(scrapPct) / 100));
                                            const unitCost = variant ? getCurrentUnitCost(variant) : 0;
                                            const lineCost = unitCost * effectiveQty;

                                            // Smart Suggestion Logic
                                            const currentCategory = form.watch('category');
                                            const displayVariants = productVariants.map(v => {
                                                let isSuggested = false;
                                                if (currentCategory === 'EXTRUSION') {
                                                    // Prioritize Adonan/WIP-MIX
                                                    isSuggested = v.name.toLowerCase().includes('adon') ||
                                                        v.skuCode.toLowerCase().includes('mix') ||
                                                        v.skuCode.toLowerCase().includes('wip');
                                                } else if (currentCategory === 'PACKING') {
                                                    // Prioritize Roll/Packaging
                                                    isSuggested = v.name.toLowerCase().includes('roll') ||
                                                        v.name.toLowerCase().includes('pack') ||
                                                        v.name.toLowerCase().includes('kemas') ||
                                                        v.skuCode.toLowerCase().includes('ext') ||
                                                        v.skuCode.toLowerCase().includes('pkg');
                                                }
                                                return { ...v, isSuggested };
                                            });

                                            const hasSuggestions = displayVariants.some(v => v.isSuggested);

                                            return (
                                                <TableRow key={field.id} className="group">
                                                    <TableCell className="py-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.productVariantId`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex flex-col gap-2">
                                                                    <FormControl>
                                                                        <ProductCombobox
                                                                            products={displayVariants}
                                                                            value={field.value}
                                                                            onValueChange={field.onChange}
                                                                            placeholder={hasSuggestions ? "Suggested materials..." : "Search material..."}
                                                                        />
                                                                    </FormControl>
                                                                    {variant && showPrices && diagnostics && (
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
                                                                                <Badge key={`${variant.id}-${flag}`} variant="outline">
                                                                                    {getCostAlertShortLabel(flag)}
                                                                                </Badge>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.quantity`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input type="number" step="0.0001" {...field} className="text-center" />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.scrapPercentage`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <div className="relative">
                                                                            <Input type="number" step="0.1" {...field} className="text-center pr-6" />
                                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                                                                        </div>
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    {showPrices && (
                                                        <TableCell className="py-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-medium text-sm">
                                                                    {formatCurrency(lineCost)}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {variant ? `@ ${formatCurrency(unitCost)}` : 'Rate Unavailable'}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="py-4 text-right">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => remove(index)}
                                                            disabled={fields.length === 1}
                                                            className="text-muted-foreground hover:text-red-500 h-8 w-8"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-end gap-4 pb-12">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => router.back()}
                            className="h-10"
                        >
                            Abandon Changes
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-10 px-8"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Menyimpan...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    {bom ? 'Finalize Updates' : 'Architect Recipe'}
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
