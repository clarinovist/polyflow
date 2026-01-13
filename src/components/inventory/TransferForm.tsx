'use client';

import { useForm, useWatch, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transferStockSchema, TransferStockValues } from '@/lib/zod-schemas';
import { transferStock } from '@/actions/inventory';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect } from 'react';

interface TransferFormProps {
    locations: { id: string; name: string }[];
    products: { id: string; name: string; skuCode: string }[];
    inventory: { locationId: string; productVariantId: string; quantity: number }[];
}

export function TransferForm({ locations, products, inventory }: TransferFormProps) {
    const router = useRouter();
    const form = useForm<TransferStockValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(transferStockSchema) as any,
        defaultValues: {
            sourceLocationId: '',
            destinationLocationId: '',
            productVariantId: '',
            quantity: 0,
            notes: '',
            date: new Date(),
        },
        mode: 'onChange',
    });

    const sourceLocationId = useWatch({
        control: form.control,
        name: 'sourceLocationId',
    });

    const filteredProducts = useMemo(() => {
        if (!sourceLocationId) return [];

        return inventory
            .filter(i => i.locationId === sourceLocationId && i.quantity > 0)
            .map(i => {
                const product = products.find(p => p.id === i.productVariantId);
                return product ? { ...product, quantity: i.quantity } : null;
            })
            .filter((p): p is (typeof products[0] & { quantity: number }) => p !== null);
    }, [sourceLocationId, inventory, products]);

    // Reset product if it's no longer in the filtered list
    useEffect(() => {
        const currentProductId = form.getValues('productVariantId');
        if (currentProductId && !filteredProducts.find(p => p.id === currentProductId)) {
            form.setValue('productVariantId', '');
        }
    }, [filteredProducts, form]);

    // Clear destination if same as source
    const destinationLocationId = useWatch({
        control: form.control,
        name: 'destinationLocationId',
    });

    useEffect(() => {
        if (sourceLocationId && destinationLocationId && sourceLocationId === destinationLocationId) {
            form.setValue('destinationLocationId', '', { shouldValidate: true });
            toast.error("Source and destination cannot be the same");
        }
    }, [sourceLocationId, destinationLocationId, form]);

    const onSubmit: SubmitHandler<TransferStockValues> = async (data) => {
        const result = await transferStock(data);
        if (result.success) {
            toast.success('Stock transferred successfully');
            form.reset();
            router.refresh();
            router.push('/dashboard/inventory');
        } else {
            toast.error(result.error || 'Failed to transfer stock');
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="sourceLocationId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Source Location</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Source" />
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
                        name="destinationLocationId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Destination Location</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Destination" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {locations.map((loc) => (
                                            <SelectItem key={loc.id} value={loc.id} disabled={loc.id === sourceLocationId}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="productVariantId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Product</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                                disabled={!sourceLocationId}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={sourceLocationId ? "Select Product" : "Select Source First"} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {filteredProducts.map((prod) => (
                                        <SelectItem key={prod.id} value={prod.id}>
                                            {prod.skuCode} - {prod.name} ({prod.quantity})
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
                    name="quantity"
                    render={({ field }) => {
                        const selectedProductId = form.getValues('productVariantId');
                        const currentStock = filteredProducts.find(p => p.id === selectedProductId)?.quantity;

                        return (
                            <FormItem>
                                <div className="flex justify-between items-center">
                                    <FormLabel>Quantity</FormLabel>
                                    {currentStock !== undefined && (
                                        <span className="text-xs font-medium text-slate-500">
                                            Available: {currentStock}
                                        </span>
                                    )}
                                </div>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        max={currentStock}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl>
                                <Textarea {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || !form.formState.isValid || (!!sourceLocationId && sourceLocationId === destinationLocationId)}
                    className="w-full"
                >
                    {form.formState.isSubmitting ? 'Transferring...' : 'Transfer Stock'}
                </Button>
            </form>
        </Form>
    );
}
