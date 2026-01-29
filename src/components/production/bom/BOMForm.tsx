'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Save, Loader2, ArrowLeft } from 'lucide-react';
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
import { createBom, updateBom } from '@/actions/boms';
import { toast } from 'sonner';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { BrandCard, BrandCardContent, BrandCardHeader, BrandGradientText } from '@/components/brand/BrandCard';

interface BOMFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bom?: any; // If present, we are editing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    productVariants: any[];
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
        setIsSubmitting(true);
        try {
            const res = bom
                ? await updateBom(bom.id, values)
                : await createBom(values);

            if (res.success) {
                toast.success(bom ? 'BOM updated successfully' : 'BOM created successfully');
                router.push('/dashboard/boms');
                router.refresh();
            } else {
                toast.error(res.error || 'Failed to save BOM');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
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
                    className="h-10 w-10 rounded-full border border-white/10 bg-background/50"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-black tracking-tight">
                        <BrandGradientText>{bom ? 'Edit Recipe' : 'Design New Recipe'}</BrandGradientText>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">
                        {bom ? `Refining ${bom.name}` : 'Construct a new Bill of Materials architecture.'}
                    </p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* Header Section: General Info & Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <BrandCard className="lg:col-span-2 overflow-hidden">
                            <BrandCardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider opacity-60">Recipe Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Standard Recipe v1" {...field} className="bg-background/20 h-12 border-white/10 text-lg font-bold" />
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
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider opacity-60">Output Product</FormLabel>
                                            <FormControl>
                                                <ProductCombobox
                                                    products={productVariants}
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={!!bom}
                                                    placeholder="Select product to produce"
                                                    className="h-12 bg-background/20 border-white/10"
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
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider opacity-60">Production Stage (Category)</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="bg-background/20 h-12 border-white/10 text-lg font-bold">
                                                        <SelectValue placeholder="Select Stage" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="STANDARD">Standard (General)</SelectItem>
                                                    <SelectItem value="MIXING">Mixing (Adonan)</SelectItem>
                                                    <SelectItem value="EXTRUSION">Extrusion (Bahan Setengah Jadi)</SelectItem>
                                                    <SelectItem value="PACKING">Packing (Finishing)</SelectItem>
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
                                            <FormLabel className="text-[10px] font-bold uppercase tracking-wider opacity-60">Basis Output Quantity</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.0001" {...field} className="bg-background/20 h-12 border-white/10 font-mono text-lg" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="isDefault"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-xl border border-white/5 bg-primary/5 p-4 mt-auto h-12 transition-all hover:bg-primary/10">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <div className="leading-none">
                                                <FormLabel className="text-sm font-bold cursor-pointer">Set as Primary Default Recipe</FormLabel>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </BrandCardContent>
                        </BrandCard>

                        {/* Summary Box */}
                        {showPrices && (
                            <div className="bg-emerald-600/10 backdrop-blur-brand border border-emerald-500/20 rounded-3xl p-8 flex flex-col justify-center relative overflow-hidden group shadow-brand">
                                <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:scale-110 transition-transform duration-1000 rotate-12">
                                    <Save className="w-48 h-48 text-emerald-600" />
                                </div>
                                <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-600/70 dark:text-emerald-400/70 mb-2">Total Formula Investment</div>
                                <div className="text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">
                                    {(() => {
                                        const watchedItems = form.watch('items');
                                        const total = watchedItems.reduce((acc, item) => {
                                            const variant = productVariants.find(v => v.id === item.productVariantId);
                                            if (!variant) return acc;
                                            const cost = Number(variant.standardCost ?? variant.buyPrice ?? 0);
                                            return acc + (cost * Number(item.quantity ?? 0));
                                        }, 0);
                                        return formatCurrency(total);
                                    })()}
                                </div>
                                <div className="mt-6 flex flex-col gap-2">
                                    <div className="h-1.5 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 w-[60%] shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground font-bold italic">Calculated based on current material benchmarks.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ingredients Listing (Table Based) */}
                    <BrandCard className="overflow-hidden rounded-3xl">
                        <BrandCardHeader>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <Plus className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-widest text-foreground">Formula Configuration</h3>
                                    <p className="text-xs text-muted-foreground font-medium">Specify the raw materials and precise quantities required.</p>
                                </div>
                                <Badge variant="secondary" className="ml-2 h-6 px-3 font-black text-xs bg-primary/10 text-primary border-primary/20">{fields.length} Components</Badge>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => append({ productVariantId: '', quantity: 1, scrapPercentage: 0 })}
                                className="h-11 px-6 border-primary/20 hover:border-primary/50 bg-primary/10 hover:bg-primary/20 transition-all font-bold rounded-xl"
                            >
                                <Plus className="h-4 w-4 mr-2" /> Add Material
                            </Button>
                        </BrandCardHeader>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30 border-b border-brand">
                                    <TableRow className="hover:bg-transparent border-0">
                                        <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-8 py-5">Ingredient Material & SKU</TableHead>
                                        <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-center w-[150px]">Quantity</TableHead>
                                        <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-center w-[120px]">Scrap %</TableHead>
                                        {showPrices && <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-right w-[180px]">Line Investment</TableHead>}
                                        <TableHead className="py-5 text-right w-[100px] px-8"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="[&_tr:last-child]:border-0 px-8">
                                    {fields.map((field, index) => {
                                        const materialId = form.watch(`items.${index}.productVariantId`);
                                        const quantity = form.watch(`items.${index}.quantity`);
                                        const scrapPct = form.watch(`items.${index}.scrapPercentage`) || 0;
                                        const variant = productVariants.find(v => v.id === materialId);

                                        // Effective quantity considering scrap
                                        const effectiveQty = Number(quantity ?? 0) * (1 + (Number(scrapPct) / 100));
                                        const lineCost = variant ? Number(variant.standardCost ?? variant.buyPrice ?? 0) * effectiveQty : 0;

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
                                            <TableRow key={field.id} className="border-white/5 hover:bg-primary/[0.02] group transition-colors">
                                                <TableCell className="py-6 px-8">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.productVariantId`}
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col">
                                                                <FormControl>
                                                                    <ProductCombobox
                                                                        products={displayVariants}
                                                                        value={field.value}
                                                                        onValueChange={field.onChange}
                                                                        placeholder={hasSuggestions ? "Suggested materials..." : "Search material..."}
                                                                        className="h-11 border-white/10 bg-background/30 transition-all focus:bg-background/50"
                                                                    />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.quantity`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <Input type="number" step="0.0001" {...field} className="h-11 text-center font-bold bg-background/30 border-white/10 text-base focus:bg-background/50" />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.scrapPercentage`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input type="number" step="0.1" {...field} className="h-11 text-center font-bold bg-background/30 border-white/10 text-base focus:bg-background/50 pr-6" />
                                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40">%</span>
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </TableCell>
                                                {showPrices && (
                                                    <TableCell className="py-6 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                                                                {formatCurrency(lineCost)}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-muted-foreground tracking-wider opacity-60">
                                                                {variant ? `@ ${formatCurrency(Number(variant.standardCost ?? variant.buyPrice ?? 0))}` : 'Rate Unavailable'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                )}
                                                <TableCell className="py-6 text-right px-8">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                        disabled={fields.length === 1}
                                                        className="text-muted-foreground hover:text-red-500 h-10 w-10 transition-all hover:bg-red-500/10 rounded-xl"
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </BrandCard>

                    <div className="flex items-center justify-end gap-4 pb-12">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => router.back()}
                            className="h-14 px-8 text-base font-bold transition-all hover:bg-white/5"
                        >
                            Abandon Changes
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-14 px-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 shadow-2xl shadow-blue-500/20 border-0 text-base font-black tracking-wider transition-all hover:scale-105 active:scale-95 rounded-2xl"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                                    Synchronizing...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-3 h-6 w-6" />
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
