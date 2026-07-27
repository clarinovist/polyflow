'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
    ArrowLeft,
    Loader2,
    CheckCircle,
    Package,
    Building2,
    AlertTriangle,
} from 'lucide-react';
import { createGoodsReceipt } from '@/actions/purchasing/purchasing';
import { toast } from 'sonner';

type OrderItem = {
    id: string;
    productVariantId: string;
    quantity: number;
    receivedQty: number;
    unitPrice: number;
    enteredUnit?: string;
    productVariant: {
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
};

type Order = {
    id: string;
    orderNumber: string;
    orderDate: string;
    expectedDate: string | null;
    supplier: { name: string };
    items: OrderItem[];
};

type Location = { id: string; name: string };

export function MobileReceiptClient({
    order,
    locations,
}: {
    order: Order;
    locations: Location[];
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [locationId, setLocationId] = useState(locations[0]?.id || '');
    const [notes, setNotes] = useState(`Penerimaan ${order.orderNumber}`);
    const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

    const selectedItemsPayload = order.items
        .map((item) => {
            const rawVal = (qtyDraft[item.id] || '0').replace(',', '.');
            const val = Number(rawVal);
            const received = isNaN(val) || !isFinite(val) ? 0 : val;
            if (received <= 0) return null;
            return {
                purchaseOrderItemId: item.id,
                productVariantId: item.productVariantId,
                receivedQty: received,
                unitCost: item.unitPrice,
                name: item.productVariant.name,
                pendingQty: Math.max(0, item.quantity - item.receivedQty),
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

    const hasOverReceipt = selectedItemsPayload.some(
        (item) => item.receivedQty > item.pendingQty,
    );

    const handleFillRemaining = (itemId: string, remaining: number) => {
        setQtyDraft((prev) => ({
            ...prev,
            [itemId]: String(remaining),
        }));
    };

    const handleFillAllRemaining = () => {
        const draft: Record<string, string> = {};
        for (const item of order.items) {
            const pending = Math.max(0, item.quantity - item.receivedQty);
            if (pending > 0) {
                draft[item.id] = String(pending);
            }
        }
        setQtyDraft(draft);
    };

    const handleOpenConfirm = () => {
        if (selectedItemsPayload.length === 0) {
            toast.error('Isi minimal satu qty terima');
            return;
        }

        if (!locationId) {
            toast.error('Pilih gudang tujuan');
            return;
        }

        setConfirmOpen(true);
    };

    const handleSubmit = async () => {
        setConfirmOpen(false);
        setLoading(true);
        try {
            const result = await createGoodsReceipt({
                purchaseOrderId: order.id,
                receivedDate: new Date(),
                locationId,
                notes,
                isMaklon: false,
                items: selectedItemsPayload.map((i) => ({
                    purchaseOrderItemId: i.purchaseOrderItemId,
                    productVariantId: i.productVariantId,
                    receivedQty: i.receivedQty,
                    unitCost: i.unitCost,
                })),
            });

            if (result.success) {
                toast.success('Penerimaan barang berhasil dicatat');
                router.push('/warehouse/mobile/incoming');
            } else {
                toast.error(result.error || 'Gagal mencatat penerimaan');
            }
        } catch {
            toast.error('Gagal mencatat penerimaan');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold truncate">
                        {order.orderNumber}
                    </h1>
                    <p className="text-xs text-muted-foreground truncate">
                        {order.supplier.name}
                    </p>
                </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Gudang Tujuan *
                </label>
                <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full h-11 px-3 border border-input rounded-lg bg-background text-sm"
                >
                    <option value="">Pilih gudang</option>
                    {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Items */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">
                        Barang ({order.items.length})
                    </h2>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary h-7 px-2"
                        onClick={handleFillAllRemaining}
                    >
                        Samakan Semua Sisa
                    </Button>
                </div>
                {order.items.map((item) => {
                    const pending = Math.max(
                        0,
                        item.quantity - item.receivedQty,
                    );

                    return (
                        <div
                            key={item.id}
                            className="p-3 border rounded-xl space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {item.productVariant.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {item.productVariant.skuCode} •{' '}
                                        {item.productVariant.primaryUnit}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-muted-foreground">
                                        Pesan: {item.quantity}
                                    </p>
                                    {item.receivedQty > 0 && (
                                        <p className="text-[10px] text-emerald-600">
                                            Sudah terima: {item.receivedQty}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {pending > 0 ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] text-muted-foreground shrink-0">
                                            Terima:
                                        </label>
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="any"
                                            placeholder={String(pending)}
                                            value={qtyDraft[item.id] || ''}
                                            onChange={(e) =>
                                                setQtyDraft((prev) => ({
                                                    ...prev,
                                                    [item.id]: e.target.value,
                                                }))
                                            }
                                            className="h-9 text-sm"
                                        />
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {item.productVariant.primaryUnit}
                                        </span>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px] px-2"
                                            onClick={() =>
                                                handleFillRemaining(
                                                    item.id,
                                                    pending,
                                                )
                                            }
                                        >
                                            Isi Sisa ({pending})
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 text-xs text-emerald-600">
                                    <CheckCircle className="h-3 w-3" />
                                    Lengkap
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Notes */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Catatan</label>
                <Input
                    placeholder="Catatan penerimaan..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-11"
                />
            </div>

            {/* Submit */}
            <Button
                className="w-full h-12"
                disabled={loading || !locationId || selectedItemsPayload.length === 0}
                onClick={handleOpenConfirm}
            >
                {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                    <Package className="h-5 w-5 mr-2" />
                )}
                {loading ? 'Menyimpan...' : 'Terima Barang'}
            </Button>

            {/* Review Summary Modal */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Konfirmasi Penerimaan Barang</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-xs text-foreground mt-2">
                                <p>
                                    Anda akan mencatat penerimaan barang dari{' '}
                                    <span className="font-semibold">{order.supplier.name}</span>{' '}
                                    ke gudang{' '}
                                    <span className="font-semibold">
                                        {locations.find((l) => l.id === locationId)?.name || 'Terpilih'}
                                    </span>.
                                </p>
                                {hasOverReceipt && (
                                    <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">Peringatan Over-Receipt</p>
                                            <p className="text-[11px] mt-0.5">
                                                Ada item dengan jumlah terima melebihi sisa PO. Stok & akuntansi akan disesuaikan dengan fisik yang diterima.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="border rounded-lg p-2.5 space-y-1 bg-muted/40 max-h-40 overflow-y-auto">
                                    <p className="font-semibold text-[11px] text-muted-foreground uppercase">
                                        Ringkasan Item ({selectedItemsPayload.length})
                                    </p>
                                    {selectedItemsPayload.map((i) => (
                                        <div
                                            key={i.purchaseOrderItemId}
                                            className="flex justify-between text-xs py-0.5 border-b last:border-0"
                                        >
                                            <span className="truncate pr-2">{i.name}</span>
                                            <span className="font-semibold shrink-0">
                                                {i.receivedQty} {i.receivedQty > i.pendingQty ? `(over +${i.receivedQty - i.pendingQty})` : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel disabled={loading}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={loading}
                            onClick={handleSubmit}
                            className="bg-primary"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Proses Penerimaan
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
