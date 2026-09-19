'use client';

import type { DeliveryOrderDetailData } from './delivery-detail/types';
import { DeliveryItemsCard } from './delivery-detail/DeliveryItemsCard';
import { DeliveryRevisionDialog } from './DeliveryRevisionDialog';
import { DeliveryProgressTimeline } from './delivery-detail/DeliveryProgressTimeline';
import { DeliveryInformationCard } from './delivery-detail/DeliveryInformationCard';
import { DeliveryFleetCard } from './delivery-detail/DeliveryFleetCard';
import { DeliveryPhotosCard } from './delivery-detail/DeliveryPhotosCard';
import { DeliveryOperationalEvidenceCard } from './delivery-detail/DeliveryOperationalEvidenceCard';
import { DeliveryPrintActions } from './delivery-detail/DeliveryPrintActions';
import { DeliveryPrintPreview } from './delivery-detail/DeliveryPrintPreview';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ArrowLeft,
    Truck,
    MapPin,
    CheckCircle2,
    Clock,
    Check,
    Package,
    CheckCircle,
    XCircle,
    RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { salesLabels, formLabels, actionLabels } from '@/lib/labels';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
    updateDeliveryStatus,
    fetchDeliveryStockReadiness,
    updateDeliveryItemQuantities,
    updateDeliveryItemNotes,
    reverseDeliveryShipment,
} from '@/actions/inventory/deliveries';
import {
    StockReadinessBanner,
    type StockReadinessLine,
} from '@/components/sales/StockReadinessBanner';
import { attachDeliveryPhoto } from '@/actions/sales/delivery-photos';
import {
    NEXT_STEP_LABELS,
    getDeliveryStatusLabel,
} from '@/lib/sales/delivery-status';
import { canAttachDeliveryPhoto } from '@/lib/sales/delivery-photo-policy';
import { LoadVerifyPanel } from '@/components/warehouse/outgoing/LoadVerifyPanel';
import { toast } from 'sonner';
import { type CompanyConfig } from '@/lib/config/company';
import { compressImageForUpload } from '@/lib/media/compress-image';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { Textarea } from '@/components/ui/textarea';
import type { AttachmentItem } from '@/components/warehouse/WarehouseAttachmentPanel';

export type { DeliveryOrderDetailData } from './delivery-detail/types';

interface DeliveryOrderDetailProps {
    order: DeliveryOrderDetailData;
    companyConfig?: CompanyConfig;
    basePath?: string;
    /** Hide sales-only pricing/retur chrome; keep load ops */
    warehouseMode?: boolean;
    /** Operational attachments (warehouse evidence) */
    attachments?: AttachmentItem[];
}

export function DeliveryOrderDetail({
    order,
    companyConfig,
    basePath = '/sales/deliveries',
    warehouseMode = false,
    attachments = [],
}: DeliveryOrderDetailProps) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    const [isLoading, setIsLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [uploadingVehicle, setUploadingVehicle] = useState(false);
    const [uploadingPOD, setUploadingPOD] = useState(false);
    const [receivedByName, setReceivedByName] = useState('');
    const [stockReadiness, setStockReadiness] = useState<
        StockReadinessLine[] | null
    >(null);
    const [editingQty, setEditingQty] = useState(false);
    const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
    const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
    const [savingQty, setSavingQty] = useState(false);
    const [qtyMismatchNotice, setQtyMismatchNotice] = useState<{
        requested: number;
        maxAllowed: number;
        soNumber: string;
    } | null>(null);
    const vehicleInputRef = useRef<HTMLInputElement>(null);
    const podInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Guard: items may be missing if caller passes a partial/wrapped payload
    const items = order.items ?? [];

    // Surat jalan prints first, invoice second — the gudang reads the SJ.
    const invoices = order.salesOrder?.invoices ?? [];
    const bundleHref = (invoiceId: string) =>
        `/api/print/bundle?doc=delivery:${order.id}&doc=invoice:${invoiceId}`;

    const canEditQty = order.status === 'PENDING' || order.status === 'LOADING';
    const isLoadVerified = !!order.loadVerifiedAt;
    const canShip = isLoadVerified;
    const hasPaidInvoice = invoices.some((inv) =>
        ['PAID', 'PARTIAL'].includes(inv.status ?? ''),
    );
    const canReverseShipment =
        order.status === 'SHIPPED' &&
        !order.proofOfDeliveryAt &&
        !hasPaidInvoice;
    const [reverseReason, setReverseReason] = useState('');
    const [isReversing, setIsReversing] = useState(false);

    const loadVersion = items
        .map((item) => `${item.id}:${item.quantity}:${item.verifiedQuantity}`)
        .join('|');
    // Load stock readiness when DO is PENDING or LOADING (via server action — no Prisma on client)
    useEffect(() => {
        if (order.status === 'PENDING' || order.status === 'LOADING') {
            fetchDeliveryStockReadiness(order.id)
                .then((res) => {
                    if (res.success && res.data) setStockReadiness(res.data);
                })
                .catch(() => {});
        }
    }, [order.id, order.status, loadVersion]);

    const startEditQty = () => {
        const qtyInit: Record<string, string> = {};
        const notesInit: Record<string, string> = {};
        for (const item of items) {
            qtyInit[item.id] = String(Number(item.quantity ?? 0));
            notesInit[item.id] = item.notes ?? '';
        }
        setQtyDraft(qtyInit);
        setNotesDraft(notesInit);
        setEditingQty(true);
    };

    const handleSaveQty = async () => {
        const items = Object.entries(qtyDraft).map(([id, q]) => ({
            id,
            quantity: Number(q),
        }));
        if (
            items.some(
                (i) =>
                    !i.quantity || i.quantity <= 0 || Number.isNaN(i.quantity),
            )
        ) {
            toast.error('Qty harus angka > 0');
            return;
        }
        setSavingQty(true);
        try {
            const result = await updateDeliveryItemQuantities({
                deliveryOrderId: order.id,
                items,
            });
            if (!result.success) {
                if (
                    result.code === 'DO_QTY_EXCEEDS_SO_RESIDUAL' &&
                    result.details
                ) {
                    setQtyMismatchNotice({
                        requested: Number(result.details.requested),
                        maxAllowed: Number(result.details.maxAllowed),
                        soNumber:
                            order.salesOrder?.orderNumber ?? order.orderNumber,
                    });
                } else {
                    toast.error(result.error || 'Gagal menyimpan qty');
                }
                return;
            }

            const notesResult = await updateDeliveryItemNotes({
                deliveryOrderId: order.id,
                items: Object.entries(notesDraft).map(([id, notes]) => ({
                    id,
                    notes,
                })),
            });
            if (!notesResult.success) {
                toast.error(notesResult.error || 'Gagal menyimpan Keterangan');
                return;
            }

            toast.success(salesLabels.sjQtyUpdated);
            setEditingQty(false);
            router.refresh();
        } catch {
            toast.error('Gagal menyimpan qty');
        } finally {
            setSavingQty(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        setIsLoading(true);
        try {
            const result = await updateDeliveryStatus(order.id, newStatus);
            if (result.success) {
                if (result.data?.invoicePending)
                    toast.warning(
                        'Barang sudah dikirim, tetapi invoice belum berhasil disinkronkan. Hubungi Finance untuk membuat/sinkronkan invoice; jangan kirim ulang.',
                    );
                toast.success(
                    `Status berhasil diubah ke ${getDeliveryStatusLabel(newStatus)}`,
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal memperbarui status.');
            }
        } catch (_error) {
            toast.error('Gagal memproses perubahan status.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReverseShipment = async () => {
        if (reverseReason.trim().length < 5) {
            toast.error('Alasan wajib diisi, minimal 5 karakter');
            return;
        }
        setIsReversing(true);
        try {
            const result = await reverseDeliveryShipment({
                deliveryOrderId: order.id,
                reason: reverseReason,
            });
            if (result.success) {
                toast.success(
                    'Pengiriman dibatalkan — stok & invoice dikembalikan.',
                );
                setReverseReason('');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membatalkan pengiriman.');
            }
        } catch (_error) {
            toast.error('Gagal membatalkan pengiriman.');
        } finally {
            setIsReversing(false);
        }
    };

    const nextStep = NEXT_STEP_LABELS[order.status];

    const canUploadVehicle = canAttachDeliveryPhoto(order.status, 'vehicle');
    const canUploadPOD = canAttachDeliveryPhoto(
        order.status,
        'proof_of_delivery',
    );

    /**
     * Legacy scalar photo fields (`vehiclePhotoUrl` / `proofOfDeliveryUrl`) predate
     * `WarehouseOperationalAttachment`. Tenants that only ever used the attachment
     * panel have them empty, so the legacy card rendered a permanent
     * "Belum ada foto" next to a panel that actually held the photos — readers
     * concluded the photos were missing. Show the legacy card only where it still
     * carries data (or can still receive an upload), never as an empty decoy.
     */
    const hasLegacyDeliveryPhotos = Boolean(
        order.vehiclePhotoUrl || order.proofOfDeliveryUrl,
    );
    const showLegacyPhotoCard =
        hasLegacyDeliveryPhotos || canUploadVehicle || canUploadPOD;

    const handlePhotoUpload = async (
        file: File,
        photoType: 'vehicle' | 'proof_of_delivery',
    ) => {
        const setUploading =
            photoType === 'vehicle' ? setUploadingVehicle : setUploadingPOD;
        setUploading(true);
        try {
            const compressed = await compressImageForUpload(file, {
                fileName: `delivery-${photoType}-${Date.now()}.jpg`,
            });

            // 1. Upload to R2
            const formData = new FormData();
            formData.append('file', compressed);
            formData.append('deliveryOrderId', order.id);
            formData.append('photoType', photoType);

            const uploadRes = await fetch('/api/upload/delivery-photo', {
                method: 'POST',
                body: formData,
            });
            let uploadData: {
                success?: boolean;
                url?: string;
                key?: string;
                error?: string;
            };
            try {
                uploadData = await uploadRes.json();
            } catch {
                toast.error(
                    `Upload gagal (HTTP ${uploadRes.status}). Cek koneksi / R2.`,
                );
                return;
            }

            if (!uploadRes.ok || !uploadData.success) {
                toast.error(
                    uploadData.error ||
                        `Gagal upload foto (HTTP ${uploadRes.status})`,
                );
                return;
            }

            // 2. Attach metadata
            const attachRes = await attachDeliveryPhoto({
                deliveryOrderId: order.id,
                photoType,
                publicUrl: uploadData.url || '',
                receivedBy:
                    photoType === 'proof_of_delivery'
                        ? receivedByName
                        : undefined,
            });

            if (attachRes.success) {
                toast.success(
                    photoType === 'vehicle'
                        ? 'Foto truk berhasil diupload'
                        : 'Bukti terima berhasil diupload',
                );
                if (photoType === 'proof_of_delivery') setReceivedByName('');
                router.refresh();
            } else {
                toast.error(attachRes.error || 'Gagal menyimpan foto.');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            toast.error(
                msg
                    ? `Gagal upload foto: ${msg}`
                    : 'Gagal upload foto. Cek koneksi.',
            );
        } finally {
            setUploading(false);
        }
    };
    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            PENDING:
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
            LOADING:
                'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
            SHIPPED:
                'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
            IN_TRANSIT:
                'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400',
            ARRIVED:
                'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-400',
            DELIVERED:
                'bg-green-100 text-green-800 dark:bg-emerald-900/20 dark:text-emerald-400',
            RETURNED:
                'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
            CANCELLED:
                'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-400',
        };
        return (
            <Badge
                variant="secondary"
                className={styles[status] || styles.PENDING}
            >
                {getDeliveryStatusLabel(status)}
            </Badge>
        );
    };

    const statusSteps = [
        { status: 'PENDING', icon: Clock, label: 'Pesanan Terkonfirmasi' },
        { status: 'LOADING', icon: Package, label: 'Sedang Dimuat' },
        { status: 'SHIPPED', icon: Truck, label: 'Dikirim' },
        { status: 'IN_TRANSIT', icon: MapPin, label: 'Dalam Perjalanan' },
        { status: 'ARRIVED', icon: CheckCircle, label: 'Sampai Tujuan' },
        { status: 'DELIVERED', icon: CheckCircle2, label: 'Diterima' },
    ];

    const currentStatusIndex = statusSteps.findIndex(
        (s) => s.status === order.status,
    );

    return (
        <div className="space-y-6">
            {canEditQty && !warehouseMode && (
                <div className="flex flex-wrap items-center gap-3">
                    <DeliveryRevisionDialog
                        deliveryOrderId={order.id}
                        onSaved={() => {
                            setEditingQty(false);
                            setStockReadiness(null);
                        }}
                    />
                    <p className="text-sm text-muted-foreground">
                        Jumlah atau barang berbeda? Revisi SO dan SJ bersama
                        sebelum verifikasi muatan.
                    </p>
                </div>
            )}
            {/* Qty exceeds SO residual — guided notification dialog */}
            <AlertDialog
                open={!!qtyMismatchNotice}
                onOpenChange={(open) => {
                    if (!open) setQtyMismatchNotice(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Qty melebihi sisa SO
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    Qty yang diminta{' '}
                                    <strong>
                                        {qtyMismatchNotice?.requested}
                                    </strong>{' '}
                                    melebihi sisa SO yang belum terkirim{' '}
                                    <strong>
                                        {qtyMismatchNotice?.maxAllowed}
                                    </strong>{' '}
                                    pada{' '}
                                    <strong>
                                        {qtyMismatchNotice?.soNumber}
                                    </strong>
                                    .
                                </p>
                                <p>
                                    {warehouseMode
                                        ? 'Hubungi sales untuk menggunakan Revisi muatan / barang di detail Surat Jalan.'
                                        : 'Gunakan Revisi muatan / barang di halaman ini agar SO dan Surat Jalan diperbarui bersama.'}
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Tutup</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Link
                                href={
                                    warehouseMode
                                        ? `/warehouse/outgoing/orders/${order.salesOrderId}`
                                        : `/sales/orders/${order.salesOrderId}`
                                }
                                onClick={() => setQtyMismatchNotice(null)}
                            >
                                {warehouseMode
                                    ? 'Lihat Sales Order'
                                    : 'Buka Sales Order'}
                            </Link>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href={basePath}>
                        <ArrowLeft className="mr-2 h-4 w-4" />{' '}
                        {actionLabels.back}
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {salesLabels.deliveryOrder} {order.orderNumber}
                    </h1>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {getStatusBadge(order.status)}
                        {isLoadVerified && canEditQty && (
                            <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-800"
                            >
                                Muat terverifikasi
                            </Badge>
                        )}
                        {nextStep && nextStep.to !== 'SHIPPED' && (
                            <Button
                                size="sm"
                                className="h-7 bg-green-600 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-2 text-xs"
                                onClick={() => handleStatusChange(nextStep.to)}
                                disabled={isLoading}
                            >
                                <Check className="mr-1 h-3.5 w-3.5" />{' '}
                                {nextStep.label}
                            </Button>
                        )}
                        {/* Tandai Dikirim — requires load verification + confirm dialog */}
                        {nextStep && nextStep.to === 'SHIPPED' && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="h-7 bg-green-600 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-2 text-xs"
                                        disabled={isLoading || !canShip}
                                        title={
                                            !canShip
                                                ? 'Kunci verifikasi muat dulu'
                                                : undefined
                                        }
                                    >
                                        <Check className="mr-1 h-3.5 w-3.5" />{' '}
                                        {salesLabels.tandaiDikirim}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            {salesLabels.tandaiDikirim}?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {salesLabels.tandaiDikirimConfirm}{' '}
                                            Invoice draft akan dibuat otomatis.
                                            {!canShip && (
                                                <span className="block mt-2 text-amber-700 dark:text-amber-300">
                                                    Verifikasi muat belum
                                                    dikunci — lengkapi panel
                                                    Verifikasi Muat dulu.
                                                </span>
                                            )}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Batal
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() =>
                                                handleStatusChange('SHIPPED')
                                            }
                                            className="bg-green-600 hover:bg-green-700"
                                            disabled={!canShip}
                                        >
                                            Ya, {salesLabels.tandaiDikirim}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        {/* Secondary: Cancel */}
                        {['PENDING', 'LOADING'].includes(order.status) && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                    >
                                        <XCircle className="mr-1 h-3.5 w-3.5" />{' '}
                                        Batalkan
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Batalkan Delivery Order?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            DO {order.orderNumber} akan
                                            dibatalkan. Tindakan ini tidak dapat
                                            diurungkan.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Batal
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() =>
                                                handleStatusChange('CANCELLED')
                                            }
                                            className="bg-red-600 hover:bg-red-700"
                                        >
                                            Ya, Batalkan
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        {/* Secondary: Return — hide in warehouse floor mode */}
                        {!warehouseMode &&
                            ['SHIPPED', 'IN_TRANSIT', 'ARRIVED'].includes(
                                order.status,
                            ) && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                                        >
                                            <RotateCcw className="mr-1 h-3.5 w-3.5" />{' '}
                                            Retur
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                Tandai sebagai Retur?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                DO {order.orderNumber} akan
                                                ditandai RETURNED. Pastikan
                                                barang sudah kembali.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>
                                                Batal
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() =>
                                                    handleStatusChange(
                                                        'RETURNED',
                                                    )
                                                }
                                                className="bg-orange-600 hover:bg-orange-700"
                                            >
                                                Ya, Tandai Retur
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        {/* Batalkan Pengiriman — reverse a SHIPPED DO: stock, invoice
                            & reservations flow back atomically. Blue, not red — this
                            is a valid correction, not an emergency (§4.2 plan). */}
                        {canReverseShipment && (
                            <AlertDialog
                                onOpenChange={(open) => {
                                    if (!open) setReverseReason('');
                                }}
                            >
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                    >
                                        <RotateCcw className="mr-1 h-3.5 w-3.5" />{' '}
                                        Batalkan Pengiriman
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Batalkan Pengiriman DO{' '}
                                            {order.orderNumber}?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription asChild>
                                            <div className="space-y-2">
                                                <p>
                                                    Stok akan dikembalikan ke{' '}
                                                    {order.sourceLocation
                                                        ?.name ?? 'lokasi asal'}
                                                    , invoice draft/belum
                                                    dibayar untuk SO{' '}
                                                    {
                                                        order.salesOrder
                                                            ?.orderNumber
                                                    }{' '}
                                                    akan dibatalkan, dan SO
                                                    kembali ke status siap
                                                    kirim. Tindakan ini tidak
                                                    dapat diurungkan.
                                                </p>
                                                <Textarea
                                                    placeholder="Alasan pembatalan (wajib, min. 5 karakter)"
                                                    value={reverseReason}
                                                    onChange={(e) =>
                                                        setReverseReason(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="text-sm"
                                                />
                                            </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Batal
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() =>
                                                handleReverseShipment()
                                            }
                                            className="bg-blue-600 hover:bg-blue-700"
                                            disabled={
                                                isReversing ||
                                                reverseReason.trim().length < 5
                                            }
                                        >
                                            Ya, Batalkan Pengiriman
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        <span className="text-muted-foreground text-sm">
                            Terkait dengan{' '}
                            <Link
                                href={
                                    warehouseMode
                                        ? `/warehouse/outgoing/orders/${order.salesOrderId}`
                                        : `/sales/orders/${order.salesOrderId}`
                                }
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                {order.salesOrder?.orderNumber}
                            </Link>
                        </span>
                        <DeliveryPrintActions
                            order={order}
                            invoices={invoices}
                            bundleHref={bundleHref}
                            setShowPreview={setShowPreview}
                        />
                    </div>
                </div>
            </div>

            {/* Status explainer */}
            {canEditQty && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                    <p className="font-medium">{salesLabels.sjDraft}</p>
                    <p className="text-xs mt-1 text-muted-foreground dark:text-amber-200/80">
                        {salesLabels.sjPendingBanner}
                    </p>
                </div>
            )}
            {order.status === 'SHIPPED' && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
                    <p className="font-medium">{salesLabels.sjShipped}</p>
                    <p className="text-xs mt-1 text-muted-foreground dark:text-emerald-200/80">
                        {salesLabels.sjShippedBanner}
                    </p>
                </div>
            )}

            {/* Stock Readiness Banner — soft warning for PENDING/LOADING DOs */}
            {stockReadiness && stockReadiness.length > 0 && (
                <StockReadinessBanner lines={stockReadiness} />
            )}

            {/* Tracking Banner — only while en route (not yet arrived) */}
            {(order.status === 'SHIPPED' || order.status === 'IN_TRANSIT') && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 rounded-lg flex items-start gap-4">
                    <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                        <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300">
                            Pengiriman dalam Perjalanan
                        </h3>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                            {order.carrier
                                ? `${order.carrier}`
                                : 'Informasi kurir tersedia.'}
                            {order.trackingNumber && (
                                <>
                                    {' '}
                                    No. Resi:{' '}
                                    <span className="font-mono font-bold">
                                        {order.trackingNumber}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <DeliveryItemsCard
                        items={items}
                        canEditQty={canEditQty}
                        editingQty={editingQty}
                        savingQty={savingQty}
                        qtyDraft={qtyDraft}
                        notesDraft={notesDraft}
                        setQtyDraft={setQtyDraft}
                        setNotesDraft={setNotesDraft}
                        setEditingQty={setEditingQty}
                        startEditQty={startEditQty}
                        handleSaveQty={handleSaveQty}
                    />

                    {canEditQty && (
                        <LoadVerifyPanel
                            key={loadVersion}
                            deliveryOrderId={order.id}
                            items={items.map((item) => ({
                                id: item.id,
                                quantity: item.quantity ?? 0,
                                verifiedQuantity: item.verifiedQuantity,
                                enteredQuantity: item.enteredQuantity,
                                enteredUnit: item.enteredUnit,
                                conversionFactorSnapshot:
                                    item.conversionFactorSnapshot,
                                productVariant: item.productVariant,
                            }))}
                            isVerified={isLoadVerified}
                            canEdit={!isLoadVerified}
                        />
                    )}

                    <DeliveryProgressTimeline
                        order={order}
                        statusSteps={statusSteps}
                        currentStatusIndex={currentStatusIndex}
                    />
                </div>

                <div className="space-y-6">
                    <DeliveryInformationCard order={order} />

                    {order.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{formLabels.notes}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm border-l-2 border-yellow-400 dark:border-yellow-500 pl-3 italic">
                                    {order.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Fleet & Pricing Card */}
                    <DeliveryFleetCard
                        order={order}
                        warehouseMode={warehouseMode}
                    />
                </div>
            </div>

            {/* Photos Section — legacy scalar fields, hidden when empty & unusable */}
            {showLegacyPhotoCard && (
                <DeliveryPhotosCard
                    order={order}
                    canUploadVehicle={canUploadVehicle}
                    canUploadPOD={canUploadPOD}
                    uploadingVehicle={uploadingVehicle}
                    uploadingPOD={uploadingPOD}
                    vehicleInputRef={vehicleInputRef}
                    podInputRef={podInputRef}
                    receivedByName={receivedByName}
                    setReceivedByName={setReceivedByName}
                    handlePhotoUpload={handlePhotoUpload}
                />
            )}

            {/* Bukti Operasional — the live evidence store (WarehouseOperationalAttachment) */}
            {(safeAttachments.length > 0 ||
                order.status === 'PENDING' ||
                order.status === 'LOADING' ||
                order.status === 'SHIPPED' ||
                order.status === 'IN_TRANSIT' ||
                order.status === 'ARRIVED' ||
                order.status === 'DELIVERED') && (
                <DeliveryOperationalEvidenceCard
                    order={order}
                    safeAttachments={safeAttachments}
                    router={router}
                />
            )}

            <EntityStatusTimeline
                entityType="DeliveryOrder"
                entityId={order.id}
            />

            <DeliveryPrintPreview
                order={order}
                companyConfig={companyConfig}
                showPreview={showPreview}
                setShowPreview={setShowPreview}
            />
        </div>
    );
}
