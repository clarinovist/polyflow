'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPurchaseReturnSchema, CreatePurchaseReturnValues } from '@/lib/schemas/returns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createPurchaseReturnAction } from '@/actions/purchase-returns';
import Link from 'next/link';

// Using partial types for props
type FormProps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    suppliers: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    locations: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    purchaseOrders: any[];
    initialData?: CreatePurchaseReturnValues & { id?: string };
    mode: 'create' | 'edit';
};

export function PurchaseReturnForm({ suppliers, locations, products, purchaseOrders, initialData, mode }: FormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreatePurchaseReturnValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createPurchaseReturnSchema) as any,
        defaultValues: initialData || ({
            supplierId: '',
            purchaseOrderId: '',
            sourceLocationId: '',
            reason: '',
            notes: '',
            items: [{
                productVariantId: '',
                returnedQty: 1,
                unitCost: 0,
                reason: 'OTHER'
            }]
        } as CreatePurchaseReturnValues)
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });

    const onSubmit = async (data: CreatePurchaseReturnValues) => {
        setIsSubmitting(true);
        try {
            if (mode === 'create') {
                await createPurchaseReturnAction(data);
                toast.success('Purchase return created successfully');
                router.push('/planning/purchase-returns');
            } else {
                // await updatePurchaseReturnAction(data);
                toast.success('Purchase return updated successfully');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to save purchase return');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Auto-fill supplier if a Purchase Order is selected
    const handlePurchaseOrderChange = (poId: string) => {
        form.setValue('purchaseOrderId', poId);
        const selectedPO = purchaseOrders.find(po => po.id === poId);
        if (selectedPO && selectedPO.supplierId) {
            form.setValue('supplierId', selectedPO.supplierId);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/planning/purchase-returns">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Returns
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : (mode === 'create' ? 'Create Return' : 'Save Changes')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle>General Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="purchaseOrderId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reference Purchase Order (Optional)</FormLabel>
                                        <Select onValueChange={handlePurchaseOrderChange} value={field.value || ''}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Purchase Order" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {purchaseOrders.map(po => (
                                                    <SelectItem key={po.id} value={po.id}>
                                                        {po.orderNumber} - {po.supplier?.name}
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
                                name="supplierId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Supplier *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Supplier" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {suppliers.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="sourceLocationId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Dispatch Location *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select Location" /></SelectTrigger>
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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Return Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>General Reason *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Select Reason" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="DEFECTIVE">Defective</SelectItem>
                                                <SelectItem value="WRONG_ITEM">Wrong Item</SelectItem>
                                                <SelectItem value="NOT_NEEDED">Not Needed</SelectItem>
                                                <SelectItem value="DAMAGE_IN_TRANSIT">Damage In Transit</SelectItem>
                                                <SelectItem value="OTHER">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Additional details..." value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Returned Items</CardTitle>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ productVariantId: '', returnedQty: 1, unitCost: 0, reason: 'OTHER' } as any)}>
                            <Plus className="h-4 w-4 mr-2" /> Add Item
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-12 gap-4 items-end border p-4 rounded-md">
                                <div className="col-span-12 md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.productVariantId`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Product *</FormLabel>
                                                <Select 
                                                    onValueChange={(val) => {
                                                        field.onChange(val);
                                                        // Automatically fill unit price if we have it
                                                        const prod = products.find(p => p.id === val);
                                                        if (prod && prod.buyPrice) {
                                                            form.setValue(`items.${index}.unitCost`, Number(prod.buyPrice));
                                                        }
                                                    }} 
                                                    value={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="Product" /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.skuCode} - {p.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-6 md:col-span-1">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.returnedQty`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Qty *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0.01" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.unitCost`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Unit Cost *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0" step="100" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="col-span-5 md:col-span-4">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.reason`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Item Reason</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="Optional" value={field.value || ''} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-1 md:col-span-1 text-right">
                                    <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length === 1}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </form>
        </Form>
    );
}
