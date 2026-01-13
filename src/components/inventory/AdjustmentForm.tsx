'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bulkAdjustStockSchema, BulkAdjustStockValues } from '@/lib/zod-schemas';
import { adjustStockBulk } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SerializedInventory {
    locationId: string;
    productVariantId: string;
    quantity: number;
}

interface AdjustmentFormProps {
    locations: { id: string; name: string }[];
    products: { id: string; name: string; skuCode: string }[];
    inventory: SerializedInventory[];
}

export function AdjustmentForm({ locations, products, inventory }: AdjustmentFormProps) {
    const router = useRouter();
    const form = useForm<BulkAdjustStockValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(bulkAdjustStockSchema) as any,
        defaultValues: {
            locationId: '',
            items: [{
                productVariantId: '',
                type: 'ADJUSTMENT_IN',
                quantity: 0,
                reason: ''
            }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    const selectedLocationId = useWatch({ control: form.control, name: 'locationId' });

    // Filter products based on selected location
    // Actually, for adjustments, we might want to adjust items NOT in inventory (create new stock = IN)
    // So we should show ALL products, but maybe indicate current stock if exists.
    // The original code filtered:
    // const filteredProducts = ... (only showed items in inventory? No, that was for transfer source?)
    // Original AdjustmentForm logic:
    // "filteredProducts" mapped products and attached quantity if found.
    // UseMemo...
    const availableProducts = useMemo(() => {
        return products.map(prod => {
            const inv = inventory.find(
                (item) => item.locationId === selectedLocationId && item.productVariantId === prod.id
            );
            return { ...prod, quantity: inv ? inv.quantity : 0 };
        });
    }, [products, inventory, selectedLocationId]);


    // Reset items if location changes?
    // User might want to keep same items and just change location?
    // But stock display would be wrong.
    // Better to encourage re-selecting or just let it update reactively.
    // The `availableProducts` update will just update the displayed "Available: X".
    // So no need to hard reset items, just let user know.

    async function onSubmit(data: BulkAdjustStockValues) {
        const result = await adjustStockBulk(data);
        if (result.success) {
            toast.success('Stock adjusted successfully');
            form.reset({
                locationId: '',
                items: [{
                    productVariantId: '',
                    type: 'ADJUSTMENT_IN',
                    quantity: 0,
                    reason: ''
                }],
            });
            router.refresh();
            // router.push('/dashboard/inventory');
        } else {
            toast.error(result.error || 'Failed to adjust stock');
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Location" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {locations.map((loc) => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <FormLabel className="text-base font-semibold">Adjustment Items</FormLabel>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({
                                productVariantId: '',
                                type: 'ADJUSTMENT_IN',
                                quantity: 0,
                                reason: ''
                            })}
                            disabled={!selectedLocationId}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    </div>

                    {!selectedLocationId && (
                        <div className="text-sm text-muted-foreground italic">
                            Please select a location to add items.
                        </div>
                    )}

                    {fields.map((field, index) => (
                        <Card key={field.id} className="p-4 border border-border/50 bg-secondary/10">
                            <div className="flex gap-4 items-start">
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.productVariantId`}
                                        render={({ field }) => (
                                            <FormItem className="md:col-span-2">
                                                <FormLabel className="text-xs">Product</FormLabel>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    disabled={!selectedLocationId}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Product" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {availableProducts.map((prod) => (
                                                            <SelectItem key={prod.id} value={prod.id}>
                                                                {prod.skuCode} - {prod.name} (Cur: {prod.quantity})
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
                                        name={`items.${index}.type`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs">Type</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select Type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="ADJUSTMENT_IN">IN (Surplus)</SelectItem>
                                                        <SelectItem value="ADJUSTMENT_OUT">OUT (Loss/Damage)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.quantity`}
                                        render={({ field }) => {
                                            const selectedProductId = form.getValues(`items.${index}.productVariantId`);
                                            const type = form.getValues(`items.${index}.type`);
                                            const currentStock = availableProducts.find(p => p.id === selectedProductId)?.quantity || 0;

                                            const max = type === 'ADJUSTMENT_OUT' ? currentStock : undefined;

                                            return (
                                                <FormItem>
                                                    <div className="flex justify-between items-center">
                                                        <FormLabel className="text-xs">Quantity</FormLabel>
                                                        {type === 'ADJUSTMENT_OUT' && (
                                                            <span className="text-[10px] text-muted-foreground">Max: {currentStock}</span>
                                                        )}
                                                    </div>
                                                    <FormControl>
                                                        <Input type="number" step="0.01" max={max} {...field} className="bg-background" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            );
                                        }}
                                    />

                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.reason`}
                                        render={({ field }) => (
                                            <FormItem className="md:col-span-2">
                                                <FormLabel className="text-xs">Reason</FormLabel>
                                                <FormControl>
                                                    <Textarea {...field} placeholder="e.g. Stock Opname Variance" className="min-h-[60px] bg-background" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {fields.length > 1 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="mt-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => remove(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>

                <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                    {form.formState.isSubmitting ? 'Submitting...' : 'Submit Adjustment'}
                </Button>
            </form>
        </Form>
    );
}
