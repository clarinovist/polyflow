'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { adjustStockSchema, AdjustStockValues } from '@/lib/zod-schemas';
import { adjustStock } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect } from 'react';

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
    const form = useForm<AdjustStockValues>({
        resolver: zodResolver(adjustStockSchema) as any,
        defaultValues: {
            locationId: '',
            productVariantId: '',
            quantity: 0,
            type: 'ADJUSTMENT_IN',
            reason: '',
        },
    });

    const selectedLocationId = form.watch('locationId');
    const selectedProductId = form.watch('productVariantId');

    // Filter products based on selected location
    const filteredProducts = useMemo(() => {
        return products.map(prod => {
            const inv = inventory.find(
                (item) => item.locationId === selectedLocationId && item.productVariantId === prod.id
            );
            return inv ? { ...prod, quantity: inv.quantity } : null;
        }).filter((p): p is (typeof products[0] & { quantity: number }) => p !== null);
    }, [products, inventory, selectedLocationId]);

    const currentStock = useMemo(() => {
        if (!selectedLocationId || !selectedProductId) return null;
        return inventory.find(
            (item) => item.locationId === selectedLocationId && item.productVariantId === selectedProductId
        )?.quantity ?? 0;
    }, [selectedLocationId, selectedProductId, inventory]);

    // Reset product selection when location changes
    const onLocationChange = (val: string) => {
        form.setValue('locationId', val);
        form.setValue('productVariantId', '');
    };

    async function onSubmit(data: AdjustStockValues) {
        const result = await adjustStock(data);
        if (result.success) {
            toast.success('Stock adjusted successfully');
            form.reset({
                quantity: 0,
                type: 'ADJUSTMENT_IN',
                reason: '',
                locationId: '',
                productVariantId: ''
            });
            router.refresh();
            router.push('/dashboard/inventory');
        } else {
            toast.error(result.error || 'Failed to adjust stock');
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location</FormLabel>
                            <Select onValueChange={onLocationChange} defaultValue={field.value}>
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

                <FormField
                    control={form.control}
                    name="productVariantId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Product</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!selectedLocationId}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={selectedLocationId ? "Select Product" : "Select a location first"} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {filteredProducts.length > 0 ? (
                                        filteredProducts.map((prod) => (
                                            <SelectItem key={prod.id} value={prod.id}>
                                                {prod.skuCode} - {prod.name} ({prod.quantity})
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <div className="p-2 text-sm text-slate-500 text-center">
                                            No products found in this location
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Adjustment Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="ADJUSTMENT_IN">IN (Found / Surplus)</SelectItem>
                                        <SelectItem value="ADJUSTMENT_OUT">OUT (Lost / Damaged)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex justify-between items-center">
                                    <FormLabel>Quantity</FormLabel>
                                    {currentStock !== null && (
                                        <span className="text-xs font-medium text-slate-500">
                                            Current: {currentStock}
                                        </span>
                                    )}
                                </div>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reason</FormLabel>
                            <FormControl>
                                <Textarea {...field} placeholder="e.g. Stock Opname Variance" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Submitting...' : 'Submit Adjustment'}
                </Button>
            </form>
        </Form>
    );
}
