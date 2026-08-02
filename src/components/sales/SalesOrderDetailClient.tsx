'use client';

import { SalesOrderStatus, SalesLostReason } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    getStatusLabel,
    salesLabels,
    formLabels,
    actionLabels,
} from '@/lib/labels';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Edit,
    Truck,
    CheckCircle,
    XCircle,
    Package,
    Receipt,
    AlertTriangle,
    Repeat,
    MoreHorizontal,
    Send,
} from 'lucide-react';
import Link from 'next/link';
import {
    confirmSalesOrder,
    deliverSalesOrder,
    cancelSalesOrder,
    deleteSalesOrder,
    markReadyToShip,
    sendQuotationOrder,
    acceptQuotationOrder,
    rejectQuotationOrder,
    reopenQuotationOrder,
    updateFollowUpDateAction,
} from '@/actions/sales/sales';
import {
    approvePriceAction,
    rejectPriceAction,
} from '@/actions/sales/price-list';
import { createInvoice } from '@/actions/finance/invoice';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ProductionStatusCard } from './ProductionStatusCard';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { ShipmentDialog } from './ShipmentDialog';
import { CreateDeliveryOrderDialog } from './CreateDeliveryOrderDialog';
import { AddToScheduleDialog } from './AddToScheduleDialog';
import { isBillableDeliveryStatus } from '@/lib/sales/delivery-status';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    getEnteredQuantityDisplay,
    getEnteredUnitPriceDisplay,
} from '@/lib/utils/production-units';
import type { SalesOrderDetailClientProps } from './sales-order-types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CalendarClock } from 'lucide-react';
import {
    SALES_LOST_REASON_LABELS,
    SALES_LOST_REASON_OPTIONS,
} from '@/lib/sales/order-phase';

export function SalesOrderDetailClient({
    order,
    basePath = '/sales/orders',
    warehouseMode = false,
    currentUserRole,
    canPlan,
}: SalesOrderDetailClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
    const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [lostReasonValue, setLostReasonValue] = useState<string>('');
    const [lostReasonNotes, setLostReasonNotes] = useState<string>('');
    const [followUpDateInput, setFollowUpDateInput] = useState<string>(() => {
        const raw = (order as { nextFollowUpDate?: string | Date | null })
            .nextFollowUpDate;
        if (!raw) return '';
        try {
            const d = new Date(raw as string | Date);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        } catch {
            return '';
        }
    });
    const rawFollowUp = (order as { nextFollowUpDate?: string | Date | null })
        .nextFollowUpDate;
    const followUpDate: Date | null = rawFollowUp
        ? (() => {
              const d = new Date(rawFollowUp as string | Date);
              return isNaN(d.getTime()) ? null : d;
          })()
        : null;
    const isFollowUpOverdue = followUpDate
        ? followUpDate.getTime() <
          new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : false;
    const isLegacyInternalOrder = !order.customerId;
    const isMaklonOrder = order.orderType === 'MAKLON_JASA';
    const customerLabel = order.customer?.name || 'Legacy Internal Stock Build';
    const openDeliveryOrders = (order.deliveryOrders ?? []).filter(
        (d) => d.status === 'PENDING' || d.status === 'LOADING',
    );
    const primaryOpenDo =
        openDeliveryOrders.length === 1 ? openDeliveryOrders[0] : null;

    // MRP Simulation State

    const handleAction = async (
        action: string,
        handler: (
            id: string,
        ) => Promise<{ success: boolean; error?: string; data?: unknown }>,
        onSuccess?: (data: unknown) => void,
    ) => {
        setIsLoading(true);
        try {
            const result = await handler(order.id);
            if (result.success) {
                if (action === 'confirm' || action === 'confirmed') {
                    toast.success(
                        `SO ${order.orderNumber} dikonfirmasi. Siap diproses ke gudang.`,
                    );
                } else if (action === 'ready to ship') {
                    toast.success(
                        `Order ${order.orderNumber} selesai diproduksi. Siap dikirim.`,
                    );
                } else if (action === 'delivered') {
                    toast.success(
                        `Order ${order.orderNumber} telah diterima customer.`,
                    );
                } else if (action === 'cancelled') {
                    toast.success(`Order ${order.orderNumber} dibatalkan.`);
                } else {
                    const actionText =
                        action === 'approve'
                            ? 'disetujui'
                            : action === 'cancel' || action === 'cancelled'
                              ? 'dibatalkan'
                              : 'diproses';
                    toast.success(
                        `Pesanan ${order.orderNumber} berhasil ${actionText}.`,
                    );
                }
                if (onSuccess) {
                    onSuccess(result.data);
                }
                router.refresh();
            } else {
                toast.error(
                    result.error ||
                        'Gagal memproses tindakan pada pesanan. Silakan coba lagi.',
                );
            }
        } catch {
            toast.error('Gagal memproses pesanan. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateInvoice = async () => {
        if (isLegacyInternalOrder) {
            toast.error(
                'Invoice diblokir untuk Sales Order tanpa customer. Gunakan Perintah Produksi untuk pembuatan stok internal.',
            );
            return;
        }

        if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
            toast.error(
                'Pesanan harus dikirim atau terkirim untuk membuat invoice.',
            );
            return;
        }

        setIsLoading(true);
        try {
            const result = await createInvoice({
                salesOrderId: order.id,
                invoiceDate: new Date(),
                termOfPaymentDays: order.customer?.paymentTermDays ?? 30,
                notes: `Invoice for Order ${order.orderNumber}`,
            });

            if (result.success) {
                toast.success('Invoice berhasil dibuat');
                router.refresh();
            } else {
                toast.error(
                    result.error || 'Gagal membuat invoice. Silakan coba lagi.',
                );
            }
        } catch (_error) {
            toast.error('Gagal memproses pesanan. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        setIsLoading(true);
        try {
            const result = await deleteSalesOrder(order.id);
            if (result.success) {
                toast.success('Pesanan berhasil dihapus');
                router.push(basePath);
            } else {
                toast.error(
                    result.error ||
                        'Gagal menghapus pesanan. Silakan coba lagi.',
                );
            }
        } catch (_error) {
            toast.error('Gagal menghapus pesanan. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadge = (status: SalesOrderStatus) => {
        const styles: Record<string, string> = {
            QUOTATION:
                'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
            QUOTATION_SENT:
                'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
            QUOTATION_REJECTED:
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
            QUOTATION_EXPIRED:
                'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
            DRAFT: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            CONFIRMED:
                'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            IN_PRODUCTION:
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            READY_TO_SHIP:
                'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
            SHIPPED:
                'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            DELIVERED:
                'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
            CANCELLED:
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        };
        return (
            <Badge
                variant="secondary"
                className={styles[status] || styles.DRAFT}
            >
                {getStatusLabel(status, 'sales')}
            </Badge>
        );
    };

    // ── priceStatus badge helpers (mirroring commercialReviewStatus pattern) ──
    const priceStatus =
        (order as { priceStatus?: string | null }).priceStatus ?? null;

    const getPriceStatusBadge = (ps: string | null) => {
        if (!ps) return null;
        const labels: Record<string, string> = {
            PENDING: 'Harga belum final',
            PROVISIONAL: 'Harga sementara',
            FINAL: 'Harga final',
        };
        const styles: Record<string, string> = {
            PENDING:
                'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/30',
            PROVISIONAL:
                'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/30',
            FINAL: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/30',
        };
        const extraClass = ps === 'FINAL' ? '' : 'variant="outline" as const';
        void extraClass;
        if (ps === 'PENDING') {
            return (
                <Badge variant="outline" className={styles.PENDING}>
                    {labels.PENDING}
                </Badge>
            );
        }
        if (ps === 'PROVISIONAL') {
            return (
                <Badge variant="outline" className={styles.PROVISIONAL}>
                    {labels.PROVISIONAL}
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className={styles.FINAL}>
                {labels.FINAL}
            </Badge>
        );
    };

    const handleApprovePrice = async () => {
        setIsLoading(true);
        try {
            const result = await approvePriceAction({
                orderId: order.id,
            });
            if (result.success) {
                toast.success(
                    `Harga untuk ${order.orderNumber} disetujui → sementara`,
                );
                router.refresh();
            } else {
                toast.error(
                    result.error || 'Gagal menyetujui harga. Coba lagi.',
                );
            }
        } catch {
            toast.error('Gagal menyetujui harga. Coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRejectPrice = async () => {
        const reason = window.prompt('Alasan penolakan harga (wajib diisi):');
        if (!reason || !reason.trim()) {
            toast.error('Alasan penolakan wajib diisi.');
            return;
        }
        setIsLoading(true);
        try {
            const result = await rejectPriceAction({
                orderId: order.id,
                notes: reason.trim(),
            });
            if (result.success) {
                toast.success(`Harga untuk ${order.orderNumber} ditolak.`);
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal menolak harga. Coba lagi.');
            }
        } catch {
            toast.error('Gagal menolak harga. Coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {isLegacyInternalOrder && (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20">
                    <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                    <AlertTitle>{formLabels.legacyInternalOrder}</AlertTitle>
                    <AlertDescription>
                        {formLabels.legacyInternalOrderHint}
                    </AlertDescription>
                </Alert>
            )}

            {isMaklonOrder && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20">
                    <AlertTriangle className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    <AlertTitle>Alur Maklon Jasa</AlertTitle>
                    <AlertDescription>
                        Order ini menagihkan jasa, bukan mengirim stok fisik
                        dari sales order. Bahan titipan customer dikonsumsi saat
                        production execution dari lokasi produksi dulu, lalu
                        fallback ke lokasi customer-owned bila diperlukan.
                    </AlertDescription>
                </Alert>
            )}

            {/* Shipping path guidance — only for sellable orders */}
            {!isLegacyInternalOrder &&
                !isMaklonOrder &&
                !warehouseMode &&
                ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(
                    order.status,
                ) && (
                    <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800/50 dark:bg-blue-900/20">
                        <Truck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                        <AlertTitle>Alur Kirim</AlertTitle>
                        <AlertDescription className="text-sm">
                            Untuk rute harian multi-toko: pakai{' '}
                            <strong>Jadwal Kirim</strong>. Untuk 1 SO hot-load:{' '}
                            <strong>Buat Surat Jalan</strong>. Muat & tandai
                            dikirim dikerjakan di <strong>Portal Gudang</strong>
                            .
                        </AlertDescription>
                    </Alert>
                )}

            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={basePath}>
                            <ArrowLeft className="mr-2 h-4 w-4" />{' '}
                            {actionLabels.back}
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            Order {order.orderNumber}
                            {getStatusBadge(order.status)}
                            {order.entrySource === 'EMERGENCY_DISPATCH' && (
                                <Badge
                                    variant="outline"
                                    className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30"
                                >
                                    Pesanan Dadakan
                                </Badge>
                            )}
                            {order.commercialReviewStatus === 'PENDING' && (
                                <Badge
                                    variant="outline"
                                    className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800/30"
                                >
                                    Menunggu Review
                                </Badge>
                            )}
                            {order.commercialReviewStatus === 'REJECTED' && (
                                <Badge variant="destructive">Ditolak</Badge>
                            )}
                            {getPriceStatusBadge(priceStatus)}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {formLabels.createdOn}{' '}
                            {format(new Date(order.orderDate), 'PPP')}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {/* Button Place */}

                    {/* ── Quotation-phase actions ── */}
                    {order.status === 'QUOTATION' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => setIsFollowUpDialogOpen(true)}
                                disabled={isLoading}
                            >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Jadwalkan Follow-up
                            </Button>
                            <Button
                                onClick={() =>
                                    handleAction('dikirim', sendQuotationOrder)
                                }
                                disabled={isLoading}
                                className="bg-sky-600 hover:bg-sky-700 text-white"
                            >
                                <Send className="mr-2 h-4 w-4" /> Kirim
                                Penawaran
                            </Button>
                            <Button
                                onClick={() =>
                                    handleAction(
                                        'diterima → draft',
                                        acceptQuotationOrder,
                                    )
                                }
                                disabled={isLoading}
                            >
                                <CheckCircle className="mr-2 h-4 w-4" /> Terima
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => setIsRejectDialogOpen(true)}
                                disabled={isLoading}
                            >
                                Tolak
                            </Button>
                        </>
                    )}

                    {order.status === 'QUOTATION_SENT' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => setIsFollowUpDialogOpen(true)}
                                disabled={isLoading}
                            >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Jadwalkan Follow-up
                            </Button>
                            <Button
                                onClick={() =>
                                    handleAction(
                                        'diterima → draft',
                                        acceptQuotationOrder,
                                    )
                                }
                                disabled={isLoading}
                            >
                                <CheckCircle className="mr-2 h-4 w-4" /> Terima
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => setIsRejectDialogOpen(true)}
                                disabled={isLoading}
                            >
                                Tolak
                            </Button>
                        </>
                    )}

                    {order.status === 'QUOTATION_REJECTED' && (
                        <Button
                            variant="outline"
                            onClick={() =>
                                handleAction(
                                    'dibuka kembali',
                                    reopenQuotationOrder,
                                )
                            }
                            disabled={isLoading}
                        >
                            Buka Kembali
                        </Button>
                    )}

                    {order.status === 'QUOTATION_EXPIRED' && (
                        <Button
                            variant="outline"
                            onClick={() =>
                                handleAction(
                                    'dibuka kembali',
                                    reopenQuotationOrder,
                                )
                            }
                            disabled={isLoading}
                        >
                            Buka Kembali
                        </Button>
                    )}

                    {/* ── Price approval: PENDING → PROVISIONAL (ADMIN+MARKETING guard in action, UI shows to all but toast error if unauthorized) ── */}
                    {!warehouseMode && priceStatus === 'PENDING' && (
                        <>
                            <Button
                                onClick={handleApprovePrice}
                                disabled={isLoading}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <CheckCircle className="mr-2 h-4 w-4" /> Approve
                                Harga
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleRejectPrice}
                                disabled={isLoading}
                                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400"
                            >
                                <XCircle className="mr-2 h-4 w-4" /> Tolak Harga
                            </Button>
                        </>
                    )}

                    {/* ── Edit button: visible for QUOTATION*, DRAFT, CONFIRMED+, READY_TO_SHIP ── */}
                    {!warehouseMode &&
                        (order.status === 'QUOTATION' ||
                            order.status === 'QUOTATION_SENT' ||
                            order.status === 'DRAFT' ||
                            order.status === 'CONFIRMED' ||
                            order.status === 'IN_PRODUCTION' ||
                            order.status === 'READY_TO_SHIP') && (
                            <Button variant="outline" asChild>
                                <Link href={`${basePath}/${order.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />{' '}
                                    {actionLabels.edit}
                                </Link>
                            </Button>
                        )}

                    {!warehouseMode && order.status === 'DRAFT' && (
                        <>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="destructive"
                                        disabled={isLoading}
                                    >
                                        {actionLabels.delete}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Apakah Anda yakin?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Aksi ini tidak dapat dibatalkan. Ini
                                            akan menghapus draf order secara
                                            permanen.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            {actionLabels.cancel}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleDelete}
                                            className="bg-destructive hover:bg-destructive/90"
                                        >
                                            {actionLabels.delete}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <Button
                                onClick={() =>
                                    handleAction(
                                        'confirmed',
                                        confirmSalesOrder,
                                        (data) => {
                                            const result = data as
                                                | {
                                                      warnings?: {
                                                          message: string;
                                                      }[];
                                                  }
                                                | undefined;
                                            const warnings =
                                                result?.warnings ?? [];
                                            if (warnings.length > 0) {
                                                toast.warning(
                                                    warnings
                                                        .map((w) => w.message)
                                                        .join(' '),
                                                );
                                            }
                                        },
                                    )
                                }
                                disabled={isLoading || isLegacyInternalOrder}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <CheckCircle className="mr-2 h-4 w-4" />{' '}
                                Konfirmasi Order
                            </Button>
                        </>
                    )}

                    {order.status === 'IN_PRODUCTION' && (
                        <Button
                            onClick={() =>
                                handleAction('ready to ship', markReadyToShip)
                            }
                            disabled={isLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            <Package className="mr-2 h-4 w-4" />{' '}
                            {isMaklonOrder
                                ? 'Produksi Selesai / Siap Tutup Jasa'
                                : 'Produksi Selesai'}
                        </Button>
                    )}

                    {/* Buat SJ only if no open DO; otherwise point to existing SJ */}
                    {(order.status === 'CONFIRMED' ||
                        order.status === 'IN_PRODUCTION' ||
                        order.status === 'READY_TO_SHIP') &&
                        !isMaklonOrder &&
                        (primaryOpenDo ? (
                            <Button
                                variant="default"
                                className="shadow-sm"
                                asChild
                            >
                                <Link
                                    href={
                                        warehouseMode
                                            ? `/warehouse/outgoing/${primaryOpenDo.id}`
                                            : `/sales/deliveries/${primaryOpenDo.id}`
                                    }
                                >
                                    <Truck className="mr-2 h-4 w-4" />
                                    {salesLabels.viewOpenDo}
                                    {primaryOpenDo.orderNumber
                                        ? ` (${primaryOpenDo.orderNumber})`
                                        : ''}
                                </Link>
                            </Button>
                        ) : openDeliveryOrders.length > 1 ? (
                            <Button
                                variant="outline"
                                className="shadow-sm"
                                asChild
                            >
                                <Link
                                    href={
                                        warehouseMode
                                            ? '/warehouse/outgoing'
                                            : '/sales/deliveries'
                                    }
                                >
                                    <Truck className="mr-2 h-4 w-4" />
                                    {salesLabels.openDoExists} (
                                    {openDeliveryOrders.length})
                                </Link>
                            </Button>
                        ) : (
                            !warehouseMode && (
                                <>
                                    <CreateDeliveryOrderDialog
                                        defaultSalesOrderId={order.id}
                                    />
                                    <AddToScheduleDialog
                                        salesOrderId={order.id}
                                    />
                                </>
                            )
                        ))}

                    {/* Quick ship: demoted to dropdown "Lainnya" */}
                    {!warehouseMode &&
                        (order.status === 'CONFIRMED' ||
                            order.status === 'READY_TO_SHIP' ||
                            (order.status === 'IN_PRODUCTION' &&
                                !!primaryOpenDo)) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        disabled={
                                            isLoading ||
                                            openDeliveryOrders.length > 1
                                        }
                                        title={
                                            openDeliveryOrders.length > 1
                                                ? salesLabels.selectDoToShip
                                                : undefined
                                        }
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onClick={() =>
                                            setIsShipDialogOpen(true)
                                        }
                                    >
                                        <Truck className="mr-2 h-4 w-4" />
                                        {isMaklonOrder
                                            ? 'Tutup Order Jasa'
                                            : primaryOpenDo
                                              ? `Kirim SJ cepat (${primaryOpenDo.orderNumber ?? 'SJ'}) — lanjutan`
                                              : 'Buat SJ + Kirim Cepat (lanjutan)'}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                    {(order.status === 'SHIPPED' ||
                        order.status === 'DELIVERED') && (
                        <>
                            {order.status === 'SHIPPED' && (
                                <Button
                                    onClick={() =>
                                        handleAction(
                                            'delivered',
                                            deliverSalesOrder,
                                        )
                                    }
                                    disabled={isLoading}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Package className="mr-2 h-4 w-4" />{' '}
                                    {isMaklonOrder
                                        ? 'Tandai Jasa Selesai'
                                        : 'Tandai Terkirim'}
                                </Button>
                            )}

                            {!warehouseMode && order.invoices.length === 0 && (
                                <Button
                                    onClick={handleGenerateInvoice}
                                    disabled={
                                        isLoading || isLegacyInternalOrder
                                    }
                                    className="bg-sky-600 hover:bg-sky-700 text-white"
                                >
                                    <Receipt className="mr-2 h-4 w-4" /> Buat
                                    Invoice
                                </Button>
                            )}
                            {!warehouseMode &&
                                order.invoices.length > 0 &&
                                order.invoices.some(
                                    (i) => i.status === 'DRAFT',
                                ) && (
                                    <Button
                                        variant="outline"
                                        className="border-sky-600 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30"
                                        asChild
                                    >
                                        <Link
                                            href={`/finance/invoices/sales/${order.invoices.find((i) => i.status === 'DRAFT')?.id}`}
                                        >
                                            <Receipt className="mr-2 h-4 w-4" />{' '}
                                            Lihat Draf Invoice
                                        </Link>
                                    </Button>
                                )}
                        </>
                    )}

                    {!warehouseMode &&
                        [
                            'DRAFT',
                            'CONFIRMED',
                            'IN_PRODUCTION',
                            'READY_TO_SHIP',
                        ].includes(order.status) && (
                            <Button
                                variant="ghost"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-500 dark:hover:bg-red-900/30"
                                onClick={() =>
                                    handleAction('cancelled', cancelSalesOrder)
                                }
                                disabled={isLoading}
                            >
                                <XCircle className="mr-2 h-4 w-4" />{' '}
                                {actionLabels.cancel}
                            </Button>
                        )}

                    {/* Quick Reorder: show for DELIVERED orders with a customer */}
                    {!warehouseMode &&
                        order.status === 'DELIVERED' &&
                        order.customerId && (
                            <Button variant="outline" asChild>
                                <Link
                                    href={`/sales/orders/create?reorder=${order.id}`}
                                >
                                    <Repeat className="mr-2 h-4 w-4" /> Pesan
                                    Ulang
                                </Link>
                            </Button>
                        )}
                </div>
            </div>

            {/* Active delivery orders — always visible on SO detail */}
            {openDeliveryOrders.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            {salesLabels.activeSuratJalan}
                        </CardTitle>
                        <CardDescription>
                            {salesLabels.sjPendingBanner}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {openDeliveryOrders.map((d) => (
                            <div
                                key={d.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <p className="font-semibold text-sm">
                                        {d.orderNumber ?? d.id.slice(0, 8)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Status: {d.status}
                                        {' · '}
                                        stok belum dipotong
                                    </p>
                                </div>
                                <Button size="sm" variant="outline" asChild>
                                    <Link
                                        href={
                                            warehouseMode
                                                ? `/warehouse/outgoing/${d.id}`
                                                : `/sales/deliveries/${d.id}`
                                        }
                                    >
                                        Buka / ubah qty
                                    </Link>
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Order Info */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Detail Pesanan</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    {salesLabels.customer}
                                </h3>
                                <p className="text-lg">{customerLabel}</p>
                                <p className="text-sm text-muted-foreground">
                                    {order.customer?.email ||
                                        (isLegacyInternalOrder
                                            ? 'No customer assigned'
                                            : 'No email')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {order.customer?.phone || ''}
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    {isMaklonOrder
                                        ? 'Lokasi Produksi'
                                        : salesLabels.sourceWarehouse}
                                </h3>
                                <p className="text-lg">
                                    {order.sourceLocation?.name || 'N/A'}
                                </p>
                                {isMaklonOrder && (
                                    <p className="text-sm text-muted-foreground">
                                        Dipakai sebagai lokasi produksi/default
                                        consumption location untuk work order
                                        maklon.
                                    </p>
                                )}
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    {salesLabels.expectedDate}
                                </h3>
                                <p>
                                    {order.expectedDate
                                        ? format(
                                              new Date(order.expectedDate),
                                              'PPP',
                                          )
                                        : '-'}
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    {salesLabels.orderType}
                                </h3>
                                <Badge variant="outline">
                                    {order.orderType.replace(/_/g, ' ')}
                                </Badge>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    Follow-up
                                </h3>
                                {followUpDate ? (
                                    <div className="flex items-center gap-2">
                                        <p
                                            className={
                                                isFollowUpOverdue
                                                    ? 'text-destructive font-medium'
                                                    : ''
                                            }
                                        >
                                            {format(followUpDate, 'PPP')}
                                        </p>
                                        {isFollowUpOverdue && (
                                            <Badge variant="destructive">
                                                Terlambat
                                            </Badge>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Belum dijadwalkan
                                    </p>
                                )}
                            </div>

                            {(order as { lostReason?: string | null })
                                .lostReason &&
                                order.status === 'QUOTATION_REJECTED' && (
                                    <div>
                                        <h3 className="font-semibold text-sm text-muted-foreground">
                                            Alasan Kalah
                                        </h3>
                                        <p className="font-medium">
                                            {(() => {
                                                const lr = (
                                                    order as {
                                                        lostReason?:
                                                            | string
                                                            | null;
                                                    }
                                                ).lostReason as string;
                                                return (
                                                    SALES_LOST_REASON_LABELS[
                                                        lr
                                                    ] ?? lr
                                                );
                                            })()}
                                        </p>
                                        {(
                                            order as {
                                                lostReasonNotes?: string | null;
                                            }
                                        ).lostReasonNotes && (
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                                                {
                                                    (
                                                        order as {
                                                            lostReasonNotes?:
                                                                | string
                                                                | null;
                                                        }
                                                    ).lostReasonNotes
                                                }
                                            </p>
                                        )}
                                    </div>
                                )}
                        </div>

                        {order.notes && (
                            <div className="bg-muted/50 p-4 rounded-md">
                                <h3 className="font-semibold text-sm mb-1">
                                    {formLabels.notes}
                                </h3>
                                <p className="text-sm whitespace-pre-wrap">
                                    {order.notes}
                                </p>
                            </div>
                        )}

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-10 px-4 text-left font-medium">
                                            {formLabels.product}
                                        </th>
                                        <th className="h-10 px-4 text-right font-medium">
                                            {formLabels.qty}
                                        </th>
                                        <th className="h-10 px-4 text-right font-medium">
                                            Terkirim
                                        </th>
                                        {!warehouseMode && (
                                            <th className="h-10 px-4 text-right font-medium">
                                                {formLabels.unitPrice}
                                            </th>
                                        )}
                                        {!warehouseMode &&
                                            order.items.some(
                                                (item) =>
                                                    Number(
                                                        item.taxPercent || 0,
                                                    ) > 0 ||
                                                    Number(
                                                        item.taxAmount || 0,
                                                    ) > 0,
                                            ) && (
                                                <th className="h-10 px-4 text-right font-medium">
                                                    DPP
                                                </th>
                                            )}
                                        {!warehouseMode && (
                                            <th className="h-10 px-4 text-right font-medium">
                                                {formLabels.subtotal}
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {order.items.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-muted/50"
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-medium">
                                                        {
                                                            item.productVariant
                                                                .product.name
                                                        }
                                                    </div>
                                                    {(item.isFreeItem ||
                                                        Number(
                                                            item.unitPrice,
                                                        ) === 0) && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] px-1.5 h-4 font-normal bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                                        >
                                                            Sampel / Gratis
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.productVariant.name} -{' '}
                                                    {
                                                        item.productVariant
                                                            .skuCode
                                                    }
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                {getEnteredQuantityDisplay({
                                                    ...item,
                                                    ...item.productVariant,
                                                })}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span
                                                    className={
                                                        Number(
                                                            item.deliveredQty,
                                                        ) > 0
                                                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                                            : 'text-muted-foreground'
                                                    }
                                                >
                                                    {getEnteredQuantityDisplay({
                                                        ...item,
                                                        ...item.productVariant,
                                                        quantity:
                                                            item.deliveredQty,
                                                        enteredQuantity:
                                                            item.enteredQuantity &&
                                                            Number(
                                                                item.quantity,
                                                            ) > 0
                                                                ? (Number(
                                                                      item.enteredQuantity,
                                                                  ) *
                                                                      Number(
                                                                          item.deliveredQty,
                                                                      )) /
                                                                  Number(
                                                                      item.quantity,
                                                                  )
                                                                : null,
                                                    })}
                                                </span>
                                            </td>
                                            {!warehouseMode && (
                                                <td className="p-4 text-right">
                                                    {(() => {
                                                        const price =
                                                            getEnteredUnitPriceDisplay(
                                                                {
                                                                    ...item,
                                                                    ...item.productVariant,
                                                                },
                                                            );
                                                        return `${formatRupiah(price.price)}/${price.unit}`;
                                                    })()}
                                                </td>
                                            )}
                                            {!warehouseMode &&
                                                order.items.some(
                                                    (i) =>
                                                        Number(
                                                            i.taxPercent || 0,
                                                        ) > 0 ||
                                                        Number(
                                                            i.taxAmount || 0,
                                                        ) > 0,
                                                ) && (
                                                    <td className="p-4 text-right text-muted-foreground">
                                                        {item.dppOtherAmount
                                                            ? formatRupiah(
                                                                  Number(
                                                                      item.dppOtherAmount,
                                                                  ),
                                                              )
                                                            : '-'}
                                                    </td>
                                                )}
                                            {!warehouseMode && (
                                                <td className="p-4 text-right font-medium">
                                                    {formatRupiah(
                                                        Number(item.subtotal),
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {!warehouseMode && (
                                    <tfoot className="bg-muted/50 border-t">
                                        {Number(order.discountAmount) > 0 && (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="p-2 text-right text-sm text-muted-foreground"
                                                >
                                                    Diskon
                                                </td>
                                                <td className="p-2 text-right text-sm text-red-500">
                                                    -
                                                    {formatRupiah(
                                                        Number(
                                                            order.discountAmount,
                                                        ),
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        {Number(order.taxAmount) > 0 && (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="p-2 text-right text-sm text-muted-foreground"
                                                >
                                                    PPN
                                                    {(() => {
                                                        // Check if any item has INCLUDE mode
                                                        const hasInclude =
                                                            order.items.some(
                                                                (item: {
                                                                    ppnMode?: string;
                                                                }) =>
                                                                    item.ppnMode ===
                                                                    'INCLUDE',
                                                            );
                                                        const hasExclude =
                                                            order.items.some(
                                                                (item: {
                                                                    ppnMode?: string;
                                                                }) =>
                                                                    item.ppnMode ===
                                                                        'EXCLUDE' ||
                                                                    !item.ppnMode,
                                                            );
                                                        if (
                                                            hasInclude &&
                                                            !hasExclude
                                                        ) {
                                                            return (
                                                                <span className="ml-1 text-xs">
                                                                    (Include)
                                                                </span>
                                                            );
                                                        } else if (
                                                            hasInclude &&
                                                            hasExclude
                                                        ) {
                                                            return (
                                                                <span className="ml-1 text-xs">
                                                                    (Campur)
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </td>
                                                <td className="p-2 text-right text-sm">
                                                    {formatRupiah(
                                                        Number(order.taxAmount),
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        {Number(order.shippingCost || 0) >
                                            0 && (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="p-2 text-right text-sm text-muted-foreground"
                                                >
                                                    Ongkos Kirim
                                                    {Array.isArray(
                                                        order.deliveryOrders,
                                                    ) &&
                                                        order.deliveryOrders.some(
                                                            (d) =>
                                                                d.totalCharge !=
                                                                    null &&
                                                                isBillableDeliveryStatus(
                                                                    d.status,
                                                                ),
                                                        ) && (
                                                            <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                                                (dari armada)
                                                            </span>
                                                        )}
                                                </td>
                                                <td className="p-2 text-right text-sm">
                                                    {formatRupiah(
                                                        Number(
                                                            order.shippingCost,
                                                        ),
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="p-4 text-right font-bold"
                                            >
                                                Total Keseluruhan
                                            </td>
                                            <td className="p-4 text-right font-bold text-lg">
                                                {formatRupiah(
                                                    Number(order.totalAmount),
                                                )}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Sidebar Info (Invoices / Movements / Production) */}
                <div className="space-y-6">
                    {/* INVOICES CARD */}
                    {!warehouseMode && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{salesLabels.invoice}</CardTitle>
                                <CardDescription>
                                    Invoice yang diterbitkan untuk order ini
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {order.invoices && order.invoices.length > 0 ? (
                                    <ul className="space-y-4">
                                        {order.invoices.map((inv) => (
                                            <li
                                                key={inv.id}
                                                className="border p-3 rounded-md hover:bg-muted/50 transition-colors"
                                            >
                                                <Link
                                                    href={`/finance/invoices/sales/${inv.id}`}
                                                    className="block"
                                                >
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                                                            {inv.invoiceNumber}
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                inv.status ===
                                                                'PAID'
                                                                    ? 'default'
                                                                    : 'destructive'
                                                            }
                                                        >
                                                            {getStatusLabel(
                                                                inv.status,
                                                                'finance',
                                                            )}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-sm text-muted-foreground mb-1">
                                                        {format(
                                                            new Date(
                                                                inv.invoiceDate,
                                                            ),
                                                            'PP',
                                                        )}
                                                    </div>
                                                    <div className="font-semibold">
                                                        {formatRupiah(
                                                            Number(
                                                                inv.totalAmount,
                                                            ),
                                                        )}
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {salesLabels.emptyInvoices}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <EntityStatusTimeline
                        entityType="SalesOrder"
                        entityId={order.id}
                    />

                    <ProductionStatusCard
                        salesOrderId={order.id}
                        status={order.status}
                        productionOrders={order.productionOrders}
                        items={order.items}
                        currentUserRole={currentUserRole}
                        canPlan={canPlan}
                    />

                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {isMaklonOrder
                                    ? 'Riwayat Penutupan Jasa'
                                    : 'Riwayat Pengiriman'}
                            </CardTitle>
                            <CardDescription>
                                {isMaklonOrder
                                    ? 'Progres penutupan untuk order jasa maklon'
                                    : 'Mutasi stok terkait order ini'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {order.movements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {isMaklonOrder
                                        ? 'Belum ada mutasi stok penutupan jasa yang tercatat dari sales. Konsumsi bahan dilacak dari eksekusi produksi.'
                                        : 'Belum ada pengiriman.'}
                                </p>
                            ) : (
                                <ul className="space-y-4">
                                    {order.movements.map((m) => (
                                        <li
                                            key={m.id}
                                            className="text-sm border-l-2 border-purple-200 dark:border-purple-800/50 pl-4 py-1"
                                        >
                                            <div className="font-medium">
                                                {isMaklonOrder
                                                    ? `Recorded sales shipment movement ${Number(m.quantity)} units`
                                                    : `Shipped ${Number(m.quantity)} units`}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {format(
                                                    new Date(m.createdAt),
                                                    'PP p',
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            {/* MRP Simulation Dialog */}

            <ShipmentDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                isMaklon={isMaklonOrder}
                isOpen={isShipDialogOpen}
                onClose={() => setIsShipDialogOpen(false)}
                openDeliveryOrder={
                    primaryOpenDo
                        ? {
                              id: primaryOpenDo.id,
                              orderNumber:
                                  primaryOpenDo.orderNumber ??
                                  primaryOpenDo.id.slice(0, 8),
                              status: primaryOpenDo.status,
                          }
                        : null
                }
            />

            <Dialog
                open={isFollowUpDialogOpen}
                onOpenChange={(open) => {
                    if (!open) setIsFollowUpDialogOpen(false);
                }}
            >
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarClock className="h-5 w-5" />
                            Jadwalkan Follow-up
                        </DialogTitle>
                        <DialogDescription>
                            Atur tanggal follow-up untuk {order.orderNumber}.
                            Kosongkan untuk hapus jadwal.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="followUpDate">
                                Tanggal follow-up
                            </Label>
                            <Input
                                id="followUpDate"
                                type="date"
                                value={followUpDateInput}
                                onChange={(e) =>
                                    setFollowUpDateInput(e.target.value)
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setFollowUpDateInput('');
                                setIsFollowUpDialogOpen(false);
                            }}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="outline"
                            disabled={isLoading}
                            onClick={async () => {
                                setIsLoading(true);
                                try {
                                    const res = await updateFollowUpDateAction(
                                        order.id,
                                        null,
                                    );
                                    if (res.success) {
                                        toast.success(
                                            'Jadwal follow-up dihapus.',
                                        );
                                        setFollowUpDateInput('');
                                        setIsFollowUpDialogOpen(false);
                                        router.refresh();
                                    } else {
                                        toast.error(
                                            res.error ||
                                                'Gagal menghapus jadwal.',
                                        );
                                    }
                                } catch {
                                    toast.error(
                                        'Gagal menghapus jadwal follow-up.',
                                    );
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                        >
                            Hapus jadwal
                        </Button>
                        <Button
                            disabled={isLoading}
                            onClick={async () => {
                                if (!followUpDateInput) {
                                    toast.error(
                                        'Pilih tanggal follow-up terlebih dahulu.',
                                    );
                                    return;
                                }
                                setIsLoading(true);
                                try {
                                    const iso = new Date(
                                        followUpDateInput,
                                    ).toISOString();
                                    const res = await updateFollowUpDateAction(
                                        order.id,
                                        iso,
                                    );
                                    if (res.success) {
                                        toast.success(
                                            'Jadwal follow-up disimpan.',
                                        );
                                        setIsFollowUpDialogOpen(false);
                                        router.refresh();
                                    } else {
                                        toast.error(
                                            res.error ||
                                                'Gagal menyimpan jadwal.',
                                        );
                                    }
                                } catch {
                                    toast.error(
                                        'Gagal menyimpan jadwal follow-up.',
                                    );
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                        >
                            Simpan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={isRejectDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsRejectDialogOpen(false);
                    }
                }}
            >
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Tolak penawaran</DialogTitle>
                        <DialogDescription>
                            Pilih alasan penolakan untuk {order.orderNumber}.
                            Alasan wajib diisi.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="lostReason">Alasan kalah *</Label>
                            <Select
                                value={lostReasonValue}
                                onValueChange={setLostReasonValue}
                            >
                                <SelectTrigger id="lostReason">
                                    <SelectValue placeholder="Pilih alasan" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SALES_LOST_REASON_OPTIONS.map((opt) => (
                                        <SelectItem
                                            key={opt.value}
                                            value={opt.value}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="lostReasonNotes">
                                Catatan
                                {lostReasonValue === 'LAINNYA'
                                    ? ' *'
                                    : ' (opsional)'}
                            </Label>
                            <Textarea
                                id="lostReasonNotes"
                                value={lostReasonNotes}
                                onChange={(e) =>
                                    setLostReasonNotes(e.target.value)
                                }
                                placeholder={
                                    lostReasonValue === 'LAINNYA'
                                        ? 'Jelaskan alasan lainnya (wajib)'
                                        : 'Catatan tambahan (opsional)'
                                }
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsRejectDialogOpen(false);
                            }}
                            disabled={isLoading}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={
                                isLoading ||
                                !lostReasonValue ||
                                (lostReasonValue === 'LAINNYA' &&
                                    !lostReasonNotes.trim())
                            }
                            onClick={async () => {
                                if (!lostReasonValue) {
                                    toast.error('Alasan kalah wajib dipilih.');
                                    return;
                                }
                                if (
                                    lostReasonValue === 'LAINNYA' &&
                                    !lostReasonNotes.trim()
                                ) {
                                    toast.error(
                                        'Catatan wajib diisi untuk alasan Lainnya.',
                                    );
                                    return;
                                }
                                setIsLoading(true);
                                try {
                                    const res = await rejectQuotationOrder(
                                        order.id,
                                        lostReasonValue as SalesLostReason,
                                        lostReasonNotes.trim()
                                            ? lostReasonNotes.trim()
                                            : undefined,
                                    );
                                    if (res.success) {
                                        toast.success(
                                            `Penawaran ${order.orderNumber} ditolak.`,
                                        );
                                        setIsRejectDialogOpen(false);
                                        setLostReasonValue('');
                                        setLostReasonNotes('');
                                        router.refresh();
                                    } else {
                                        toast.error(
                                            res.error ||
                                                'Gagal menolak penawaran.',
                                        );
                                    }
                                } catch {
                                    toast.error(
                                        'Gagal menolak penawaran. Coba lagi.',
                                    );
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                        >
                            Tolak penawaran
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
