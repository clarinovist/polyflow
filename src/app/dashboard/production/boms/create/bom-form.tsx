'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBomSchema, CreateBomValues } from '@/lib/zod-schemas';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { createBom, updateBom } from '@/actions/boms';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface BomFormProps {
    products: any[];
    initialData?: any; // The ID will be in initialData.id
}

export function BomForm({ products, initialData }: BomFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        resolver: zodResolver(createBomSchema),
        defaultValues: {
            name: initialData?.name || '',
            productVariantId: initialData?.productVariantId || '',
            outputQuantity: initialData?.outputQuantity || 1,
            isDefault: initialData?.isDefault || false,
            items: initialData?.items?.map((item: any) => ({
                productVariantId: item.productVariantId,
                quantity: Number(item.quantity),
                scrapPercentage: Number(item.scrapPercentage || 0)
            })) || [{ productVariantId: '', quantity: 0, scrapPercentage: 0 }]
        } as any, // Cast to any to avoid strict type mismatch with initial string inputs
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Determine units for display
    const watchOutputId = form.watch('productVariantId');
    const selectedOutput = products.find(p => p.id === watchOutputId);

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
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Finished Good / WIP" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {products.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name} ({p.skuCode})
                                            </SelectItem>
                                        ))}
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

                {/* Ingredients Table */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h3 className="text-lg font-semibold">Ingredients (Input Materials)</h3>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ productVariantId: '', quantity: 1, scrapPercentage: 0 })}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Add Material
                        </Button>
                    </div>

                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 p-4 rounded-lg border">
                                <FormField
                                    control={form.control}
                                    name={`items.${index}.productVariantId`}
                                    render={({ field }) => (
                                        <FormItem className="flex-1 w-full">
                                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Material</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select Material" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {products.map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
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

                                <FormField
                                    control={form.control}
                                    name={`items.${index}.scrapPercentage`}
                                    render={({ field }) => (
                                        <FormItem className="w-full md:w-32">
                                            <FormLabel className={index !== 0 ? "sr-only" : ""}>Scrap %</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input type="number" step="0.1" className="pr-6" {...field} />
                                                    <span className="absolute right-2 top-2.5 text-xs text-slate-500">%</span>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
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
            </form>
        </Form>
    );
}
