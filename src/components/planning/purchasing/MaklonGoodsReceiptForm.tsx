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
import { purchasingLabels, formLabels } from '@/lib/labels';

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
            notes: 'Penerimaan material maklon',
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
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                    Penerimaan Material Maklon
                                </CardTitle>
                                <CardDescription>Daftarkan material yang disuplai oleh customer untuk produksi maklon.</CardDescription>
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
                                                            <FormLabel className="text-xs">Produk / Material</FormLabel>
                                                            <FormControl>
                                                                <ProductCombobox
                                                                    products={productVariants}
                                                                    value={field.value}
                                                                    onValueChange={field.onChange}
                                                                    placeholder="Pilih bahan baku..."
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
                                                            <FormLabel className="text-xs">{formLabels.qty}</FormLabel>
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
                                                            <FormLabel className="text-xs">Biaya Valuasi</FormLabel>
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
                                            <Plus className="h-4 w-4 mr-2" /> Tambah Material
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Informasi Tambahan</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs">{formLabels.notes}</FormLabel>
                                            <FormControl>
                                                <Textarea {...field} className="h-20" placeholder="Kondisi barang, deviasi, dll." />
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
                                <CardTitle className="text-sm">Detail Maklon</CardTitle>
                                <CardDescription>Pemetaan customer dan lokasi.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="customerId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold">Customer Maklon</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih customer..." />
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
                                            <FormLabel className="text-xs font-bold">{purchasingLabels.destinationWarehouse}</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih lokasi" />
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
                                            <FormLabel className="text-xs font-bold">{purchasingLabels.grDate}</FormLabel>
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

                                <div className="bg-muted/50 p-3 rounded-md border border-border flex gap-3 mt-4">
                                    <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="text-[11px] text-muted-foreground">
                                        Penerimaan Maklon tidak ditautkan ke Purchase Order. Biaya Valuasi digunakan untuk tujuan pelaporan saja, karena tidak ada invoice yang akan dibuat.
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || fields.length === 0}
                                    className="w-full h-11"
                                >
                                    {isLoading ? "Memproses..." : (
                                        <>
                                            <Package className="mr-2 h-4 w-4" />
                                            Simpan Penerimaan Maklon
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
