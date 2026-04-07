'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createGoodsReceiptSchema, CreateGoodsReceiptValues } from '@/lib/schemas/purchasing';
import { createGoodsReceipt } from '@/actions/purchasing/purchasing';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Trash2, Package, Info } from 'lucide-react';
import { ProductCombobox } from '@/components/products/product-combobox';

interface MaklonGoodsReceiptFormProps {
    customers: { id: string; name: string }[];
    productVariants: { id: string; name: string; skuCode: string; defaultCost?: number | null }[];
    locations: { id: string; name: string }[];
    defaultLocationId?: string;
    basePath?: string;
}

export function MaklonGoodsReceiptForm({
    customers,
    productVariants,
    locations,
    defaultLocationId,
    basePath = '/warehouse/incoming'
}: MaklonGoodsReceiptFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<CreateGoodsReceiptValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createGoodsReceiptSchema) as any,
        defaultValues: {
            isMaklon: true,
            customerId: '',
            receivedDate: new Date(),
            locationId: defaultLocationId || '',
            notes: 'Maklon material receipt',
            items: [{ productVariantId: '', receivedQty: 1, unitCost: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const onSubmit: SubmitHandler<CreateGoodsReceiptValues> = async (data) => {
        setIsLoading(true);
        try {
            const result = await createGoodsReceipt(data);
            if (!result.success) {
                toast.error(result.error || 'Failed to process Maklon receipt');
                return;
            }

            if (result.data) {
                toast.success('Maklon Goods received successfully');
                router.push(`${basePath}/${result.data.id}`);
                router.refresh();
            }
        } catch (_error) {
            toast.error('Failed to process receipt');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Package className="h-5 w-5 text-purple-500" />
                                    Receive Maklon Materials
                                </CardTitle>
                                <CardDescription>Register materials supplied by customers for Maklon production.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="p-4 border rounded-lg bg-muted/30 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                            <div className="md:col-span-6">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.productVariantId`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Product / Material</FormLabel>
                                                            <FormControl>
                                                                <ProductCombobox
                                                                    products={productVariants}
                                                                    value={field.value}
                                                                    onValueChange={field.onChange}
                                                                    placeholder="Select raw material..."
                                                                    className="h-9 w-full justify-start border-input bg-background"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="md:col-span-3">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.receivedQty`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Qty</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="number"
                                                                    {...field}
                                                                    onChange={e => field.onChange(Number(e.target.value))}
                                                                    className="h-9"
                                                                    min={1}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="md:col-span-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.unitCost`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Valuation Cost</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="number"
                                                                    {...field}
                                                                    onChange={e => field.onChange(Number(e.target.value))}
                                                                    className="h-9"
                                                                    min={0}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <div className="md:col-span-1 pt-6 text-right">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => remove(index)}
                                                    disabled={fields.length === 1}
                                                    className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-50 focus:ring-0"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="pt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => append({ productVariantId: '', receivedQty: 1, unitCost: 0 })}
                                            className="w-full border-dashed text-muted-foreground"
                                        >
                                            <Plus className="h-4 w-4 mr-2" /> Add Material
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Additional Information</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">Notes</FormLabel>
                                            <FormControl>
                                                <Textarea {...field} className="h-20" placeholder="Condition of goods, deviations, etc." />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Maklon Details</CardTitle>
                                <CardDescription>Customer and location mapping.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="customerId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold">Maklon Customer</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select customer..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {customers.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="locationId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold">Receive into Warehouse</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select location" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {locations.map(loc => (
                                                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="receivedDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel className="text-xs font-bold">Received Date</FormLabel>
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

                                <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-md border border-purple-200 dark:border-purple-800 flex gap-3 mt-4">
                                    <Info className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                                    <div className="text-[11px] text-purple-800 dark:text-purple-200">
                                        Maklon Receipts do not link to a Purchase Order. Valuation Cost is used for reporting purposes only, as no invoice will be generated.
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || fields.length === 0}
                                    className="w-full bg-purple-600 hover:bg-purple-700 h-11"
                                >
                                    {isLoading ? "Processing..." : (
                                        <>
                                            <Package className="mr-2 h-4 w-4" />
                                            Post Maklon Receipt
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}
