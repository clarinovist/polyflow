'use client';

import React, { useState, useMemo } from 'react';
import { useForm, useFieldArray, SubmitHandler, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPurchaseOrderSchema, CreatePurchaseOrderValues } from '@/lib/schemas/purchasing';
import { createPurchaseOrder } from '@/actions/purchasing';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Trash2, ShoppingBag, Calculator } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { ProductCombobox } from '@/components/ui/product-combobox';
import { Badge } from '@/components/ui/badge';

interface PurchaseOrderFormProps {
    suppliers: { id: string; name: string; code: string | null }[];
    productVariants: { id: string; name: string; skuCode: string; buyPrice: number | null }[];
}

export function PurchaseOrderForm({ suppliers, productVariants }: PurchaseOrderFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<CreatePurchaseOrderValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createPurchaseOrderSchema) as any,
        defaultValues: {
            supplierId: '',
            orderDate: new Date(),
            expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
            notes: '',
            items: [{ productVariantId: '', quantity: 1, unitPrice: 0 }]
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const watchedItems = useWatch({
        control: form.control,
        name: 'items'
    });

    const totalAmount = useMemo(() => {
        return watchedItems.reduce((sum, item) => {
            return sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0));
        }, 0);
    }, [watchedItems]);

    const onSubmit: SubmitHandler<CreatePurchaseOrderValues> = async (data) => {
        setIsLoading(true);
        try {
            const result = await createPurchaseOrder(data);
            if (result) {
                toast.success('Purchase Order created successfully');
                router.push(`/planning/purchase-orders/${result.id}`);
                router.refresh();
            }
        } catch (_error) {
            toast.error('Failed to create Purchase Order');
        } finally {
            setIsLoading(false);
        }
    };

    const handleProductChange = (index: number, variantId: string) => {
        const variant = productVariants.find(v => v.id === variantId);
        if (variant) {
            form.setValue(`items.${index}.unitPrice`, Number(variant.buyPrice || 0));
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column (Items) - spans 8 columns */}
                    <div className="lg:col-span-8 space-y-6">
                        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                                            <ShoppingBag className="h-4 w-4 text-emerald-600" />
                                            Order Items
                                        </CardTitle>
                                        <CardDescription>Select products and quantities.</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-white">
                                        {fields.length} Items
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {/* Desktop Header */}
                                <div className="hidden md:grid md:grid-cols-[1fr_100px_140px_140px_48px] gap-4 px-6 py-3 bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground tracking-wider border-b">
                                    <div>Product / Material</div>
                                    <div className="text-center">Qty</div>
                                    <div>Unit Cost</div>
                                    <div className="text-right">Total</div>
                                    <div />
                                </div>

                                <div className="divide-y relative min-h-[200px]">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="group p-4 md:px-6 md:py-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_140px_140px_48px] gap-4 items-center">
                                                {/* Product */}
                                                <div className="w-full">
                                                    <div className="md:hidden text-[10px] font-bold text-muted-foreground mb-1">PRODUCT</div>
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.productVariantId`}
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0 text-left">
                                                                <FormControl>
                                                                    <ProductCombobox
                                                                        products={productVariants.map(v => ({ id: v.id, name: v.name, skuCode: v.skuCode }))}
                                                                        value={field.value}
                                                                        onValueChange={(val) => {
                                                                            field.onChange(val);
                                                                            handleProductChange(index, val);
                                                                        }}
                                                                        placeholder="Select product..."
                                                                        className="h-10 border-0 bg-transparent shadow-none p-0 hover:bg-transparent font-medium text-foreground w-full justify-start"
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {/* Qty */}
                                                <div>
                                                    <div className="md:hidden text-[10px] font-bold text-muted-foreground mb-1">QTY</div>
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.quantity`}
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0">
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                                            className="h-9 text-center font-mono text-sm bg-white dark:bg-black/20"
                                                                            min={1}
                                                                        />
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {/* Price */}
                                                <div>
                                                    <div className="md:hidden text-[10px] font-bold text-muted-foreground mb-1">PRICE</div>
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.unitPrice`}
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-0">
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                                            className="h-9 pl-8 text-right font-mono text-sm bg-white dark:bg-black/20"
                                                                        />
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                {/* Subtotal */}
                                                <div className="text-right font-mono text-sm font-medium">
                                                    <div className="md:hidden text-[10px] font-bold text-muted-foreground mb-1">TOTAL</div>
                                                    {formatRupiah((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.unitPrice || 0))}
                                                </div>

                                                {/* Delete */}
                                                <div className="flex justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                        disabled={fields.length === 1}
                                                        className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-4 border-t bg-muted/10">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => append({ productVariantId: '', quantity: 1, unitPrice: 0 })}
                                        className="w-full border-dashed text-muted-foreground hover:text-foreground hover:border-solid hover:bg-white"
                                    >
                                        <Plus className="h-4 w-4 mr-2" /> Add Item
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-none bg-transparent">
                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Internal Notes</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                {...field}
                                                placeholder="Add any internal notes, payment terms reminder, or special instructions..."
                                                className="resize-none bg-white dark:bg-zinc-900 min-h-[100px]"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </Card>
                    </div>

                    {/* Right Column (Summary) - spans 4 columns */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="sticky top-6 border-zinc-200 shadow-lg overflow-hidden">
                            <div className="bg-zinc-900 text-white p-6">
                                <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-widest font-bold mb-4">
                                    <Calculator className="h-3 w-3" /> Estimate Total
                                </div>
                                <div className="text-3xl font-bold font-mono tracking-tight">
                                    {formatRupiah(totalAmount)}
                                </div>
                            </div>

                            <CardContent className="p-6 space-y-6">
                                <FormField
                                    control={form.control}
                                    name="supplierId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Select Supplier</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue placeholder="Choose vendor..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {suppliers.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>
                                                            <div className="flex flex-col text-left">
                                                                <span className="font-medium">{s.name}</span>
                                                                <span className="text-[10px] text-muted-foreground">{s.code}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="orderDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Order Date</FormLabel>
                                                <Input
                                                    type="date"
                                                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                    onChange={e => field.onChange(new Date(e.target.value))}
                                                    className="h-10"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="expectedDate"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Due Date</FormLabel>
                                                <Input
                                                    type="date"
                                                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                    onChange={e => field.onChange(new Date(e.target.value))}
                                                    className="h-10"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="pt-4 border-t">
                                    <Button
                                        type="submit"
                                        className="w-full h-12 text-base font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center gap-2">
                                                <span className="h-4 w-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                                                Creating...
                                            </span>
                                        ) : "Confirm Purchase Order"}
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground mt-3">
                                        Creates a draft order. Approval may be required.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}
