'use client';

import { useState, useTransition } from 'react';
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
import { ArrowLeft, Play, CheckCircle, Send, Loader2 } from 'lucide-react';
import { updateDeliveryStatus } from '@/actions/inventory/deliveries';
import { toast } from 'sonner';
import { shipDeliveryOrder } from '@/actions/inventory/delivery-shipment';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';
import {
    WarehouseAttachmentPanel,
    type AttachmentItem,
} from '@/components/warehouse/WarehouseAttachmentPanel';
import { LoadVerifyPanel } from '@/components/warehouse/outgoing/LoadVerifyPanel';
import { DeliveryLoadChangeDialog } from '@/components/warehouse/outgoing/DeliveryLoadChangeDialog';

export type WarehouseOutgoingOrder = {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: string;
    updatedAt?: string;
    notes?: string;
    loadVerifiedAt?: string | null;
    sourceLocation?: { name: string };
    salesOrder?: {
        orderNumber: string;
        customer?: { name: string };
        items?: {
            productVariantId: string;
            quantity: number;
            deliveredQty: number;
        }[];
    };
    items: {
        id: string;
        productVariantId?: string;
        quantity: number;
        verifiedQuantity?: number | null;
        enteredQuantity?: number | null;
        enteredUnit?: string | null;
        conversionFactorSnapshot?: number | null;
        productVariant?: {
            name: string;
            skuCode: string;
            primaryUnit: string;
            product?: { name: string };
        };
    }[];
};

export function WarehouseOutgoingDetailClient({
    order,
    attachments = [],
    canReviseOrder = false,
}: {
    order: WarehouseOutgoingOrder;
    attachments?: AttachmentItem[];
    canReviseOrder?: boolean;
}) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const router = useRouter();
    const [loadingAction, setLoadingAction] = useState<
        'starting' | 'shipping' | null
    >(null);
    const [refreshing, startRefresh] = useTransition();
    const [verificationBusy, setVerificationBusy] = useState(false);
    // Keep stale verified props from enabling shipment if the refresh is delayed/fails.
    // The page key remounts this client after the updated load arrives.
    const [loadChanged, setLoadChanged] = useState(false);
    const [shipConfirmOpen, setShipConfirmOpen] = useState(false);
    const [actualShipmentDate, setActualShipmentDate] = useState(() =>
        toBusinessDateString(new Date()),
    );
    const [loadDraft, setLoadDraft] = useState<Record<string, number> | null>(
        null,
    );
    const isPending = order.status === 'PENDING';
    const isLoading = order.status === 'LOADING';
    const isVerified = order.loadVerifiedAt != null;
    const canChangeLoad = isPending || isLoading;
    const isLoadingAction =
        loadingAction !== null || refreshing || verificationBusy || loadChanged;
    const refresh = () => startRefresh(() => router.refresh());

    const handleStartLoading = async () => {
        setLoadingAction('starting');
        try {
            const result = await updateDeliveryStatus(order.id, 'LOADING');
            if (result.success) {
                toast.success('Proses pemuatan barang dimulai.');
                refresh();
            } else {
                toast.error(result.error || 'Gagal memulai muat');
            }
        } catch {
            toast.error('Gagal memulai muat');
        } finally {
            setLoadingAction(null);
        }
    };

    const handleShip = async () => {
        setShipConfirmOpen(false);
        setLoadingAction('shipping');
        try {
            const result = await shipDeliveryOrder({
                deliveryOrderId: order.id,
                actualShipmentDate,
            });
            if (result.success) {
                if (result.data?.invoicePending)
                    toast.warning(
                        'Barang sudah dikirim, invoice belum tersinkron. Hubungi Finance; jangan kirim ulang.',
                    );
                toast.success(
                    'Barang berhasil dikirim. Stok gudang terpotong.',
                );
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

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Kembali"
                    onClick={() => router.back()}
                    disabled={isLoadingAction}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold break-words">
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
                    <p className="text-xs text-muted-foreground break-words">
                        {order.salesOrder?.customer?.name || '—'}
                    </p>
                </div>
            </div>
            <div className="p-3 border rounded-xl space-y-1">
                <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Gudang</span>
                    <span className="font-medium">
                        {order.sourceLocation?.name || '—'}
                    </span>
                </div>
                <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Tanggal</span>
                    <span className="font-medium">
                        {new Date(order.deliveryDate).toLocaleDateString(
                            'id-ID',
                            { day: 'numeric', month: 'long', year: 'numeric' },
                        )}
                    </span>
                </div>
                {order.notes && (
                    <div className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Catatan</span>
                        <span className="font-medium text-right max-w-[60%] break-words">
                            {order.notes}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                    Barang ({order.items.length})
                </h2>
                {canChangeLoad && (
                    <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={isLoadingAction}
                        onClick={() => setLoadDraft({})}
                    >
                        Ubah muatan
                    </Button>
                )}
            </div>
            {loadChanged ? (
                <div
                    role="status"
                    className="rounded-lg border p-3 space-y-2 text-sm"
                >
                    <p>
                        Muatan tersimpan. Muat ulang data sebelum verifikasi dan
                        pengiriman.
                    </p>
                    <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={refreshing}
                        onClick={refresh}
                    >
                        Muat ulang data
                    </Button>
                </div>
            ) : isLoading ? (
                <LoadVerifyPanel
                    deliveryOrderId={order.id}
                    items={order.items}
                    isVerified={isVerified}
                    canEdit={!isVerified}
                    disabled={
                        refreshing ||
                        loadingAction !== null ||
                        loadDraft !== null
                    }
                    onBusyChange={setVerificationBusy}
                    onChangeLoad={(counts) =>
                        setLoadDraft(
                            Object.fromEntries(
                                counts.map((item) => [item.id, item.quantity]),
                            ),
                        )
                    }
                />
            ) : (
                <div className="space-y-2">
                    {order.items.map((item) => (
                        <div
                            key={item.id}
                            className="p-3 border rounded-xl space-y-2"
                        >
                            <p className="text-sm font-medium break-words">
                                {item.productVariant?.name || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {item.productVariant?.skuCode}
                            </p>
                            <p className="text-sm font-bold">
                                {getEnteredQuantityDisplay({
                                    ...item,
                                    primaryUnit:
                                        item.productVariant?.primaryUnit,
                                })}
                            </p>
                            {item.verifiedQuantity != null && (
                                <p className="text-xs text-emerald-600">
                                    Diverifikasi: {item.verifiedQuantity}{' '}
                                    {item.productVariant?.primaryUnit || 'KG'}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {canChangeLoad && loadDraft !== null && (
                <DeliveryLoadChangeDialog
                    deliveryOrderId={order.id}
                    orderNumber={order.orderNumber}
                    items={order.items}
                    residualByVariant={Object.fromEntries(
                        (order.salesOrder?.items ?? []).map((item) => [
                            item.productVariantId,
                            Math.max(
                                0,
                                Number(item.quantity) -
                                    Number(item.deliveredQty),
                            ),
                        ]),
                    )}
                    initialQuantities={loadDraft}
                    canReviseOrder={canReviseOrder}
                    onClose={() => setLoadDraft(null)}
                    onSaved={() => {
                        setLoadChanged(true);
                        setLoadDraft(null);
                        toast.success(
                            'Muatan diperbarui. Verifikasi ulang sebelum dikirim.',
                        );
                        refresh();
                    }}
                />
            )}

            {(isLoading ||
                ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'].includes(
                    order.status,
                )) && (
                <>
                    <WarehouseAttachmentPanel
                        entityId={order.id}
                        entityLabel={order.orderNumber}
                        entityType="deliveryOrderId"
                        checkpoint="LOAD"
                        attachments={safeAttachments.filter(
                            (a) => a.checkpoint === 'LOAD',
                        )}
                        disabled={isLoadingAction || order.status === 'SHIPPED'}
                        onAttachmentChange={refresh}
                    />
                    <WarehouseAttachmentPanel
                        entityId={order.id}
                        entityLabel={order.orderNumber}
                        entityType="deliveryOrderId"
                        checkpoint="DAMAGE"
                        attachments={safeAttachments.filter(
                            (a) => a.checkpoint === 'DAMAGE',
                        )}
                        disabled={isLoadingAction || order.status === 'SHIPPED'}
                        onAttachmentChange={refresh}
                    />
                </>
            )}
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
                {isLoading && isVerified && !loadChanged && (
                    <Button
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                        disabled={isLoadingAction || loadDraft !== null}
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

            <AlertDialog
                open={shipConfirmOpen}
                onOpenChange={setShipConfirmOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Kirim Surat Jalan?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>
                                    Stok gudang akan terpotong dan draft invoice
                                    akan dibuat/diperbarui. Pastikan qty fisik
                                    sudah benar.
                                </p>
                                <label className="block space-y-1.5 text-left">
                                    <span className="text-sm font-medium text-foreground">
                                        Tanggal Penyerahan Aktual
                                    </span>
                                    <Input
                                        type="date"
                                        value={actualShipmentDate}
                                        max={toBusinessDateString(new Date())}
                                        onChange={(event) =>
                                            setActualShipmentDate(
                                                event.target.value,
                                            )
                                        }
                                        required
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        Dipakai untuk stok, invoice draft, dan
                                        jurnal.
                                    </span>
                                </label>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoadingAction}>
                            Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleShip}
                            disabled={isLoadingAction || !actualShipmentDate}
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
