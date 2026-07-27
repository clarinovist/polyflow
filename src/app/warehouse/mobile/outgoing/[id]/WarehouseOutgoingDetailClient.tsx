'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    Play,
    CheckCircle,
    Send,
    Loader2,
    Lock,
    Copy,
    AlertTriangle,
} from 'lucide-react';
import {
    updateDeliveryStatus,
    saveDeliveryLoadVerification,
    confirmDeliveryLoadVerified,
    correctDeliveryQtyToVerified,
} from '@/actions/inventory/deliveries';
import { toast } from 'sonner';

type OrderItem = {
    id: string;
    quantity: number;
    verifiedQuantity?: number | null;
    productVariant?: {
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
};

type Order = {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: string;
    notes?: string;
    loadVerifiedAt?: string | null;
    sourceLocation?: { name: string };
    salesOrder?: {
        orderNumber: string;
        customer?: { name: string };
    };
    items: OrderItem[];
};

type LoadingAction = 'starting' | 'saving' | 'locking' | 'correcting' | 'shipping' | null;

function getItemStatus(
    draft: Record<string, string>,
    item: OrderItem,
): 'pending' | 'match' | 'mismatch' {
    const verified = draft[item.id];
    if (verified === '' || verified === undefined) return 'pending';
    const planned = Number(item.quantity);
    const physical = Number(verified);
    if (Math.abs(planned - physical) < 0.0001) return 'match';
    return 'mismatch';
}

export function WarehouseOutgoingDetailClient({ order }: { order: Order }) {
    const router = useRouter();
    const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
    const [shipConfirmOpen, setShipConfirmOpen] = useState(false);
    const [correctConfirmOpen, setCorrectConfirmOpen] = useState(false);
    const [verifyDraft, setVerifyDraft] = useState<Record<string, string>>(
        () => {
            const draft: Record<string, string> = {};
            for (const item of order.items) {
                draft[item.id] =
                    item.verifiedQuantity != null
                        ? String(item.verifiedQuantity)
                        : '';
            }
            return draft;
        },
    );

    const isPending = order.status === 'PENDING';
    const isLoading = order.status === 'LOADING';
    const isVerified = order.loadVerifiedAt != null;

    const allItemsVerified = order.items.every(
        (item) => verifyDraft[item.id] !== '' && verifyDraft[item.id] !== undefined,
    );
    const allItemsMatch = order.items.every((item) => {
        const verified = verifyDraft[item.id];
        if (verified === '' || verified === undefined) return false;
        const planned = Number(item.quantity);
        const physical = Number(verified);
        return Math.abs(planned - physical) < 0.0001;
    });
    const hasAnyMismatch = order.items.some(
        (item) => getItemStatus(verifyDraft, item) === 'mismatch',
    );

    const handleStartLoading = async () => {
        setLoadingAction('starting');
        try {
            const result = await updateDeliveryStatus(order.id, 'LOADING');
            if (result.success) {
                toast.success('Proses pemuatan barang dimulai.');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal memulai muat');
            }
        } catch {
            toast.error('Gagal memulai muat');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleMatchAll = () => {
        const draft: Record<string, string> = {};
        for (const item of order.items) {
            draft[item.id] = String(Number(item.quantity));
        }
        setVerifyDraft(draft);
    };

    const handleSave = async () => {
        const payload = Object.entries(verifyDraft)
            .filter(([, v]) => v !== '' && v !== undefined)
            .map(([id, v]) => ({
                id,
                verifiedQuantity: Number(v),
            }));

        if (payload.length === 0) {
            toast.error('Isi minimal satu qty verifikasi');
            return;
        }

        setLoadingAction('saving');
        try {
            const result = await saveDeliveryLoadVerification({
                deliveryOrderId: order.id,
                items: payload,
            });
            if (result.success) {
                toast.success('Verifikasi muat tersimpan.');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal menyimpan verifikasi');
            }
        } catch {
            toast.error('Gagal menyimpan verifikasi');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleLock = async () => {
        if (!allItemsMatch) {
            toast.error('Semua baris harus sesuai perintah sebelum dikunci');
            return;
        }

        setLoadingAction('locking');
        try {
            const payload = Object.entries(verifyDraft)
                .filter(([, v]) => v !== '' && v !== undefined)
                .map(([id, v]) => ({
                    id,
                    verifiedQuantity: Number(v),
                }));

            const saveResult = await saveDeliveryLoadVerification({
                deliveryOrderId: order.id,
                items: payload,
            });
            if (!saveResult.success) {
                toast.error(saveResult.error || 'Gagal menyimpan verifikasi');
                return;
            }

            const result = await confirmDeliveryLoadVerified(order.id);
            if (result.success) {
                toast.success('Verifikasi terkunci. Siap Tandai Dikirim.');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mengunci verifikasi');
            }
        } catch {
            toast.error('Gagal mengunci verifikasi');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleCorrectToPhysical = async () => {
        setCorrectConfirmOpen(false);
        setLoadingAction('correcting');
        try {
            const payload = Object.entries(verifyDraft)
                .filter(([, v]) => v !== '' && v !== undefined)
                .map(([id, v]) => ({
                    id,
                    verifiedQuantity: Number(v),
                }));

            if (payload.length === 0) {
                toast.error('Isi minimal satu qty verifikasi sebelum koreksi');
                setLoadingAction(null);
                return;
            }

            const saveResult = await saveDeliveryLoadVerification({
                deliveryOrderId: order.id,
                items: payload,
            });
            if (!saveResult.success) {
                toast.error(saveResult.error || 'Gagal menyimpan verifikasi');
                return;
            }

            const result = await correctDeliveryQtyToVerified(order.id);
            if (result.success) {
                toast.success(
                    'DO dikoreksi ke qty fisik & verifikasi terkunci. Siap Tandai Dikirim.',
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mengoreksi qty');
            }
        } catch {
            toast.error('Gagal mengoreksi qty');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleShip = async () => {
        setShipConfirmOpen(false);
        setLoadingAction('shipping');
        try {
            const result = await updateDeliveryStatus(order.id, 'SHIPPED');
            if (result.success) {
                toast.success('Barang berhasil dikirim. Stok gudang terpotong.');
                router.push('/warehouse/mobile/outgoing');
            } else {
                toast.error(result.error || 'Gagal menandai dikirim');
            }
        } catch {
            toast.error('Gagal menandai dikirim');
        } finally {
            setLoadingAction(null);
        }
    };

    const isLoadingAction = loadingAction !== null;

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                    disabled={isLoadingAction}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-bold truncate">
                            {order.orderNumber}
                        </h1>
                        <Badge
                            variant={isLoading ? 'default' : 'secondary'}
                            className="text-[10px] shrink-0"
                        >
                            {order.status}
                        </Badge>
                        {isVerified && (
                            <Badge
                                variant="secondary"
                                className="text-[10px] bg-green-100 text-green-800 shrink-0"
                            >
                                <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                Terverifikasi
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                        {order.salesOrder?.customer?.name || '—'}
                    </p>
                </div>
            </div>

            {/* Info */}
            <div className="p-3 border rounded-xl space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Gudang</span>
                    <span className="font-medium">
                        {order.sourceLocation?.name || '—'}
                    </span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Tanggal</span>
                    <span className="font-medium">
                        {new Date(order.deliveryDate).toLocaleDateString(
                            'id-ID',
                            {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                            },
                        )}
                    </span>
                </div>
                {order.notes && (
                    <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Catatan</span>
                        <span className="font-medium text-right max-w-[60%] truncate">
                            {order.notes}
                        </span>
                    </div>
                )}
            </div>

            {/* Items */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">
                        Barang ({order.items.length})
                    </h2>
                    {isLoading && !isVerified && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleMatchAll}
                            disabled={isLoadingAction}
                            className="h-7 text-xs"
                        >
                            <Copy className="h-3 w-3 mr-1" />
                            Samakan semua
                        </Button>
                    )}
                </div>
                {order.items.map((item) => {
                    const status = isLoading ? getItemStatus(verifyDraft, item) : null;
                    return (
                        <div
                            key={item.id}
                            className="p-3 border rounded-xl space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {item.productVariant?.name || '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {item.productVariant?.skuCode} •{' '}
                                        {item.productVariant?.primaryUnit}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-bold">
                                        {item.quantity}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        dipesan
                                    </p>
                                </div>
                            </div>

                            {/* Verify input (only when LOADING and not locked) */}
                            {isLoading && !isVerified && (
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-muted-foreground shrink-0">
                                        Verifikasi:
                                    </label>
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder={String(item.quantity)}
                                        value={verifyDraft[item.id] || ''}
                                        onChange={(e) =>
                                            setVerifyDraft((prev) => ({
                                                ...prev,
                                                [item.id]: e.target.value,
                                            }))
                                        }
                                        disabled={isLoadingAction}
                                        className="h-9 text-sm"
                                    />
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                        {item.productVariant?.primaryUnit}
                                    </span>
                                </div>
                            )}

                            {/* Status indicators */}
                            {isLoading && status === 'match' && (
                                <div className="flex items-center gap-1 text-xs text-emerald-600">
                                    <CheckCircle className="h-3 w-3" />
                                    Sesuai perintah
                                </div>
                            )}
                            {isLoading && status === 'mismatch' && (
                                <div className="flex items-center gap-1 text-xs text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />
                                    Selisih qty
                                </div>
                            )}
                            {isLoading && status === 'pending' && (
                                <div className="text-xs text-muted-foreground">
                                    Belum dicek
                                </div>
                            )}

                            {/* Verified qty display (when locked or shipped) */}
                            {!isLoading && item.verifiedQuantity != null && (
                                <div className="flex items-center gap-1 text-xs text-emerald-600">
                                    <CheckCircle className="h-3 w-3" />
                                    Diverifikasi: {item.verifiedQuantity}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2 sticky bottom-20 bg-background pb-2">
                {isPending && (
                    <Button
                        className="w-full h-12"
                        disabled={isLoadingAction}
                        onClick={handleStartLoading}
                    >
                        {loadingAction === 'starting' ? (
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                            <Play className="h-5 w-5 mr-2" />
                        )}
                        Mulai Muat
                    </Button>
                )}

                {isLoading && !isVerified && (
                    <>
                        <Button
                            variant="outline"
                            className="w-full h-11"
                            disabled={isLoadingAction || !allItemsVerified}
                            onClick={handleSave}
                        >
                            {loadingAction === 'saving' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            Simpan Verifikasi
                        </Button>

                        {hasAnyMismatch && (
                            <Button
                                variant="outline"
                                className="w-full h-11 border-amber-300 text-amber-700 hover:bg-amber-50"
                                disabled={
                                    isLoadingAction ||
                                    !allItemsVerified ||
                                    allItemsMatch
                                }
                                onClick={() => setCorrectConfirmOpen(true)}
                            >
                                {loadingAction === 'correcting' ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                )}
                                Koreksi Perintah ke Qty Fisik
                            </Button>
                        )}

                        <Button
                            className="w-full h-12 bg-green-600 hover:bg-green-700"
                            disabled={
                                isLoadingAction || !allItemsMatch
                            }
                            onClick={handleLock}
                        >
                            {loadingAction === 'locking' ? (
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            ) : (
                                <Lock className="h-5 w-5 mr-2" />
                            )}
                            Kunci Verifikasi
                        </Button>
                    </>
                )}

                {isLoading && isVerified && (
                    <Button
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                        disabled={isLoadingAction}
                        onClick={() => setShipConfirmOpen(true)}
                    >
                        {loadingAction === 'shipping' ? (
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                            <Send className="h-5 w-5 mr-2" />
                        )}
                        Tandai Dikirim
                    </Button>
                )}
            </div>

            {/* Quantity Correction Confirmation */}
            <AlertDialog open={correctConfirmOpen} onOpenChange={setCorrectConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Koreksi Kuantitas Surat Jalan?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Perubahan ini akan mengoreksi kuantitas barang pada Surat Jalan mengikuti hasil perhitungan fisik.
                            Stok out dan tagihan invoice akan menyesuaikan dengan kuantitas fisik terbaru ini.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoadingAction}>
                            Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCorrectToPhysical}
                            disabled={isLoadingAction}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {loadingAction === 'correcting' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 mr-2" />
                            )}
                            Ya, Koreksi & Kunci
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Ship Confirmation */}
            <AlertDialog open={shipConfirmOpen} onOpenChange={setShipConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Kirim Surat Jalan?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Stok gudang akan terpotong dan draft invoice akan
                            dibuat/diperbarui. Pastikan qty fisik sudah benar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoadingAction}>
                            Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleShip}
                            disabled={isLoadingAction}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {loadingAction === 'shipping' ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Send className="h-4 w-4 mr-2" />
                            )}
                            Ya, Kirim
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
