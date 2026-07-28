'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Truck, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { createEmergencyDispatch } from '@/actions/inventory/walk-in-dispatch';

type Customer = { id: string; name: string; code: string | null };
type Location = { id: string; name: string };
type ProductVariant = {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    sellPrice: number | null;
    price: number | null;
};

type Item = {
    productVariantId: string;
    quantity: string;
    isFreeItem: boolean;
};

export function MobileWalkInDispatchForm({
    customers,
    locations,
    productVariants,
}: {
    customers: Customer[];
    locations: Location[];
    productVariants: ProductVariant[];
}) {
    const router = useRouter();
    const [customerId, setCustomerId] = useState('');
    const [sourceLocationId, setSourceLocationId] = useState('');
    const [sourceReference, setSourceReference] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<Item[]>([
        { productVariantId: '', quantity: '', isFreeItem: false },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const addItem = () => {
        setItems([
            ...items,
            { productVariantId: '', quantity: '', isFreeItem: false },
        ]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (
        index: number,
        field: keyof Item,
        value: string | boolean,
    ) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const resolveDisplayPrice = (variantId: string): string => {
        const v = productVariants.find((p) => p.id === variantId);
        if (!v) return '-';
        const price = v.sellPrice ?? v.price;
        if (!price || price <= 0) return 'Belum ada harga';
        return `Rp ${Number(price).toLocaleString('id-ID')}`;
    };

    const hasPrice = (variantId: string): boolean => {
        const v = productVariants.find((p) => p.id === variantId);
        if (!v) return false;
        const price = v.sellPrice ?? v.price;
        return Number(price) > 0;
    };

    const canSubmit =
        customerId &&
        sourceLocationId &&
        sourceReference.trim() &&
        items.length > 0 &&
        items.every(
            (i) =>
                i.productVariantId &&
                Number(i.quantity) > 0 &&
                (i.isFreeItem || hasPrice(i.productVariantId)),
        );

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const idempotencyKey = `emergency-${customerId}-${sourceReference.trim()}-${Date.now()}`;
            const result = await createEmergencyDispatch({
                customerId,
                sourceLocationId,
                sourceReference: sourceReference.trim(),
                notes: notes.trim() || undefined,
                idempotencyKey,
                items: items.map((i) => ({
                    productVariantId: i.productVariantId,
                    quantity: Number(i.quantity),
                    isFreeItem: i.isFreeItem,
                })),
            });

            if (result) {
                if ('success' in result && !result.success) {
                    toast.error(
                        'error' in result ? String(result.error) : 'Gagal membuat pesanan',
                    );
                    return;
                }
                const data = 'data' in result ? result.data : result;
                const typed = data as unknown as {
                    salesOrder: { id: string; orderNumber: string };
                    deliveryOrder: { id: string } | null;
                    needsApproval: boolean;
                };
                if (typed.needsApproval) {
                    toast.success(
                        `SO ${typed.salesOrder.orderNumber} dibuat. Menunggu approval Sales.`,
                    );
                    router.push('/warehouse/mobile/outgoing');
                } else if (typed.deliveryOrder) {
                    toast.success(
                        `DO berhasil dibuat dari ${typed.salesOrder.orderNumber}`,
                    );
                    router.push(
                        `/warehouse/mobile/outgoing/${typed.deliveryOrder.id}`,
                    );
                } else {
                    toast.success(
                        `SO ${typed.salesOrder.orderNumber} dibuat. DO perlu dibuat ulang.`,
                    );
                    router.push('/warehouse/mobile/outgoing');
                }
                router.refresh();
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Gagal membuat pesanan dadakan',
            );
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const selectedCustomer = customers.find((c) => c.id === customerId);
    const selectedLocation = locations.find((l) => l.id === sourceLocationId);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold">
                        Muat Pesanan Dadakan
                    </h1>
                    <p className="text-xs text-muted-foreground">
                        SO + DO dibuat otomatis
                    </p>
                </div>
            </div>

            {/* Info banner */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                        <p className="font-medium">
                            Harga dari master customer/server. Stok dipotong saat
                            Tandai Dikirim.
                        </p>
                        <p>
                            Invoice DRAFT menunggu review Finance.
                        </p>
                    </div>
                </div>
            </div>

            {/* Customer */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Customer</label>
                <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border bg-background text-sm"
                >
                    <option value="">Pilih customer...</option>
                    {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                            {c.code ? ` (${c.code})` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Source reference */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">
                    Referensi (Telp/WA/Pickup)
                </label>
                <Input
                    value={sourceReference}
                    onChange={(e) => setSourceReference(e.target.value)}
                    placeholder="No. telp / WA / keterangan pickup"
                    className="h-11"
                />
            </div>

            {/* Source location */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Gudang Sumber</label>
                <select
                    value={sourceLocationId}
                    onChange={(e) => setSourceLocationId(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border bg-background text-sm"
                >
                    <option value="">Pilih gudang...</option>
                    {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Catatan (opsional)</label>
                <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan tambahan"
                    className="h-11"
                />
            </div>

            {/* Items */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">
                        Item ({items.length})
                    </h2>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={addItem}
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        Tambah
                    </Button>
                </div>

                {items.map((item, index) => {
                    const displayPrice = item.productVariantId
                        ? resolveDisplayPrice(item.productVariantId)
                        : '-';
                    const priceOk = item.isFreeItem || !item.productVariantId || hasPrice(item.productVariantId);

                    return (
                        <div
                            key={index}
                            className="p-3 border rounded-xl space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <select
                                    value={item.productVariantId}
                                    onChange={(e) =>
                                        updateItem(
                                            index,
                                            'productVariantId',
                                            e.target.value,
                                        )
                                    }
                                    className="flex-1 h-10 px-3 rounded-lg border bg-background text-sm"
                                >
                                    <option value="">Pilih barang...</option>
                                    {productVariants.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} ({v.skuCode})
                                        </option>
                                    ))}
                                </select>
                                {items.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-10 w-10 text-destructive"
                                        onClick={() => removeItem(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">
                                        Qty
                                    </label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={item.quantity}
                                        onChange={(e) =>
                                            updateItem(
                                                index,
                                                'quantity',
                                                e.target.value,
                                            )
                                        }
                                        placeholder="0"
                                        className="h-10 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">
                                        Harga
                                    </label>
                                    <p
                                        className={`h-10 flex items-center text-sm px-3 rounded-lg border ${
                                            priceOk
                                                ? 'bg-muted text-muted-foreground'
                                                : 'bg-destructive/10 text-destructive border-destructive'
                                        }`}
                                    >
                                        {displayPrice}
                                    </p>
                                </div>
                            </div>

                            {!priceOk && (
                                <p className="text-[10px] text-destructive">
                                    Harga tidak ditemukan. Hubungi Sales atau
                                    tandai sebagai free item.
                                </p>
                            )}

                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={item.isFreeItem}
                                    onChange={(e) =>
                                        updateItem(
                                            index,
                                            'isFreeItem',
                                            e.target.checked,
                                        )
                                    }
                                    className="rounded"
                                />
                                Free item (harga Rp 0)
                            </label>
                        </div>
                    );
                })}
            </div>

            {/* Submit */}
            <Button
                className="w-full h-12 text-base"
                disabled={!canSubmit || isSubmitting}
                onClick={() => setShowConfirm(true)}
            >
                <Truck className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Memproses...' : 'Buat Pesanan Dadakan'}
            </Button>

            {/* Confirmation dialog */}
            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Konfirmasi Pesanan Dadakan
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    <strong>Customer:</strong>{' '}
                                    {selectedCustomer?.name}
                                </p>
                                <p>
                                    <strong>Referensi:</strong>{' '}
                                    {sourceReference}
                                </p>
                                <p>
                                    <strong>Gudang:</strong>{' '}
                                    {selectedLocation?.name}
                                </p>
                                <div className="border-t pt-2 mt-2">
                                    <p className="font-medium mb-1">
                                        {items.length} item:
                                    </p>
                                    {items.map((item, i) => {
                                        const v = productVariants.find(
                                            (p) =>
                                                p.id ===
                                                item.productVariantId,
                                        );
                                        const price =
                                            item.isFreeItem
                                                ? 'FREE'
                                                : resolveDisplayPrice(
                                                      item.productVariantId,
                                                  );
                                        return (
                                            <p
                                                key={i}
                                                className="text-xs text-muted-foreground"
                                            >
                                                {v?.name} × {item.quantity} ={' '}
                                                {price}
                                            </p>
                                        );
                                    })}
                                </div>
                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                                    Stok baru dipotong saat Tandai Dikirim.
                                    Invoice menunggu Finance.
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Memproses...' : 'Ya, Buat'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
