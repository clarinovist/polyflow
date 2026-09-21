'use client';

import {
    useForm,
    useFieldArray,
    useWatch,
    type SubmitHandler,
    type Resolver,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    bulkTransferStockSchema,
    BulkTransferStockValues,
} from '@/lib/schemas/inventory';
import { transferStockBulk } from '@/actions/inventory/inventory';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMemo, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowRight, Package, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProductCombobox } from '@/components/products/product-combobox';
import { warehouseLabels } from '@/lib/labels';

interface TransferFormProps {
    locations: { id: string; name: string }[];
    products: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit?: string;
    }[];
    inventory: {
        locationId: string;
        productVariantId: string;
        quantity: number;
    }[];
}

export function TransferForm({
    locations,
    products,
    inventory,
}: TransferFormProps) {
    const router = useRouter();

    const [newItem, setNewItem] = useState<{
        productVariantId: string;
        quantity: string;
    }>({
        productVariantId: '',
        quantity: '',
    });

    const form = useForm<BulkTransferStockValues>({
        resolver: zodResolver(
            bulkTransferStockSchema,
        ) as Resolver<BulkTransferStockValues>,
        defaultValues: {
            sourceLocationId: '',
            destinationLocationId: '',
            items: [],
            notes: '',
            date: new Date(),
        },
        mode: 'onChange',
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const sourceLocationId = useWatch({
        control: form.control,
        name: 'sourceLocationId',
    });
    const destinationLocationId = useWatch({
        control: form.control,
        name: 'destinationLocationId',
    });

    const availableProducts = useMemo(() => {
        if (!sourceLocationId) return [];
        return inventory
            .filter((i) => i.locationId === sourceLocationId && i.quantity > 0)
            .map((i) => {
                const product = products.find(
                    (p) => p.id === i.productVariantId,
                );
                return product ? { ...product, quantity: i.quantity } : null;
            })
            .filter(
                (p): p is (typeof products)[0] & { quantity: number } =>
                    p !== null,
            );
    }, [sourceLocationId, inventory, products]);

    useEffect(() => {
        if (
            sourceLocationId &&
            destinationLocationId &&
            sourceLocationId === destinationLocationId
        ) {
            form.setValue('destinationLocationId', '', {
                shouldValidate: true,
            });
            toast.error('Lokasi asal dan tujuan tidak boleh sama');
        }
    }, [sourceLocationId, destinationLocationId, form]);

    useEffect(() => {
        form.setValue('items', []);
        setNewItem({ productVariantId: '', quantity: '' });
    }, [sourceLocationId, form]);

    const handleAddItem = () => {
        if (!newItem.productVariantId || !newItem.quantity) {
            toast.error('Pilih produk dan masukkan jumlah.');
            return;
        }
        const qty = parseFloat(newItem.quantity);
        if (isNaN(qty) || qty <= 0) {
            toast.error('Masukkan jumlah positif yang valid.');
            return;
        }
        const selectedProduct = availableProducts.find(
            (p) => p.id === newItem.productVariantId,
        );
        if (!selectedProduct) {
            toast.error(
                'Produk yang dipilih tidak ditemukan atau tidak tersedia di lokasi asal.',
            );
            return;
        }
        if (qty > selectedProduct.quantity) {
            toast.error(
                `Stok tidak cukup. Maksimal tersedia: ${selectedProduct.quantity}`,
            );
            return;
        }
        const existingIndex = fields.findIndex(
            (f) => f.productVariantId === newItem.productVariantId,
        );
        if (existingIndex >= 0) {
            toast.error(
                'Produk sudah ada di daftar transfer. Hapus dulu untuk ubah jumlah.',
            );
            return;
        }
        append({ productVariantId: newItem.productVariantId, quantity: qty });
        setNewItem({ productVariantId: '', quantity: '' });
    };

    const onSubmit: SubmitHandler<BulkTransferStockValues> = async (data) => {
        try {
            const result = await transferStockBulk(data);
            if (result.success) {
                toast.success('Stok berhasil ditransfer');
                form.reset({
                    sourceLocationId: '',
                    destinationLocationId: '',
                    items: [],
                    notes: '',
                    date: new Date(),
                });
                setNewItem({ productVariantId: '', quantity: '' });
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mentransfer stok');
            }
        } catch {
            toast.error(
                'Hasil transfer belum dapat dipastikan. Periksa mutasi sebelum mencoba lagi. Draft tetap disimpan.',
            );
        }
    };

    const getProductDetails = (id: string) => {
        const p = products.find((prod) => prod.id === id);
        return p
            ? { name: p.name, sku: p.skuCode, unit: p.primaryUnit ?? '' }
            : { name: 'Produk', sku: '-', unit: '' };
    };

    const currentSelectedProductMax = useMemo(() => {
        if (!newItem.productVariantId) return 0;
        return (
            availableProducts.find((p) => p.id === newItem.productVariantId)
                ?.quantity || 0
        );
    }, [newItem.productVariantId, availableProducts]);

    const sourceName = locations.find((l) => l.id === sourceLocationId)?.name;
    const destName = locations.find(
        (l) => l.id === destinationLocationId,
    )?.name;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <fieldset
                    disabled={form.formState.isSubmitting}
                    className="min-w-0"
                >
                    <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
                        <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                            {/* LEFT COLUMN: INPUTS */}
                            <div className="flex flex-col h-full bg-card">
                                <div className="px-6 py-4 border-b border-border/50">
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <Package className="h-4 w-4 text-primary" />
                                        Siapkan Transfer
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Pilih rute lalu tambah ke daftar; stok
                                        belum berubah.
                                    </p>
                                </div>

                                <div className="p-3 sm:p-5 space-y-5 flex-1 min-w-0">
                                    {/* Transfer Route */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                                            <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center border border-border">
                                                1
                                            </span>
                                            Rute
                                        </h4>
                                        <div className="flex flex-col items-stretch gap-3">
                                            <FormField
                                                control={form.control}
                                                name="sourceLocationId"
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel className="sr-only">
                                                            Lokasi asal
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={(
                                                                value,
                                                            ) => {
                                                                if (
                                                                    value !==
                                                                        field.value &&
                                                                    (fields.length >
                                                                        0 ||
                                                                        newItem.productVariantId ||
                                                                        newItem.quantity) &&
                                                                    !window.confirm(
                                                                        'Ganti lokasi asal dan hapus daftar transfer yang belum disimpan?',
                                                                    )
                                                                )
                                                                    return;
                                                                field.onChange(
                                                                    value,
                                                                );
                                                            }}
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="h-11 w-full min-w-0 bg-background border-input">
                                                                    <SelectValue
                                                                        placeholder={
                                                                            warehouseLabels.sourceLocation +
                                                                            '...'
                                                                        }
                                                                    />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {locations.map(
                                                                    (loc) => (
                                                                        <SelectItem
                                                                            key={
                                                                                loc.id
                                                                            }
                                                                            value={
                                                                                loc.id
                                                                            }
                                                                        >
                                                                            {
                                                                                loc.name
                                                                            }
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50 rotate-90 self-center" />
                                            <FormField
                                                control={form.control}
                                                name="destinationLocationId"
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel className="sr-only">
                                                            Lokasi tujuan
                                                        </FormLabel>
                                                        <Select
                                                            onValueChange={
                                                                field.onChange
                                                            }
                                                            value={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className="h-11 w-full min-w-0 bg-background border-input">
                                                                    <SelectValue
                                                                        placeholder={
                                                                            warehouseLabels.destinationLocation +
                                                                            '...'
                                                                        }
                                                                    />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {locations.map(
                                                                    (loc) => (
                                                                        <SelectItem
                                                                            key={
                                                                                loc.id
                                                                            }
                                                                            value={
                                                                                loc.id
                                                                            }
                                                                            disabled={
                                                                                loc.id ===
                                                                                sourceLocationId
                                                                            }
                                                                        >
                                                                            {
                                                                                loc.name
                                                                            }
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Add To Manifest */}
                                    <div
                                        className={`space-y-4 transition-opacity ${!sourceLocationId ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
                                            <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center border border-border">
                                                2
                                            </span>
                                            Tambah produk
                                            {sourceLocationId && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-auto text-[10px] h-5 px-1.5 font-normal"
                                                >
                                                    {availableProducts.length}{' '}
                                                    produk
                                                </Badge>
                                            )}
                                        </h4>

                                        <div className="space-y-3">
                                            <FormItem>
                                                <ProductCombobox
                                                    products={availableProducts}
                                                    value={
                                                        newItem.productVariantId
                                                    }
                                                    onValueChange={(val) =>
                                                        setNewItem((prev) => ({
                                                            ...prev,
                                                            productVariantId:
                                                                val,
                                                        }))
                                                    }
                                                    disabled={!sourceLocationId}
                                                    placeholder="Cari produk..."
                                                    className="h-10"
                                                />
                                            </FormItem>

                                            <div className="flex flex-col gap-3">
                                                <FormItem className="flex-1">
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            min="0"
                                                            value={
                                                                newItem.quantity
                                                            }
                                                            onChange={(e) =>
                                                                setNewItem(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        quantity:
                                                                            e
                                                                                .target
                                                                                .value,
                                                                    }),
                                                                )
                                                            }
                                                            aria-label="Jumlah transfer"
                                                            placeholder="Jumlah"
                                                            className="h-10 bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            max={
                                                                currentSelectedProductMax
                                                            }
                                                        />
                                                        <span className="block mt-1 text-xs text-muted-foreground">
                                                            Max:{' '}
                                                            {
                                                                currentSelectedProductMax
                                                            }
                                                        </span>
                                                    </div>
                                                </FormItem>
                                                <Button
                                                    type="button"
                                                    onClick={handleAddItem}
                                                    disabled={
                                                        !sourceLocationId ||
                                                        !newItem.productVariantId ||
                                                        !newItem.quantity
                                                    }
                                                    className="h-10 px-4 font-semibold"
                                                >
                                                    <Plus className="h-4 w-4 mr-2" />
                                                    Tambah ke Daftar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: MANIFEST (Grey Background for Contrast) */}
                            <div className="flex flex-col h-full bg-muted/5">
                                <div className="px-6 py-4 border-b border-border/50 flex justify-between items-center bg-card/50">
                                    <div>
                                        <h3 className="font-semibold text-sm flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-primary" />
                                            Daftar Transfer
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Item yang akan ditransfer
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className="font-mono font-bold text-xs"
                                    >
                                        {fields.length}
                                    </Badge>
                                </div>

                                <div className="flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                    {/* Summary Banner */}
                                    {(sourceName || destName) && (
                                        <div className="px-6 py-3 bg-muted/20 border-b border-border/40">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">
                                                    {sourceName || '...'}
                                                </span>
                                                <ArrowRight className="h-3 w-3" />
                                                <span className="font-medium text-foreground">
                                                    {destName || '...'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Scrollable List */}
                                    <div className="flex-1 overflow-y-auto p-6 space-y-2">
                                        {fields.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border/40 rounded-lg p-6">
                                                <Package className="h-8 w-8 mb-2 opacity-20" />
                                                <p className="text-xs font-medium">
                                                    Daftar masih kosong
                                                </p>
                                            </div>
                                        ) : (
                                            fields.map((field, index) => {
                                                const details =
                                                    getProductDetails(
                                                        field.productVariantId,
                                                    );
                                                return (
                                                    <div
                                                        key={field.id}
                                                        className="flex items-center justify-between p-3 rounded-md bg-card border border-border/60 shadow-sm group"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs font-mono text-muted-foreground w-4">
                                                                {index + 1}.
                                                            </span>
                                                            <div>
                                                                <p className="text-sm font-medium text-foreground line-clamp-1">
                                                                    {
                                                                        details.name
                                                                    }
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                    {
                                                                        details.sku
                                                                    }
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-bold">
                                                                {field.quantity}{' '}
                                                                {details.unit}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                aria-label={`Hapus ${details.name}`}
                                                                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                                                                onClick={() =>
                                                                    remove(
                                                                        index,
                                                                    )
                                                                }
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Footer Area */}
                                    <div className="p-6 bg-card border-t border-border/50">
                                        <FormField
                                            control={form.control}
                                            name="notes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Textarea
                                                            {...field}
                                                            placeholder="Tambahkan catatan..."
                                                            aria-label="Catatan transfer"
                                                            className="resize-none h-20 text-sm bg-muted/20 min-h-0"
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />

                                        <p className="mt-3 text-sm text-muted-foreground">
                                            Konfirmasi memindahkan stok dari
                                            asal ke tujuan, bukan menambah stok
                                            total. Ketersediaan dan izin
                                            diperiksa ulang oleh server.
                                        </p>
                                        <Button
                                            type="submit"
                                            disabled={
                                                form.formState.isSubmitting ||
                                                fields.length === 0 ||
                                                !destinationLocationId
                                            }
                                            className="w-full mt-4"
                                        >
                                            {form.formState.isSubmitting
                                                ? 'Memproses...'
                                                : 'Konfirmasi Transfer'}
                                        </Button>

                                        {form.formState.errors.items && (
                                            <p className="text-destructive text-[10px] mt-2 text-center">
                                                {
                                                    form.formState.errors.items
                                                        .message
                                                }
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </fieldset>
            </form>
        </Form>
    );
}
