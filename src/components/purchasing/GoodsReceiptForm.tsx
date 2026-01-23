'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createGoodsReceiptSchema, CreateGoodsReceiptValues } from '@/lib/schemas/purchasing';
import { createGoodsReceipt } from '@/actions/purchasing';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Download, Info, CheckCircle } from 'lucide-react';

interface GoodsReceiptFormProps {
    purchaseOrderId: string;
    orderNumber: string;
    items: {
        productVariantId: string;
        productName: string;
        skuCode: string;
        orderedQty: number;
        receivedQty: number;
        unitPrice: number;
        unit: string;
    }[];
    locations: { id: string; name: string }[];
    defaultLocationId?: string;
    basePath?: string;
}

export function GoodsReceiptForm({
    purchaseOrderId,
    orderNumber,
    items,
    locations,
    defaultLocationId,
    basePath = '/dashboard/purchasing/orders'
}: GoodsReceiptFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    // Filter out items that are already fully received
    const pendingItems = items.filter(item => item.receivedQty < item.orderedQty);

    const form = useForm<CreateGoodsReceiptValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createGoodsReceiptSchema) as any,
        defaultValues: {
            purchaseOrderId,
            receivedDate: new Date(),
            locationId: defaultLocationId || '',
            notes: `Receipt for order ${orderNumber}`,
            items: pendingItems.map(item => ({
                productVariantId: item.productVariantId,
                receivedQty: item.orderedQty - item.receivedQty,
                unitCost: item.unitPrice
            }))
        }
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const onSubmit: SubmitHandler<CreateGoodsReceiptValues> = async (data) => {
        setIsLoading(true);
        try {
            const result = await createGoodsReceipt(data);
            if (result) {
                toast.success('Goods received successfully');
                router.push(`${basePath}/${purchaseOrderId}`);
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
                                    <Package className="h-5 w-5 text-blue-500" />
                                    Receive Items
                                </CardTitle>
                                <CardDescription>Verify quantities and costs for items being received.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {fields.map((field, index) => {
                                        const originalItem = items.find(i => i.productVariantId === field.productVariantId);
                                        return (
                                            <div key={field.id} className="p-4 border rounded-lg bg-muted/30 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                                                <div className="md:col-span-2">
                                                    <p className="font-semibold text-sm">{originalItem?.productName}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{originalItem?.skuCode}</p>
                                                    <div className="mt-1 flex gap-2">
                                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Ordered: {originalItem?.orderedQty}</span>
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded">Prev. Recv: {originalItem?.receivedQty}</span>
                                                    </div>
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.receivedQty`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Incoming Qty</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="number"
                                                                    {...field}
                                                                    onChange={e => field.onChange(Number(e.target.value))}
                                                                    className="h-9"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.unitCost`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Actual Unit Cost (Rp)</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="number"
                                                                    {...field}
                                                                    onChange={e => field.onChange(Number(e.target.value))}
                                                                    className="h-9"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        );
                                    })}

                                    {fields.length === 0 && (
                                        <div className="py-8 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                                            All items have been fully received.
                                        </div>
                                    )}
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
                                <CardTitle className="text-sm">Receipt Header</CardTitle>
                                <CardDescription>Basic information for this entry.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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

                                <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-800 flex gap-3">
                                    <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="text-[11px] text-amber-800 dark:text-amber-200">
                                        Confirming this receipt will automatically update stock levels and recalculate the <strong>Weighted Average Cost (WAC)</strong> for each item.
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || fields.length === 0}
                                    className="w-full bg-blue-600 hover:bg-blue-700 h-11"
                                >
                                    {isLoading ? "Processing..." : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            Post Goods Receipt
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {fields.length > 0 && (
                            <Card className="bg-slate-50 dark:bg-slate-900/50">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 text-emerald-600 font-bold mb-2">
                                        <CheckCircle className="h-4 w-4" />
                                        <span className="text-xs uppercase tracking-wider">Verification Checklist</span>
                                    </div>
                                    <ul className="text-xs space-y-2 text-muted-foreground">
                                        <li>• Quantity matches physical count</li>
                                        <li>• Unit cost matches supplier invoice</li>
                                        <li>• Batch quality is acceptable</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </form>
        </Form>
    );
}
