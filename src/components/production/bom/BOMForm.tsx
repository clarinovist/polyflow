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
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { createBom, updateBom } from '@/actions/boms';
import { toast } from 'sonner';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { Card, CardContent } from '@/components/ui/card';

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
            items: [{ productVariantId: '', quantity: 1 }]
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                items: bom.items.map((item: any) => ({
                    productVariantId: item.productVariantId,
                    quantity: Number(item.quantity)
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
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
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
                        <Card className="lg:col-span-2 bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl overflow-hidden">
                            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            </CardContent>
                        </Card>

                        {/* Summary Box */}
                        {showPrices && (
                            <div className="bg-emerald-600/10 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-8 flex flex-col justify-center relative overflow-hidden group shadow-2xl shadow-emerald-500/10">
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
                    <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-2xl overflow-hidden rounded-3xl">
                        <div className="p-8 pb-4 flex items-center justify-between border-b border-white/5">
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
                                onClick={() => append({ productVariantId: '', quantity: 1 })}
                                className="h-11 px-6 border-primary/20 hover:border-primary/50 bg-primary/10 hover:bg-primary/20 transition-all font-bold rounded-xl"
                            >
                                <Plus className="h-4 w-4 mr-2" /> Add Material
                            </Button>
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30 border-b border-white/5">
                                    <TableRow className="hover:bg-transparent border-0">
                                        <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground px-8 py-5">Ingredient Material & SKU</TableHead>
                                        <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-center w-[200px]">Quantity</TableHead>
                                        {showPrices && <TableHead className="text-[11px] font-black uppercase tracking-widest text-muted-foreground py-5 text-right w-[200px]">Line Investment</TableHead>}
                                        <TableHead className="py-5 text-right w-[100px] px-8"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="[&_tr:last-child]:border-0 px-8">
                                    {fields.map((field, index) => {
                                        const materialId = form.watch(`items.${index}.productVariantId`);
                                        const quantity = form.watch(`items.${index}.quantity`);
                                        const variant = productVariants.find(v => v.id === materialId);
                                        const lineCost = variant ? Number(variant.standardCost ?? variant.buyPrice ?? 0) * Number(quantity ?? 0) : 0;

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
                                                                        products={productVariants}
                                                                        value={field.value}
                                                                        onValueChange={field.onChange}
                                                                        placeholder="Search and select material..."
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
                                                                    <Input type="number" step="0.0001" {...field} className="h-11 text-center font-black bg-background/30 border-white/10 text-lg focus:bg-background/50" />
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
                    </Card>

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
