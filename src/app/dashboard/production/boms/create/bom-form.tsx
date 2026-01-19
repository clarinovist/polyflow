'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBomSchema, CreateBomValues } from '@/lib/schemas/production';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2 } from 'lucide-react';
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                {showPrices && (
                                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded border text-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-muted-foreground font-medium">Est. Cost / Unit:</span>
                                            <span className="font-bold text-lg text-emerald-600">
                                                {formatRupiah(totalEstimatedCost / (Number(field.value) || 1))}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                                            <span>Total Batch Cost:</span>
                                            <span>{formatRupiah(totalEstimatedCost)}</span>
                                        </div>
                                    </div>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Ingredients Table */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h3 className="text-lg font-semibold">Ingredients (Input Materials)</h3>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ productVariantId: '', quantity: 1 })}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Add Material
                        </Button>
                    </div>

                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="mb-4">
                                <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 dark:bg-zinc-900 p-4 rounded-lg border relative z-10">
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

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => remove(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                {showPrices && (
                                    <div className="px-4 pb-4 pt-4 text-right text-sm text-muted-foreground tabular-nums bg-slate-50/50 dark:bg-zinc-900/50 border-x border-b rounded-b-lg -mt-1 mx-1">
                                        Estimated: {(() => {
                                            const variantId = form.getValues(`items.${index}.productVariantId`);
                                            const qty = form.getValues(`items.${index}.quantity`);
                                            const variant = products.find(p => p.id === variantId);
                                            const cost = Number(variant?.buyPrice) || Number(variant?.price) || 0;
                                            return formatRupiah(cost * Number(qty));
                                        })()}
                                    </div>
                                )}
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
