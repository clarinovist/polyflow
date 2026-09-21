'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    bulkTransferStockSchema,
    BulkTransferStockValues,
} from '@/lib/schemas/inventory';
import { transferStockBulk } from '@/actions/inventory/inventory';
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
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getLocations } from '@/actions/inventory/locations';
import { warehouseComponentLabels } from '@/lib/labels';

// Type definition for the items passed to the dialog
interface InventoryItem {
    id: string;
    locationId: string;
    productVariantId: string;
    quantity: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string; // Changed from enum to string to avoid import issues or just string
    };
    location: {
        id: string;
        name: string;
    };
    availableQuantity?: number;
}

interface BulkTransferDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: InventoryItem[];
    userId?: string; // Optional for audit
}

export function BulkTransferDialog({
    open,
    onOpenChange,
    items,
    userId,
}: BulkTransferDialogProps) {
    const [locations, setLocations] = useState<{ id: string; name: string }[]>(
        [],
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [locationError, setLocationError] = useState(false);
    const [loadingLocations, setLoadingLocations] = useState(false);

    const sourceLocationId = items.length > 0 ? items[0].locationId : '';
    const sourceLocationName = items.length > 0 ? items[0].location.name : '';

    const form = useForm<BulkTransferStockValues>({
        resolver: zodResolver(
            bulkTransferStockSchema,
        ) as Resolver<BulkTransferStockValues>,
        defaultValues: {
            sourceLocationId: sourceLocationId,
            destinationLocationId: '',
            date: new Date(),
            notes: '',
            items: items.map((item) => ({
                productVariantId: item.productVariantId,
                quantity: 0,
            })),
        },
    });

    const initializedContext = useRef<string | null>(null);
    const contextKey = JSON.stringify(
        items.map((item) => [item.id, item.locationId, item.productVariantId]),
    );
    useEffect(() => {
        if (!open) {
            initializedContext.current = null;
            return;
        }
        if (initializedContext.current !== contextKey) {
            initializedContext.current = contextKey;
            form.reset({
                sourceLocationId: sourceLocationId,
                destinationLocationId: '',
                date: new Date(),
                notes: '',
                items: items.map((item) => ({
                    productVariantId: item.productVariantId,
                    quantity: 0,
                })),
            });
        }
    }, [open, items, sourceLocationId, form, contextKey]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingLocations(true);
        setLocationError(false);
        setLocations([]);
        getLocations()
            .then((res) => {
                if (cancelled) return;
                if (res.success) setLocations(res.data ?? []);
                else setLocationError(true);
            })
            .catch(() => {
                if (!cancelled) setLocationError(true);
            })
            .finally(() => {
                if (!cancelled) setLoadingLocations(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    async function onSubmit(data: BulkTransferStockValues) {
        setIsSubmitting(true);
        try {
            // Filter out items with 0 quantity
            const validItems = data.items.filter((i) => i.quantity > 0);

            if (validItems.length === 0) {
                toast.error('Masukkan jumlah transfer untuk minimal satu item');
                setIsSubmitting(false);
                return;
            }

            const payload = { ...data, items: validItems };
            const result = await transferStockBulk(payload, userId);

            if (result.success) {
                toast.success(`Berhasil mentransfer ${validItems.length} item`);
                onOpenChange(false);
            } else {
                toast.error(`Gagal: ${result.error}`);
            }
        } catch (_error) {
            toast.error('Hasil transfer belum dapat dipastikan. Periksa mutasi sebelum mencoba lagi; draft tetap disimpan.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
                <DialogHeader>
                    <DialogTitle>
                        {warehouseComponentLabels.bulkTransferTitle}
                    </DialogTitle>
                    <DialogDescription>
                        Pindahkan stok dari{' '}
                        <strong>{sourceLocationName}</strong> ke lokasi tujuan.
                        Periksa jumlah dalam satuan utama barang sebelum
                        konfirmasi.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6 min-w-0"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="destinationLocationId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lokasi Tujuan</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                            disabled={
                                                loadingLocations ||
                                                locationError
                                            }
                                        >
                                            <FormControl>
                                                <SelectTrigger className="w-full min-w-0 min-h-11">
                                                    <SelectValue
                                                        placeholder={
                                                            warehouseComponentLabels.selectDestination
                                                        }
                                                    />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {locations
                                                    .filter(
                                                        (l) =>
                                                            l.id !==
                                                            sourceLocationId,
                                                    )
                                                    .map((location) => (
                                                        <SelectItem
                                                            key={location.id}
                                                            value={location.id}
                                                        >
                                                            {location.name}
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
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Catatan / Referensi
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={
                                                    warehouseComponentLabels.eGShipment
                                                }
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {loadingLocations && (
                            <p role="status">Memuat lokasi…</p>
                        )}
                        {locationError && (
                            <p role="alert">
                                Gagal memuat lokasi. Tutup lalu buka kembali
                                dialog untuk mencoba lagi.
                            </p>
                        )}
                        {/* Items Table */}
                        <div
                            className="border rounded-md overflow-x-auto"
                            role="region"
                            aria-label="Baris transfer"
                            tabIndex={0}
                        >
                            <div className="min-w-[520px]">
                                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                                    <div className="col-span-6">Produk</div>
                                    <div className="col-span-2 text-right">
                                        Tersedia
                                    </div>
                                    <div className="col-span-4 text-right">
                                        Jumlah Transfer
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                    {items.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className="grid grid-cols-12 gap-2 p-3 items-center border-b last:border-0 hover:bg-muted/20"
                                        >
                                            <div className="col-span-6">
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
                                                {item.availableQuantity ??
                                                    item.quantity}{' '}
                                                <span className="text-xs text-muted-foreground">
                                                    {
                                                        item.productVariant
                                                            .primaryUnit
                                                    }
                                                </span>
                                            </div>
                                            <div className="col-span-4">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.quantity`}
                                                    render={({ field }) => (
                                                        <FormItem className="mb-0 space-y-0">
                                                            <FormControl>
                                                                <Input
                                                                    aria-label={`Jumlah transfer ${item.productVariant.name}`}
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    max={
                                                                        item.availableQuantity ??
                                                                        item.quantity
                                                                    }
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
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Konfirmasi memindahkan stok, bukan menambah stok
                            total. Ketersediaan dan izin tetap diperiksa ulang
                            oleh server.
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
                            <Button
                                type="submit"
                                disabled={
                                    isSubmitting ||
                                    loadingLocations ||
                                    locationError
                                }
                            >
                                {isSubmitting && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Konfirmasi Transfer
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
