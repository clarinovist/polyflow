'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2, Info } from 'lucide-react';
import { useState } from 'react';
import { createBom, updateBom } from '@/actions/boms';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { formatRupiah } from '@/lib/utils';

export interface Product {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    price: number | null;
    buyPrice: number | null;
}

export interface BomFormProps {
    products: Product[];
    initialData?: {
        id?: string;
        name?: string;
        productVariantId?: string;
        outputQuantity?: number;
        isDefault?: boolean;
        items?: Array<{
            productVariantId: string;
            quantity: number | { toNumber: () => number };
        }>;
    };
    showPrices?: boolean;
}

export function BomForm({ products, initialData, showPrices = false }: BomFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreateBomValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createBomSchema) as any,
        defaultValues: {
            name: initialData?.name || '',
            productVariantId: initialData?.productVariantId || '',
            outputQuantity: Number(initialData?.outputQuantity) || 1,
            isDefault: initialData?.isDefault || false,
            items: initialData?.items?.map((item) => ({
                productVariantId: item.productVariantId,
                quantity: typeof item.quantity === 'number'
                    ? item.quantity
                    : typeof item.quantity === 'string'
                        ? Number(item.quantity)
                        : item.quantity.toNumber(),
            })) || [{ productVariantId: '', quantity: 0 }]
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Determine units for display
    const watchOutputId = useWatch({ control: form.control, name: 'productVariantId' });
    const selectedOutput = products.find(p => p.id === watchOutputId);

    // Calculate estimated cost
    const watchItems = useWatch({ control: form.control, name: 'items' });
    const totalEstimatedCost = showPrices ? watchItems?.reduce((sum, item) => {
        const variant = products.find(p => p.id === item.productVariantId);
        const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0;
        // Use buyPrice (Cost) if available, otherwise fallback to price, then 0.
        const cost = Number(variant?.buyPrice) || Number(variant?.price) || 0;
        return sum + (qty * cost);
    }, 0) : 0;

    // Calculate total input quantity
    const totalInputQuantity = watchItems?.reduce((sum, item) => {
        return sum + (typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0);
    }, 0) || 0;

    const outputQuantity = Number(useWatch({ control: form.control, name: 'outputQuantity' })) || 0;

    // Unit Consistency Check
    const outputUnit = selectedOutput?.primaryUnit;
    const isUnitsConsistent = watchItems?.every(item => {
        const p = products.find(p => p.id === item.productVariantId);
        return p?.primaryUnit === outputUnit;
    });

    const isInputExceedsOutput = totalInputQuantity > outputQuantity;
    const isInputLessThanOutput = totalInputQuantity < outputQuantity;

    async function onSubmit(data: CreateBomValues) {
        setIsSubmitting(true);
        let result;

        if (initialData?.id) {
            result = await updateBom(initialData.id, data);
        } else {
            result = await createBom(data);
        }

        setIsSubmitting(false);

        if (result.success) {
            toast.success(initialData?.id ? "BOM Recipe Updated" : "BOM Recipe Created", {
                description: `Recipe "${data.name}" has been saved.`
            });
            router.push('/dashboard/production/boms');
        } else {
            toast.error("Error", {
                description: result.error || "Failed to save BOM"
            });
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                {/* header section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Recipe Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g. Standard Production Recipe" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="isDefault"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 mt-8">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Default Recipe</FormLabel>
                                    <FormDescription>
                                        Use this recipe as the default for this product.
                                    </FormDescription>
                                </div>
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <FormField
                        control={form.control}
                        name="productVariantId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Output Product</FormLabel>
                                <FormControl>
                                    <ProductCombobox
                                        products={products}
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        placeholder="Search finished good / WIP..."
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
                                <FormLabel>Basis Quantity (Output)</FormLabel>
                                <FormControl>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" step="0.01" {...field} />
                                        <span className="text-sm text-slate-500 w-16">
                                            {selectedOutput?.primaryUnit || 'Unit'}
                                        </span>
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    The base amount this recipe produces (e.g. 100 KG).
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Cost Summary Card - Full Width */}
                {showPrices && (
                    <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-800 rounded-lg border">
                        {totalEstimatedCost > 0 ? (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Estimated Cost / Unit</p>
                                    <p className="text-2xl font-bold text-emerald-600">
                                        {formatRupiah(totalEstimatedCost / (Number(form.getValues('outputQuantity')) || 1))}
                                    </p>
                                </div>
                                <div className="hidden sm:block w-px h-12 bg-border" />
                                <div className="sm:text-right border-t sm:border-t-0 pt-4 sm:pt-0">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Batch Cost</p>
                                    <p className="text-lg font-semibold text-foreground">{formatRupiah(totalEstimatedCost)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-2">
                                <p className="text-muted-foreground text-sm">💡 Tambahkan bahan baku di bawah untuk melihat estimasi biaya</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Ingredients Table */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold">Ingredients (Input Materials)</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Total Input: <span className={isInputExceedsOutput ? "text-amber-500 font-bold" : ""}>{totalInputQuantity.toFixed(2)}</span></span>
                                <span>/</span>
                                <span>Basis Output: {outputQuantity.toFixed(2)}</span>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ productVariantId: '', quantity: 1 })}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Add Material
                        </Button>
                    </div>

                    {isInputExceedsOutput && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-3">
                            <Info className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-900 dark:text-amber-200">
                                <p className="font-semibold">Input exceeds Output (Yield Loss?)</p>
                                <p>Total ingredients ({totalInputQuantity}) is greater than the basis quantity ({outputQuantity}).
                                    {isUnitsConsistent
                                        ? " Since units are the same, this implies Yield Loss (Scrap)."
                                        : " Confirm if unit conversion (e.g. Pcs -> Kg) accounts for this difference."}
                                </p>
                            </div>
                        </div>
                    )}

                    {isInputLessThanOutput && (
                        <div className={`rounded-md p-3 flex items-start gap-3 border ${isUnitsConsistent
                                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                            }`}>
                            <Info className={`h-5 w-5 shrink-0 mt-0.5 ${isUnitsConsistent ? "text-red-600 dark:text-red-500" : "text-blue-600 dark:text-blue-500"
                                }`} />
                            <div className={`text-sm ${isUnitsConsistent ? "text-red-900 dark:text-red-200" : "text-blue-900 dark:text-blue-200"
                                }`}>
                                <p className="font-semibold">
                                    {isUnitsConsistent ? "Input is less than Output (Missing Ingredients?)" : "Input < Output (Unit Conversion?)"}
                                </p>
                                <p>
                                    Total ingredients ({totalInputQuantity}) is less than the basis quantity ({outputQuantity}).
                                    {isUnitsConsistent
                                        ? " Since units are the same, you might be missing ingredients or creating 'magic' mass."
                                        : " This is normal if converting larger units to smaller ones (e.g. 1 Drum -> 200 Liters)."}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 dark:bg-zinc-900 p-4 rounded-lg border">
                                <FormField
                                    control={form.control}
                                    name={`items.${index}.productVariantId`}
                                    render={({ field }) => (
                                        <FormItem className="flex-1 w-full">
                                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Material</FormLabel>
                                            <FormControl>
                                                <ProductCombobox
                                                    products={products}
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    placeholder="Search material..."
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name={`items.${index}.quantity`}
                                    render={({ field }) => (
                                        <FormItem className="w-full md:w-32">
                                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Qty</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.001" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {showPrices && (
                                    <div className="w-full md:w-36 text-right text-sm text-muted-foreground tabular-nums">
                                        <span className={index !== 0 ? "sr-only" : "block text-xs font-medium mb-1"}>Est. Cost</span>
                                        <span className="font-medium text-foreground">
                                            {(() => {
                                                const variantId = form.getValues(`items.${index}.productVariantId`);
                                                const qty = form.getValues(`items.${index}.quantity`);
                                                const variant = products.find(p => p.id === variantId);
                                                const cost = Number(variant?.buyPrice) || Number(variant?.price) || 0;
                                                return formatRupiah(cost * Number(qty));
                                            })()}
                                        </span>
                                    </div>
                                )}

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                                    onClick={() => remove(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-4">
                    <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {initialData?.id ? "Update Recipe" : "Save Recipe"}
                    </Button>
                </div>
            </form >
        </Form >
    );
}
