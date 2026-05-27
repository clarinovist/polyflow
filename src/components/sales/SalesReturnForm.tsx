'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSalesReturnSchema, CreateSalesReturnValues } from '@/lib/schemas/returns';
import { Button } from '@/components/ui/button';
import { salesLabels, formLabels, actionLabels } from '@/lib/labels';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createSalesReturnAction } from '@/actions/sales/sales-returns';
import Link from 'next/link';

// Using partial types for props
type FormProps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customers: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    locations: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    salesOrders: any[];
    initialData?: CreateSalesReturnValues & { id?: string };
    mode: 'create' | 'edit';
};

export function SalesReturnForm({ customers, locations, products, salesOrders, initialData, mode }: FormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreateSalesReturnValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createSalesReturnSchema) as any,
        defaultValues: initialData || ({
            customerId: '',
            salesOrderId: '',
            returnLocationId: '',
            reason: '',
            notes: '',
            items: [{
                productVariantId: '',
                returnedQty: 1,
                unitPrice: 0,
                condition: 'GOOD',
                reason: 'OTHER'
            }]
        } as CreateSalesReturnValues)
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items'
    });

    const onSubmit = async (data: CreateSalesReturnValues) => {
        setIsSubmitting(true);
        try {
            if (mode === 'create') {
                await createSalesReturnAction(data);
                toast.success('Sales return created successfully');
                router.push('/sales/returns');
            } else {
                // await updateSalesReturnAction(data);
                toast.success('Sales return updated successfully');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Failed to save sales return');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Auto-fill customer if a Sales Order is selected
    // Auto-fill customer if a Sales Order is selected
    const handleSalesOrderChange = (soId: string) => {
        form.setValue('salesOrderId', soId);
        const selectedSO = salesOrders.find(so => so.id === soId);
        if (selectedSO && selectedSO.customerId) {
            form.setValue('customerId', selectedSO.customerId);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="flex items-center justify-between">
                    <Button type="button" variant="ghost" asChild>
                        <Link href="/sales/returns">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Kembali ke Retur
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>{actionLabels.cancel}</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Menyimpan...' : (mode === 'create' ? `${actionLabels.create} Retur` : 'Simpan Perubahan')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle>Informasi Umum</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="salesOrderId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Referensi Sales Order (Opsional)</FormLabel>
                                        <Select onValueChange={handleSalesOrderChange} value={field.value || ''}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Sales Order" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {salesOrders.map(so => (
                                                    <SelectItem key={so.id} value={so.id}>
                                                        {so.orderNumber} - {so.customer?.name}
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
                                name="customerId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{salesLabels.customer} *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Customer" />
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
                                name="returnLocationId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{salesLabels.returnLocation} *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Pilih Lokasi" /></SelectTrigger>
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
                        <CardHeader><CardTitle>Detail Retur</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Alasan Umum *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder="Pilih Alasan" /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="DEFECTIVE">Cacat</SelectItem>
                                                <SelectItem value="WRONG_ITEM">Salah Barang</SelectItem>
                                                <SelectItem value="NOT_NEEDED">Tidak Dibutuhkan</SelectItem>
                                                <SelectItem value="DAMAGE_IN_TRANSIT">Rusak Dalam Perjalanan</SelectItem>
                                                <SelectItem value="OTHER">Lainnya</SelectItem>
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
                                        <FormLabel>{formLabels.notes}</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} placeholder="Detail tambahan..." value={field.value || ''} />
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
                        <CardTitle>Item yang Diretur</CardTitle>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ productVariantId: '', returnedQty: 1, unitPrice: 0, condition: 'GOOD', reason: 'OTHER' } as any)}>
                            <Plus className="h-4 w-4 mr-2" /> {actionLabels.add} Item
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-12 gap-4 items-end border p-4 rounded-md">
                                <div className="col-span-12 md:col-span-3">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.productVariantId`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{formLabels.product} *</FormLabel>
                                                <Select 
                                                    onValueChange={(val) => {
                                                        field.onChange(val);
                                                        // Automatically fill unit price if we have it
                                                        const prod = products.find(p => p.id === val);
                                                        if (prod && prod.sellPrice) {
                                                            form.setValue(`items.${index}.unitPrice`, Number(prod.sellPrice));
                                                        }
                                                    }} 
                                                    value={field.value || undefined}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="Produk" /></SelectTrigger>
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
                                <div className="col-span-6 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.returnedQty`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{formLabels.qty} *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0.01" step="0.01" className="no-stepper" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.unitPrice`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{formLabels.unitPrice} *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0" step="100" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.condition`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{salesLabels.condition} *</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="GOOD">Baik (Restock)</SelectItem>
                                                        <SelectItem value="DAMAGED">Rusak</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="col-span-5 md:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.reason`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Alasan Item</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder="Opsional" value={field.value || ''} />
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
