'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
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
import { createWalkInGoodsReceipt } from '@/actions/purchasing/purchasing';

type Supplier = { id: string; name: string; code: string | null };
type Location = { id: string; name: string };
type ProductVariant = {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    standardCost: number | null;
};

type Item = {
    productVariantId: string;
    receivedQty: string;
    unitCost: string;
};

export function MobileWalkInReceiptForm({
    suppliers,
    locations,
    productVariants,
}: {
    suppliers: Supplier[];
    locations: Location[];
    productVariants: ProductVariant[];
}) {
    const router = useRouter();
    const [supplierId, setSupplierId] = useState('');
    const [supplierRefNo, setSupplierRefNo] = useState('');
    const [locationId, setLocationId] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<Item[]>([
        { productVariantId: '', receivedQty: '', unitCost: '' },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const idempotencyRef = useRef(crypto.randomUUID());

    const addItem = () => {
        setItems([
            ...items,
            { productVariantId: '', receivedQty: '', unitCost: '' },
        ]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (
        index: number,
        field: keyof Item,
        value: string,
    ) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };

        // Auto-fill cost from standardCost when product selected
        if (field === 'productVariantId' && value) {
            const variant = productVariants.find((v) => v.id === value);
            if (variant?.standardCost && Number(variant.standardCost) > 0) {
                updated[index].unitCost = String(variant.standardCost);
            }
        }

        setItems(updated);
    };

    const canSubmit =
        supplierId &&
        supplierRefNo.trim() &&
        locationId &&
        items.length > 0 &&
        items.every(
            (i) =>
                i.productVariantId &&
                Number(i.receivedQty) > 0 &&
                Number(i.unitCost) > 0,
        );

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const idempotencyKey = `walkin-${supplierId}-${supplierRefNo.trim()}-${idempotencyRef.current}`;
            const result = await createWalkInGoodsReceipt({
                supplierId,
                supplierRefNo: supplierRefNo.trim(),
                receivedDate: new Date(),
                locationId,
                notes: notes.trim() || undefined,
                idempotencyKey,
                items: items.map((i) => ({
                    productVariantId: i.productVariantId,
                    receivedQty: Number(i.receivedQty),
                    unitCost: Number(i.unitCost),
                })),
            });

            if (result) {
                toast.success('Penerimaan walk-in berhasil dicatat');
                router.push('/warehouse/mobile/incoming');
                router.refresh();
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Gagal mencatat penerimaan',
            );
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const selectedSupplier = suppliers.find((s) => s.id === supplierId);
    const selectedLocation = locations.find((l) => l.id === locationId);

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
                    <h1 className="text-xl font-bold">Terima dari Nota</h1>
                    <p className="text-xs text-muted-foreground">
                        PO akan dibuat otomatis
                    </p>
                </div>
            </div>

            {/* Info banner */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                        <p className="font-medium">Stok langsung bertambah. Hutang tercatat otomatis.</p>
                        <p>Invoice DRAFT menunggu review Finance sebelum bisa dibayar.</p>
                    </div>
                </div>
            </div>

            {/* Supplier */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Supplier</label>
                <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border bg-background text-sm"
                >
                    <option value="">Pilih supplier...</option>
                    {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                            {s.code ? ` (${s.code})` : ''}
                        </option>
                    ))}
                </select>
            </div>

            {/* Nota number */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">
                    No. Nota / Surat Jalan
                </label>
                <Input
                    value={supplierRefNo}
                    onChange={(e) => setSupplierRefNo(e.target.value)}
                    placeholder="Nomor nota dari supplier"
                    className="h-11"
                />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Lokasi Gudang</label>
                <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border bg-background text-sm"
                >
                    <option value="">Pilih lokasi...</option>
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
                    const variant = productVariants.find(
                        (v) => v.id === item.productVariantId,
                    );
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
                                        Qty ({variant?.primaryUnit || 'unit'})
                                    </label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={item.receivedQty}
                                        onChange={(e) =>
                                            updateItem(
                                                index,
                                                'receivedQty',
                                                e.target.value,
                                            )
                                        }
                                        placeholder="0"
                                        className="h-10 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">
                                        Harga/Unit (Rp)
                                    </label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={item.unitCost}
                                        onChange={(e) =>
                                            updateItem(
                                                index,
                                                'unitCost',
                                                e.target.value,
                                            )
                                        }
                                        placeholder="0"
                                        className="h-10 text-sm"
                                    />
                                </div>
                            </div>

                            {item.productVariantId &&
                                Number(item.unitCost) <= 0 && (
                                    <p className="text-[10px] text-destructive">
                                        Harga wajib lebih dari 0
                                    </p>
                                )}
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
                <Package className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Memproses...' : 'Catat Penerimaan'}
            </Button>

            {/* Confirmation dialog */}
            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Konfirmasi Penerimaan
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    <strong>Supplier:</strong>{' '}
                                    {selectedSupplier?.name}
                                </p>
                                <p>
                                    <strong>Nota:</strong> {supplierRefNo}
                                </p>
                                <p>
                                    <strong>Lokasi:</strong>{' '}
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
                                        return (
                                            <p
                                                key={i}
                                                className="text-xs text-muted-foreground"
                                            >
                                                {v?.name} ×{' '}
                                                {item.receivedQty} @ Rp{' '}
                                                {Number(
                                                    item.unitCost,
                                                ).toLocaleString('id-ID')}
                                            </p>
                                        );
                                    })}
                                </div>
                                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                                    Stok akan bertambah. Hutang tercatat. Invoice menunggu Finance.
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
                            {isSubmitting ? 'Memproses...' : 'Ya, Catat'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
