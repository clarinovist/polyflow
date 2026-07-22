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
import { Package, Download, Info, CheckCircle } from 'lucide-react';
import { purchasingLabels, formLabels } from '@/lib/labels';

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

/** Parse decimal string; accepts Indonesian comma (247,62) and period (247.62). */
function parseDecimalInput(raw: string): number {
    const num = Number((raw || '0').replace(',', '.'));
    return isNaN(num) ? 0 : num;
}

export function GoodsReceiptForm({
    purchaseOrderId,
    orderNumber,
    items,
    locations,
    defaultLocationId,
    basePath = '/purchasing/orders'
}: GoodsReceiptFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    // Keep raw string while typing so comma/dot decimal separators are not stripped.
    // Immediate Number() coercion turns "247," into 247 → next digits become 24762.
    const [rawQtyInputs, setRawQtyInputs] = useState<Record<number, string>>({});
    const [rawCostInputs, setRawCostInputs] = useState<Record<number, string>>({});

    // Allow over-receiving: PO qty treated as estimate, show all items
    const pendingItems = items;

    const form = useForm<CreateGoodsReceiptValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createGoodsReceiptSchema) as any,
        defaultValues: {
            purchaseOrderId,
            receivedDate: new Date(),
            locationId: defaultLocationId || '',
            notes: `Penerimaan untuk pesanan ${orderNumber}`,
            items: pendingItems.map(item => ({
                productVariantId: item.productVariantId,
                receivedQty: Math.max(0, item.orderedQty - item.receivedQty),
                unitCost: item.unitPrice
            }))
        }
    });

    const watchedQtys = form.watch('items');
    const hasOverReceipt = watchedQtys?.some((w, idx) => {
        const orig = pendingItems[idx];
        if (!orig) return false;
        return (orig.receivedQty + (w?.receivedQty || 0)) > orig.orderedQty;
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const onSubmit: SubmitHandler<CreateGoodsReceiptValues> = async (data) => {
        setIsLoading(true);
        try {
            const result = await createGoodsReceipt(data);
            if (!result.success) {
                toast.error(result.error || 'Gagal memproses penerimaan barang. Silakan coba lagi.');
                setIsLoading(false);
                return;
            }
            toast.success('Penerimaan Barang berhasil dicatat');
            const receiptId = result.data?.id as string | undefined;
            if (basePath.includes('/warehouse/incoming') && receiptId) {
                router.push(`${basePath}/${receiptId}`);
            } else {
                router.push(`${basePath}/${purchaseOrderId}`);
            }
            router.refresh();
        } catch (_error) {
            toast.error('Gagal memproses penerimaan barang. Silakan coba lagi.');
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
                                    Penerimaan Item
                                </CardTitle>
                                <CardDescription>Verifikasi kuantitas dan biaya untuk item yang diterima.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {fields.map((field, index) => {
                                        const originalItem = items.find(i => i.productVariantId === field.productVariantId);
                                        const currentQty = watchedQtys?.[index]?.receivedQty || 0;
                                        const wouldBeTotal = (originalItem?.receivedQty || 0) + currentQty;
                                        const isOver = originalItem ? wouldBeTotal > originalItem.orderedQty : false;
                                        return (
                                            <div key={field.id} className={`p-4 border rounded-lg grid grid-cols-1 md:grid-cols-4 gap-4 items-center ${isOver ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300' : 'bg-muted/30'}`}>
                                                <div className="md:col-span-2">
                                                    <p className="font-semibold text-sm">{originalItem?.productName}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{originalItem?.skuCode}</p>
                                                    <div className="mt-1 flex gap-2 flex-wrap">
                                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Dipesan: {originalItem?.orderedQty}</span>
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded">Diterima Sblm: {originalItem?.receivedQty}</span>
                                                        {isOver && <span className="text-[10px] bg-amber-200 text-amber-800 px-1 rounded font-bold">Over: {wouldBeTotal} &gt; {originalItem?.orderedQty}</span>}
                                                    </div>
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.receivedQty`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Qty Masuk</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    value={
                                                                        rawQtyInputs[index] !== undefined
                                                                            ? rawQtyInputs[index]
                                                                            : (field.value ?? '')
                                                                    }
                                                                    onChange={e => {
                                                                        const raw = e.target.value;
                                                                        setRawQtyInputs(prev => ({ ...prev, [index]: raw }));
                                                                        // Keep intermediate input like "247," / "247." visible
                                                                        const num = Number(raw.replace(',', '.'));
                                                                        if (!isNaN(num) && raw !== '' && raw !== ',' && raw !== '.') {
                                                                            field.onChange(num);
                                                                        }
                                                                    }}
                                                                    onBlur={e => {
                                                                        field.onChange(parseDecimalInput(e.target.value));
                                                                        setRawQtyInputs(prev => {
                                                                            const next = { ...prev };
                                                                            delete next[index];
                                                                            return next;
                                                                        });
                                                                    }}
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
                                                            <FormLabel className="text-xs">Biaya Satuan Aktual (Rp)</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    value={
                                                                        rawCostInputs[index] !== undefined
                                                                            ? rawCostInputs[index]
                                                                            : (field.value ?? '')
                                                                    }
                                                                    onChange={e => {
                                                                        const raw = e.target.value;
                                                                        setRawCostInputs(prev => ({ ...prev, [index]: raw }));
                                                                        const num = Number(raw.replace(',', '.'));
                                                                        if (!isNaN(num) && raw !== '' && raw !== ',' && raw !== '.') {
                                                                            field.onChange(num);
                                                                        }
                                                                    }}
                                                                    onBlur={e => {
                                                                        field.onChange(parseDecimalInput(e.target.value));
                                                                        setRawCostInputs(prev => {
                                                                            const next = { ...prev };
                                                                            delete next[index];
                                                                            return next;
                                                                        });
                                                                    }}
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
                                            Semua item telah diterima sepenuhnya.
                                        </div>
                                    )}
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
                                <CardTitle className="text-sm">Header Penerimaan</CardTitle>
                                <CardDescription>Informasi dasar untuk entri ini.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                                            <FormLabel className="text-xs font-bold">Tanggal Penerimaan</FormLabel>
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

                                {hasOverReceipt && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md border border-amber-300 dark:border-amber-700 flex gap-3">
                                        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div className="text-[11px] text-amber-800 dark:text-amber-200">
                                            <strong>Over receipt terdeteksi:</strong> qty diterima melebihi PO. PO diperlakukan sebagai perkiraan, penerimaan akan tetap disimpan & stok bertambah.
                                        </div>
                                    </div>
                                )}
                                <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-800 flex gap-3">
                                    <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="text-[11px] text-amber-800 dark:text-amber-200">
                                         Konfirmasi penerimaan ini akan memperbarui tingkat stok secara otomatis dan menghitung kembali <strong>Weighted Average Cost (WAC)</strong> untuk setiap item.
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || fields.length === 0}
                                    className="w-full bg-blue-600 hover:bg-blue-700 h-11"
                                >
                                    {isLoading ? "Memproses..." : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                             Simpan Penerimaan Barang
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
                                        <span className="text-xs uppercase tracking-wider">Checklist Verifikasi</span>
                                    </div>
                                    <ul className="text-xs space-y-2 text-muted-foreground">
                                        <li>• Kuantitas sesuai dengan hitungan fisik</li>
                                        <li>• Biaya satuan sesuai dengan invoice supplier</li>
                                        <li>• Kualitas batch dapat diterima</li>
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
