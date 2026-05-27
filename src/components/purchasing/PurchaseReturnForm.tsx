'use client';

import { useState } from 'react';
import { useForm, useFieldArray, type Resolver } from 'react-hook-form';
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
import { createPurchaseReturnAction } from '@/actions/purchasing/purchase-returns';
import Link from 'next/link';
import { purchasingLabels, actionLabels, formLabels } from '@/lib/labels';

// Using partial types for props
type SupplierOption = { id: string; name: string };
type LocationOption = { id: string; name: string };
type ProductOption = { id: string; name: string; skuCode: string; buyPrice?: number | null };
type PurchaseOrderOption = { id: string; orderNumber: string; supplierId: string; supplier?: { name: string } | null };

type FormProps = {
    suppliers: SupplierOption[];
    locations: LocationOption[];
    products: ProductOption[];
    purchaseOrders: PurchaseOrderOption[];
    initialData?: CreatePurchaseReturnValues & { id?: string };
    mode: 'create' | 'edit';
};

export function PurchaseReturnForm({ suppliers, locations, products, purchaseOrders, initialData, mode }: FormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<CreatePurchaseReturnValues>({
        resolver: zodResolver(createPurchaseReturnSchema) as Resolver<CreatePurchaseReturnValues>,
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
                toast.success('Retur Pembelian berhasil dibuat');
                router.push('/planning/purchase-returns');
            } else {
                // await updatePurchaseReturnAction(data);
                toast.success('Retur Pembelian berhasil diperbarui');
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
                            Kembali ke Retur
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>{actionLabels.cancel}</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Menyimpan...' : (mode === 'create' ? 'Buat Retur' : 'Simpan Perubahan')}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle>Informasi Umum</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="purchaseOrderId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Referensi Purchase Order (Opsional)</FormLabel>
                                        <Select onValueChange={handlePurchaseOrderChange} value={field.value || ''}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Purchase Order" />
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
                                        <FormLabel>{purchasingLabels.supplier} *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Supplier" />
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
                                        <FormLabel>Lokasi Pengiriman *</FormLabel>
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
                                                <SelectItem value="DEFECTIVE">Cacat / Rusak</SelectItem>
                                                <SelectItem value="WRONG_ITEM">Salah Barang</SelectItem>
                                                <SelectItem value="NOT_NEEDED">Tidak Dibutuhkan</SelectItem>
                                                <SelectItem value="DAMAGE_IN_TRANSIT">Rusak Selama Pengiriman</SelectItem>
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
                        <CardTitle>Item Diretur</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ productVariantId: '', returnedQty: 1, unitCost: 0, reason: 'OTHER' })}>
                            <Plus className="h-4 w-4 mr-2" /> Tambah Item
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
                                                <FormLabel>{formLabels.product} *</FormLabel>
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
                                                        <SelectTrigger><SelectValue placeholder="Pilih Produk" /></SelectTrigger>
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
                                        name={`items.${index}.unitCost`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Biaya Satuan *</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min="0" step="100" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="col-span-5 md:col-span-3">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.reason`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Alasan Per Item</FormLabel>
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
