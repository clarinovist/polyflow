'use client';

import type { DeliveryOrderDetailData } from './delivery-detail/types';
import { DeliveryItemsCard } from './delivery-detail/DeliveryItemsCard';
import { DeliveryRevisionDialog } from './DeliveryRevisionDialog';
import { DeliveryProgressTimeline } from './delivery-detail/DeliveryProgressTimeline';
import { DeliveryInformationCard } from './delivery-detail/DeliveryInformationCard';
import { DeliveryFleetCard } from './delivery-detail/DeliveryFleetCard';
import { DeliveryPhotosCard } from './delivery-detail/DeliveryPhotosCard';
import { DeliveryOperationalEvidenceCard } from './delivery-detail/DeliveryOperationalEvidenceCard';
import { DeliveryPrintPreview } from './delivery-detail/DeliveryPrintPreview';
import { DeliveryCommandActions } from './delivery-detail/DeliveryCommandActions';
import { DeliverySummaryGrid } from './delivery-detail/DeliverySummaryGrid';
import { DeliveryReadinessCard } from './delivery-detail/DeliveryReadinessCard';
import { DeliveryActivityTabs } from './delivery-detail/DeliveryActivityTabs';

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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Truck } from 'lucide-react';
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

    const handleReverseShipment = async (reason: string) => {
        if (reason.trim().length < 5) {
            toast.error('Alasan wajib diisi, minimal 5 karakter');
            return;
        }
        try {
            const result = await reverseDeliveryShipment({
                deliveryOrderId: order.id,
                reason,
            });
            if (result.success) {
                toast.success(
                    'Pengiriman dibatalkan — stok & invoice dikembalikan.',
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membatalkan pengiriman.');
            }
        } catch (_error) {
            toast.error('Gagal membatalkan pengiriman.');
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
        { status: 'PENDING', label: 'Pesanan Terkonfirmasi' },
        { status: 'LOADING', label: 'Sedang Dimuat' },
        { status: 'SHIPPED', label: 'Dikirim' },
        { status: 'IN_TRANSIT', label: 'Dalam Perjalanan' },
        { status: 'ARRIVED', label: 'Sampai Tujuan' },
        { status: 'DELIVERED', label: 'Diterima' },
    ];
    const showOperationalEvidence =
        safeAttachments.length > 0 ||
        [
            'PENDING',
            'LOADING',
            'SHIPPED',
            'IN_TRANSIT',
            'ARRIVED',
            'DELIVERED',
        ].includes(order.status);
    const stockStatusLabel = ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'].includes(
        order.status,
    )
        ? 'Stok: Sudah dipotong'
        : order.status === 'RETURNED'
          ? 'Stok: Periksa proses retur'
          : order.status === 'CANCELLED'
            ? 'Stok: Tidak dipotong'
            : 'Stok: Belum dipotong';

    const currentStatusIndex = statusSteps.findIndex(
        (s) => s.status === order.status,
    );

    return (
        <div className="space-y-6">
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
            <header className="space-y-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5 xl:sticky xl:top-4 xl:z-20">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-3">
                        <Button variant="outline" size="sm" asChild className="min-h-11">
                            <Link href={basePath}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                {actionLabels.back}
                            </Link>
                        </Button>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
                                    {salesLabels.deliveryOrder}{' '}
                                    {order.orderNumber}
                                </h1>
                                {getStatusBadge(order.status)}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline">
                                    {stockStatusLabel}
                                </Badge>
                                {isLoadVerified && (
                                    <Badge
                                        variant="outline"
                                        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                    >
                                        Muat terverifikasi
                                    </Badge>
                                )}
                                <span>
                                    Terkait dengan{' '}
                                    <Link
                                        href={
                                            warehouseMode
                                                ? `/warehouse/outgoing/orders/${order.salesOrderId}`
                                                : `/sales/orders/${order.salesOrderId}`
                                        }
                                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                        {order.salesOrder?.orderNumber}
                                    </Link>
                                </span>
                            </div>
                        </div>
                    </div>
                    <DeliveryCommandActions
                        order={order}
                        warehouseMode={warehouseMode}
                        nextStep={nextStep}
                        canShip={canShip}
                        canReverseShipment={canReverseShipment}
                        isLoading={isLoading}
                        invoices={invoices}
                        bundleHref={bundleHref}
                        setShowPreview={setShowPreview}
                        onStatusChange={handleStatusChange}
                        onReverseShipment={handleReverseShipment}
                    />
                </div>
            </header>

            {canEditQty && !warehouseMode && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
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

            {stockReadiness && stockReadiness.length > 0 && (
                <StockReadinessBanner lines={stockReadiness} compact />
            )}

            {(order.status === 'SHIPPED' || order.status === 'IN_TRANSIT') && (
                <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                    <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                        <Truck className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Pengiriman dalam Perjalanan</h2>
                        <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">
                            {order.carrier || 'Informasi kurir tersedia.'}
                            {order.trackingNumber && (
                                <> · No. Resi: <span className="font-mono font-bold">{order.trackingNumber}</span></>
                            )}
                        </p>
                    </div>
                </div>
            )}

            <DeliverySummaryGrid
                order={order}
                isLoadVerified={isLoadVerified}
            />

            <DeliveryProgressTimeline
                order={order}
                statusSteps={statusSteps}
                currentStatusIndex={currentStatusIndex}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
                <div className="min-w-0 space-y-6">
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
                </div>

                <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start xl:top-40">
                    <DeliveryReadinessCard
                        order={order}
                        isLoadVerified={isLoadVerified}
                        attachments={safeAttachments}
                    />
                    <DeliveryInformationCard order={order} />
                    <DeliveryFleetCard
                        order={order}
                        warehouseMode={warehouseMode}
                    />
                    {order.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{formLabels.notes}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="border-l-2 border-yellow-400 pl-3 text-sm italic dark:border-yellow-500">
                                    {order.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </aside>
            </div>

            <DeliveryActivityTabs
                hasEvidence={showLegacyPhotoCard || showOperationalEvidence}
                evidence={
                    <>
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
                        {showOperationalEvidence && (
                            <DeliveryOperationalEvidenceCard
                                order={order}
                                safeAttachments={safeAttachments}
                                router={router}
                            />
                        )}
                    </>
                }
                audit={
                    <EntityStatusTimeline
                        entityType="DeliveryOrder"
                        entityId={order.id}
                    />
                }
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
