'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    bulkAdjustStockSchema,
    BulkAdjustStockValues,
} from '@/lib/schemas/inventory';
import { adjustStockBulk } from '@/actions/inventory/inventory';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { warehouseComponentLabels } from '@/lib/labels';

// Reusing InventoryItem interface
interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
    location: {
        id: string;
        name: string;
    };
    availableQuantity?: number;
}

interface BulkAdjustDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: InventoryItem[];
    userId?: string;
}

export function BulkAdjustDialog({
    open,
    onOpenChange,
    items,
    userId,
}: BulkAdjustDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Global controls state
    const [globalType, setGlobalType] = useState<
        'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'
    >('ADJUSTMENT_OUT');
    const [globalReason, setGlobalReason] = useState('');

    const locationId = items.length > 0 ? items[0].locationId : '';
    const locationName = items.length > 0 ? items[0].location.name : '';
    const isRawMaterialLocation = locationName
        .toLowerCase()
        .includes('raw material');

    const form = useForm<BulkAdjustStockValues>({
        resolver: zodResolver(
            bulkAdjustStockSchema,
        ) as Resolver<BulkAdjustStockValues>,
        defaultValues: {
            locationId: locationId,
            items: items.map((item) => ({
                productVariantId: item.productVariantId,
                type: 'ADJUSTMENT_OUT',
                reason: '',
                quantity: 0,
                unitCost: undefined,
            })),
        },
    });

    const initializedContext = useRef<string | null>(null);
    const contextKey = JSON.stringify(
        items.map((item) => [item.id, item.locationId, item.productVariantId]),
    );
    // Settings changes and equivalent prop arrays must not discard a draft.
    useEffect(() => {
        if (!open) {
            initializedContext.current = null;
            return;
        }
        if (initializedContext.current !== contextKey) {
            initializedContext.current = contextKey;
            form.reset({
                locationId: locationId,
                items: items.map((item) => ({
                    productVariantId: item.productVariantId,
                    type: globalType,
                    reason: globalReason,
                    quantity: 0,
                    unitCost: undefined,
                })),
            });
        }
    }, [open, items, locationId, form, globalType, globalReason, contextKey]);

    // Update form values when global controls change
    const applyGlobalSettings = () => {
        const currentItems = form.getValues('items');
        const updatedItems = currentItems.map((item) => ({
            ...item,
            type: globalType,
            reason: globalReason,
        }));
        form.setValue('items', updatedItems);
        toast.success('Berhasil menerapkan pengaturan global ke semua baris');
    };

    async function onSubmit(data: BulkAdjustStockValues) {
        setIsSubmitting(true);
        try {
            // Apply global settings if individual rows are empty/default?
            // Actually, the form values are what we submit.
            // Ensure type and reason are set.
            const validItems = data.items.filter((i) => i.quantity > 0);

            if (validItems.length === 0) {
                toast.error('Masukkan jumlah untuk minimal satu item');
                setIsSubmitting(false);
                return;
            }

            // Ensure reason is filled
            if (validItems.some((i) => !i.reason || i.reason.length < 3)) {
                toast.error(
                    'Alasan wajib diisi (min 3 karakter) untuk semua item yang disesuaikan',
                );
                setIsSubmitting(false);
                return;
            }

            const payload = { ...data, items: validItems };
            const result = await adjustStockBulk(payload, userId);

            if (result.success) {
                toast.success(
                    `Berhasil menyesuaikan stok ${validItems.length} item`,
                );
                onOpenChange(false);
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch (_error) {
            toast.error('Hasil penyesuaian belum dapat dipastikan. Periksa mutasi sebelum mencoba lagi; draft tetap disimpan.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
                <DialogHeader>
                    <DialogTitle>
                        {warehouseComponentLabels.bulkAdjustTitle}
                    </DialogTitle>
                    <DialogDescription>
                        Koreksi saldo di <strong>{locationName}</strong>. Arah
                        global:{' '}
                        {globalType === 'ADJUSTMENT_IN'
                            ? 'penambahan (IN)'
                            : 'pengurangan (OUT)'}
                        . Periksa arah, jumlah dan alasan setiap baris sebelum
                        konfirmasi.
                    </DialogDescription>
                </DialogHeader>

                {/* Global Controls */}
                <div className="bg-muted p-4 rounded-md space-y-4 mb-4">
                    <h4 className="font-semibold text-sm">
                        Pengaturan semua baris
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="adjust-global-type">
                                Arah global
                            </Label>
                            <Select
                                value={globalType}
                                onValueChange={(
                                    val: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
                                ) => {
                                    setGlobalType(val);
                                }}
                            >
                                <SelectTrigger
                                    id="adjust-global-type"
                                    className="w-full min-w-0 min-h-11"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ADJUSTMENT_IN">
                                        IN · Tambah stok
                                    </SelectItem>
                                    <SelectItem value="ADJUSTMENT_OUT">
                                        OUT · Kurangi stok
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-2 min-w-0 space-y-2">
                            <Label htmlFor="adjust-global-reason">
                                Alasan global
                            </Label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input
                                    id="adjust-global-reason"
                                    placeholder={
                                        warehouseComponentLabels.eGDamage
                                    }
                                    value={globalReason}
                                    onChange={(e) =>
                                        setGlobalReason(e.target.value)
                                    }
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={applyGlobalSettings}
                                >
                                    Terapkan ke semua
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6 min-w-0"
                    >
                        {/* Items Table */}
                        <div
                            className="border rounded-md overflow-x-auto"
                            role="region"
                            aria-label="Baris penyesuaian"
                            tabIndex={0}
                        >
                            <div className="min-w-[760px]">
                                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                                    <div className="col-span-4">Produk</div>
                                    <div className="col-span-2 text-right">
                                        Stok Saat Ini
                                    </div>
                                    <div className="col-span-2">Tipe</div>
                                    <div className="col-span-1">Jumlah</div>
                                    {isRawMaterialLocation && (
                                        <div className="col-span-2">
                                            Biaya Per Unit
                                        </div>
                                    )}
                                    <div
                                        className={
                                            isRawMaterialLocation
                                                ? 'col-span-1'
                                                : 'col-span-3'
                                        }
                                    >
                                        Alasan
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                    {items.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className="grid grid-cols-12 gap-2 p-3 items-center border-b last:border-0 hover:bg-muted/20"
                                        >
                                            <div className="col-span-4">
                                                <div className="font-medium text-sm">
                                                    {item.productVariant.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {
                                                        item.productVariant
                                                            .skuCode
                                                    }
                                                </div>
                                            </div>
                                            <div className="col-span-2 text-right text-sm">
                                                {item.quantity}{' '}
                                                <span className="text-xs text-muted-foreground">
                                                    {
                                                        item.productVariant
                                                            .primaryUnit
                                                    }
                                                </span>
                                            </div>
                                            <div className="col-span-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.type`}
                                                    render={({ field }) => (
                                                        <Select
                                                            onValueChange={
                                                                field.onChange
                                                            }
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="ADJUSTMENT_IN">
                                                                    IN
                                                                </SelectItem>
                                                                <SelectItem value="ADJUSTMENT_OUT">
                                                                    OUT
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.quantity`}
                                                    render={({ field }) => (
                                                        <FormItem className="mb-0 space-y-0">
                                                            <FormControl>
                                                                <Input
                                                                    aria-label={`Jumlah ${item.productVariant.name}`}
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    className="h-8 text-right"
                                                                    {...field}
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        field.onChange(
                                                                            parseFloat(
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                            ) ||
                                                                                0,
                                                                        )
                                                                    }
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            {isRawMaterialLocation && (
                                                <div className="col-span-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`items.${index}.unitCost`}
                                                        render={({ field }) => {
                                                            const type =
                                                                form.watch(
                                                                    `items.${index}.type`,
                                                                );
                                                            const isOut =
                                                                type ===
                                                                'ADJUSTMENT_OUT';
                                                            return (
                                                                <FormItem className="mb-0 space-y-0">
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            className="h-8 text-right"
                                                                            placeholder={
                                                                                isOut
                                                                                    ? '-'
                                                                                    : 'Auto'
                                                                            }
                                                                            disabled={
                                                                                isOut
                                                                            }
                                                                            {...field}
                                                                            value={
                                                                                field.value ??
                                                                                ''
                                                                            }
                                                                            onChange={(
                                                                                e,
                                                                            ) =>
                                                                                field.onChange(
                                                                                    parseFloat(
                                                                                        e
                                                                                            .target
                                                                                            .value,
                                                                                    ) ||
                                                                                        undefined,
                                                                                )
                                                                            }
                                                                        />
                                                                    </FormControl>
                                                                </FormItem>
                                                            );
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div
                                                className={
                                                    isRawMaterialLocation
                                                        ? 'col-span-1'
                                                        : 'col-span-3'
                                                }
                                            >
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.reason`}
                                                    render={({ field }) => (
                                                        <FormItem className="mb-0 space-y-0">
                                                            <FormControl>
                                                                <Input
                                                                    className="h-8"
                                                                    aria-label={`Alasan ${item.productVariant.name}`}
                                                                    placeholder="Alasan (min. 3 karakter)"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Konfirmasi akan mengubah saldo sesuai arah IN/OUT
                            setiap baris. Jumlah memakai satuan utama barang;
                            saldo dan izin diperiksa ulang oleh server.
                        </p>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isSubmitting}
                            >
                                Batal
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Konfirmasi Penyesuaian
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
