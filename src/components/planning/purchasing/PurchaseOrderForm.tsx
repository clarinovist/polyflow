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
import { Plus, Trash2, ShoppingBag, Calculator, User } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { ProductCombobox } from '@/components/ui/product-combobox';

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
                router.push(`/dashboard/purchasing/orders/${result.id}`);
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
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ShoppingBag className="h-5 w-5 text-blue-500" />
                                    Order Items
                                </CardTitle>
                                <CardDescription>Add products you want to order from the supplier.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="rounded-none border-b">
                                    {/* Table Header - Only visible on desktop */}
                                    <div className="hidden md:grid md:grid-cols-[1fr_100px_140px_140px_48px] gap-2 px-6 py-3 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                                        <div>Product / Material</div>
                                        <div className="text-center">Qty</div>
                                        <div>Unit Price (Rp)</div>
                                        <div className="text-right">Subtotal</div>
                                        <div />
                                    </div>

                                    {/* Item Rows */}
                                    <div className="divide-y">
                                        {fields.map((field, index) => (
                                            <div key={field.id} className="group p-4 md:px-6 md:py-3 transition-colors hover:bg-muted/5">
                                                <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_140px_140px_48px] gap-4 md:gap-2 items-start md:items-center">
                                                    {/* Product */}
                                                    <div className="min-w-0">
                                                        <div className="md:hidden text-[10px] font-medium text-muted-foreground mb-1 uppercase">Product</div>
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.productVariantId`}
                                                            render={({ field }) => (
                                                                <FormItem className="space-y-0">
                                                                    <FormControl>
                                                                        <ProductCombobox
                                                                            products={productVariants.map(v => ({
                                                                                id: v.id,
                                                                                name: v.name,
                                                                                skuCode: v.skuCode
                                                                            }))}
                                                                            value={field.value}
                                                                            onValueChange={(val) => {
                                                                                field.onChange(val);
                                                                                handleProductChange(index, val);
                                                                            }}
                                                                            placeholder="Select product..."
                                                                            className="h-10 border-zinc-200 dark:border-zinc-800"
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[10px]" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Quantity */}
                                                    <div>
                                                        <div className="md:hidden text-[10px] font-medium text-muted-foreground mb-1 uppercase">Quantity</div>
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.quantity`}
                                                            render={({ field }) => (
                                                                <FormItem className="space-y-0">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                                            className="h-10 text-center border-zinc-200 dark:border-zinc-800"
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[10px]" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Unit Price */}
                                                    <div>
                                                        <div className="md:hidden text-[10px] font-medium text-muted-foreground mb-1 uppercase">Unit Price</div>
                                                        <FormField
                                                            control={form.control}
                                                            name={`items.${index}.unitPrice`}
                                                            render={({ field }) => (
                                                                <FormItem className="space-y-0">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                                            className="h-10 border-zinc-200 dark:border-zinc-800"
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage className="text-[10px]" />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>

                                                    {/* Subtotal */}
                                                    <div>
                                                        <div className="md:hidden text-[10px] font-medium text-muted-foreground mb-1 uppercase text-right">Subtotal</div>
                                                        <div className="h-10 flex items-center justify-end px-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                                                            {formatRupiah((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.unitPrice || 0))}
                                                        </div>
                                                    </div>

                                                    {/* Delete */}
                                                    <div className="flex justify-end md:justify-center pt-2 md:pt-0">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => remove(index)}
                                                            disabled={fields.length === 1}
                                                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 transition-colors"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="p-4 bg-muted/5">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ productVariantId: '', quantity: 1, unitPrice: 0 })}
                                        className="w-full border-dashed hover:border-solid hover:bg-background transition-all h-10 text-muted-foreground hover:text-foreground"
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Add Line Item
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Internal Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Textarea {...field} placeholder="Specific instructions for the supplier or internal reminders..." className="min-h-[100px]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    Vendor Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="supplierId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Supplier</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select supplier" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {suppliers.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="expectedDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs">Expected Delivery</FormLabel>
                                            <Input
                                                type="date"
                                                value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                onChange={e => field.onChange(new Date(e.target.value))}
                                                className="w-full"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-900 text-white border-zinc-800">
                            <CardHeader className="pb-2 pt-4">
                                <CardTitle className="text-xs uppercase tracking-widest opacity-80 flex items-center gap-2">
                                    <Calculator className="h-3 w-3" />
                                    Order Summary
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono">
                                    {formatRupiah(totalAmount)}
                                </div>
                                <div className="text-[10px] mt-1 opacity-70">
                                    Based on {watchedItems.length} items
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full mt-6 bg-white text-zinc-900 hover:bg-zinc-100 font-bold"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Creating..." : "Place Purchase Order"}
                                </Button>

                                <p className="text-[9px] mt-3 text-center opacity-60 italic">
                                    PO will be created in DRAFT status.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}
