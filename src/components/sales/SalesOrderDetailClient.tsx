'use client';

import { OrderInfoCard } from './order-detail/OrderInfoCard';
import { OrderSidebar } from './order-detail/OrderSidebar';
import { InvoiceDialog } from './order-detail/InvoiceDialog';
import { FollowUpDialog } from './order-detail/FollowUpDialog';
import { RejectQuotationDialog } from './order-detail/RejectQuotationDialog';

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
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
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
import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ShipmentDialog } from './ShipmentDialog';
import { CreateDeliveryOrderDialog } from './CreateDeliveryOrderDialog';
import { AddToScheduleDialog } from './AddToScheduleDialog';
import { calculateDueDate } from '@/lib/finance/payment-terms';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SalesMetricInfo } from '@/components/sales/SalesMetricInfo';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SalesOrderDetailClientProps } from './sales-order-types';
import { CalendarClock } from 'lucide-react';

export function SalesOrderDetailClient({
    order,
    basePath = '/sales/orders',
    warehouseMode = false,
    currentUserRole,
    canPlan,
}: SalesOrderDetailClientProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [confirmation, setConfirmation] = useState<
        'cancel' | 'delete' | null
    >(null);
    const moreActionsRef = useRef<HTMLButtonElement>(null);
    const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
    const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
    const [invoiceDate, setInvoiceDate] = useState(() =>
        new Date().toISOString().slice(0, 10),
    );
    const [termDays, setTermDays] = useState<number>(
        () => order.customer?.paymentTermDays ?? 30,
    );
    const [customTermDays, setCustomTermDays] = useState<string>('');
    const [useManualDue, setUseManualDue] = useState(false);
    const [manualDueDate, setManualDueDate] = useState('');

    const computedDueDate = useMemo(() => {
        if (useManualDue && manualDueDate) return new Date(manualDueDate);
        const inv = invoiceDate ? new Date(invoiceDate) : new Date();
        const t =
            termDays === -1
                ? parseInt(customTermDays || '0', 10) || 0
                : termDays;
        return calculateDueDate(inv, t);
    }, [invoiceDate, termDays, customTermDays, useManualDue, manualDueDate]);
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

    const showQuickShip =
        !warehouseMode &&
        (order.status === 'CONFIRMED' ||
            order.status === 'READY_TO_SHIP' ||
            (order.status === 'IN_PRODUCTION' && !!primaryOpenDo));
    const showCancel =
        !warehouseMode &&
        ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(
            order.status,
        );
    const showDelete = !warehouseMode && order.status === 'DRAFT';

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
            const invDate = invoiceDate ? new Date(invoiceDate) : new Date();
            const finalTerm =
                termDays === -1
                    ? parseInt(customTermDays || '0', 10) || 0
                    : termDays;

            const payload: {
                salesOrderId: string;
                invoiceDate: Date;
                termOfPaymentDays: number;
                notes: string;
                dueDate?: Date;
            } = {
                salesOrderId: order.id,
                invoiceDate: invDate,
                termOfPaymentDays: finalTerm,
                notes: `Invoice for Order ${order.orderNumber}`,
            };

            if (useManualDue && manualDueDate) {
                payload.dueDate = new Date(manualDueDate);
            } else if (finalTerm !== (order.customer?.paymentTermDays ?? 30)) {
                // Send computed dueDate so explicit user choice is preserved
                payload.dueDate = computedDueDate;
            }

            const result = await createInvoice(payload);

            if (result.success) {
                toast.success(
                    `Invoice berhasil dibuat. Jatuh tempo: ${format(computedDueDate, 'dd MMM yyyy')}`,
                );
                setInvoiceDialogOpen(false);
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

    const handleClearFollowUp = async () => {
        setIsLoading(true);
        try {
            const res = await updateFollowUpDateAction(order.id, null);
            if (res.success) {
                toast.success('Jadwal follow-up dihapus.');
                setFollowUpDateInput('');
                setIsFollowUpDialogOpen(false);
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal menghapus jadwal.');
            }
        } catch {
            toast.error('Gagal menghapus jadwal follow-up.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveFollowUp = async () => {
        if (!followUpDateInput) {
            toast.error('Pilih tanggal follow-up terlebih dahulu.');
            return;
        }
        setIsLoading(true);
        try {
            const iso = new Date(followUpDateInput).toISOString();
            const res = await updateFollowUpDateAction(order.id, iso);
            if (res.success) {
                toast.success('Jadwal follow-up disimpan.');
                setIsFollowUpDialogOpen(false);
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal menyimpan jadwal.');
            }
        } catch {
            toast.error('Gagal menyimpan jadwal follow-up.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRejectQuotation = async () => {
        if (!lostReasonValue) {
            toast.error('Alasan kalah wajib dipilih.');
            return;
        }
        if (lostReasonValue === 'LAINNYA' && !lostReasonNotes.trim()) {
            toast.error('Catatan wajib diisi untuk alasan Lainnya.');
            return;
        }
        setIsLoading(true);
        try {
            const res = await rejectQuotationOrder(
                order.id,
                lostReasonValue as SalesLostReason,
                lostReasonNotes.trim() ? lostReasonNotes.trim() : undefined,
            );
            if (res.success) {
                toast.success(`Penawaran ${order.orderNumber} ditolak.`);
                setIsRejectDialogOpen(false);
                setLostReasonValue('');
                setLostReasonNotes('');
                router.refresh();
            } else {
                toast.error(res.error || 'Gagal menolak penawaran.');
            }
        } catch {
            toast.error('Gagal menolak penawaran. Coba lagi.');
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
                    <AlertTitle className="flex items-center justify-between gap-2">
                        Alur Maklon Jasa
                        <SalesMetricInfo label="Info alur maklon jasa">
                            Bahan titipan customer dikonsumsi saat production
                            execution, dari lokasi produksi lebih dulu lalu
                            lokasi customer-owned bila diperlukan.
                        </SalesMetricInfo>
                    </AlertTitle>
                    <AlertDescription>
                        Menagihkan jasa, bukan pengiriman stok fisik dari SO.
                    </AlertDescription>
                </Alert>
            )}

            {/* Identity gets the full width; actions must never squeeze the order number. */}
            <header className="min-w-0 space-y-4">
                <div className="space-y-3">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={basePath}>
                            <ArrowLeft className="mr-2 h-4 w-4" />{' '}
                            {actionLabels.back}
                        </Link>
                    </Button>
                    <div className="min-w-0 space-y-2">
                        <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
                            {order.orderNumber}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2">
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
                            <p className="w-full text-sm text-muted-foreground sm:w-auto">
                                {formLabels.createdOn}{' '}
                                {format(new Date(order.orderDate), 'd MMMM yyyy', {
                                    locale: id,
                                })}
                            </p>
                        </div>
                    </div>
                </div>

                <div
                    role="group"
                    aria-label="Aksi pesanan"
                    className="grid grid-cols-2 gap-2 border-t pt-4 sm:flex sm:flex-wrap sm:items-center [&_button]:min-h-11 [&_a]:min-h-11 [&_button]:max-w-full [&_a]:max-w-full [&_button]:whitespace-normal [&_a]:whitespace-normal [&_button]:h-auto [&_a]:h-auto"
                >
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

                    {!warehouseMode && order.status === 'DRAFT' && (
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
                                        const warnings = result?.warnings ?? [];
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
                                variant={
                                    order.status === 'IN_PRODUCTION'
                                        ? 'outline'
                                        : 'default'
                                }
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
                                        triggerVariant={
                                            order.status === 'IN_PRODUCTION'
                                                ? 'outline'
                                                : 'default'
                                        }
                                    />
                                    <AddToScheduleDialog
                                        salesOrderId={order.id}
                                    />
                                </>
                            )
                        ))}

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
                                <>
                                    <Button
                                        onClick={() => {
                                            setTermDays(
                                                order.customer
                                                    ?.paymentTermDays ?? 30,
                                            );
                                            setInvoiceDate(
                                                new Date()
                                                    .toISOString()
                                                    .slice(0, 10),
                                            );
                                            setUseManualDue(false);
                                            setManualDueDate('');
                                            setCustomTermDays('');
                                            setInvoiceDialogOpen(true);
                                        }}
                                        disabled={
                                            isLoading || isLegacyInternalOrder
                                        }
                                        className="bg-sky-600 hover:bg-sky-700 text-white"
                                    >
                                        <Receipt className="mr-2 h-4 w-4" /> Buat
                                        Invoice
                                    </Button>

                                    <InvoiceDialog
                                        order={order}
                                        invoiceDialogOpen={invoiceDialogOpen}
                                        setInvoiceDialogOpen={setInvoiceDialogOpen}
                                        invoiceDate={invoiceDate}
                                        setInvoiceDate={setInvoiceDate}
                                        termDays={termDays}
                                        setTermDays={setTermDays}
                                        customTermDays={customTermDays}
                                        setCustomTermDays={setCustomTermDays}
                                        useManualDue={useManualDue}
                                        setUseManualDue={setUseManualDue}
                                        manualDueDate={manualDueDate}
                                        setManualDueDate={setManualDueDate}
                                        computedDueDate={computedDueDate}
                                        isLoading={isLoading}
                                        handleGenerateInvoice={handleGenerateInvoice}
                                    />
                                </>
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
                            'QUOTATION', 'QUOTATION_SENT', 'DRAFT', 'CONFIRMED',
                            'IN_PRODUCTION', 'READY_TO_SHIP',
                        ].includes(order.status) && (
                            <Button variant="outline" asChild>
                                <Link href={`${basePath}/${order.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    {actionLabels.edit}
                                </Link>
                            </Button>
                        )}

                    {(showQuickShip || showCancel || showDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    ref={moreActionsRef}
                                    variant="outline"
                                    disabled={isLoading}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                    Lainnya
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="max-w-[calc(100vw-2rem)]"
                                onCloseAutoFocus={(event) => {
                                    if (confirmation || isShipDialogOpen) {
                                        event.preventDefault();
                                    }
                                }}
                            >
                                {showQuickShip && (
                                    <DropdownMenuItem
                                        className="min-h-11"
                                        disabled={openDeliveryOrders.length > 1}
                                        title={
                                            openDeliveryOrders.length > 1
                                                ? salesLabels.selectDoToShip
                                                : undefined
                                        }
                                        onSelect={() => setIsShipDialogOpen(true)}
                                    >
                                        <Truck className="h-4 w-4" />
                                        {isMaklonOrder
                                            ? 'Tutup Order Jasa'
                                            : primaryOpenDo
                                              ? `Kirim SJ cepat (${primaryOpenDo.orderNumber ?? 'SJ'}) — lanjutan`
                                              : 'Buat SJ + Kirim Cepat (lanjutan)'}
                                    </DropdownMenuItem>
                                )}
                                {showQuickShip && (showCancel || showDelete) && (
                                    <DropdownMenuSeparator />
                                )}
                                {showCancel && (
                                    <DropdownMenuItem
                                        className="min-h-11"
                                        variant="destructive"
                                        onSelect={() => setConfirmation('cancel')}
                                    >
                                        <XCircle className="h-4 w-4" />
                                        Batalkan pesanan
                                    </DropdownMenuItem>
                                )}
                                {showDelete && (
                                    <DropdownMenuItem
                                        className="min-h-11"
                                        variant="destructive"
                                        onSelect={() => setConfirmation('delete')}
                                    >
                                        Hapus draf
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
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
            </header>

            <AlertDialog
                open={confirmation !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmation(null);
                }}
            >
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        moreActionsRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmation === 'delete'
                                ? 'Hapus draf pesanan?'
                                : 'Batalkan pesanan?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmation === 'delete'
                                ? `Draf ${order.orderNumber} akan dihapus secara permanen. Aksi ini tidak dapat dibatalkan.`
                                : `Pesanan ${order.orderNumber} akan dibatalkan. Pastikan pesanan ini memang tidak akan dilanjutkan.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Kembali</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isLoading}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() =>
                                confirmation === 'delete'
                                    ? handleDelete()
                                    : handleAction('cancelled', cancelSalesOrder)
                            }
                        >
                            {confirmation === 'delete' ? 'Hapus draf' : 'Batalkan pesanan'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Shipping guidance stays below the order identity and actions. */}
            {!isLegacyInternalOrder &&
                !isMaklonOrder &&
                !warehouseMode &&
                ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'].includes(
                    order.status,
                ) && (
                    <div className="flex flex-col gap-x-3 gap-y-1 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center dark:border-blue-800/50 dark:bg-blue-900/20">
                        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
                            <Truck className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                            <p>Siapkan Jadwal Kirim atau Surat Jalan.</p>
                            <SalesMetricInfo label="Info alur kirim">
                                Gunakan Jadwal Kirim untuk rute harian multi-toko,
                                atau Buat Surat Jalan untuk satu SO hot-load.
                                Muat, verifikasi, dan tandai dikirim dilakukan
                                di Portal Gudang.
                            </SalesMetricInfo>
                        </div>
                        <Link
                            href="/warehouse/outgoing"
                            className="inline-flex min-h-11 shrink-0 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            Buka Portal Gudang →
                        </Link>
                    </div>
                )}

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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Main Order Info */}
                <OrderInfoCard
                    order={order}
                    warehouseMode={warehouseMode}
                    customerLabel={customerLabel}
                    isLegacyInternalOrder={isLegacyInternalOrder}
                    isMaklonOrder={isMaklonOrder}
                    followUpDate={followUpDate}
                    isFollowUpOverdue={isFollowUpOverdue}
                />

                {/* Sidebar Info (Invoices / Movements / Production) */}
                <OrderSidebar
                    order={order}
                    warehouseMode={warehouseMode}
                    isMaklonOrder={isMaklonOrder}
                    currentUserRole={currentUserRole}
                    canPlan={canPlan}
                />
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

            <FollowUpDialog
                order={order}
                isFollowUpDialogOpen={isFollowUpDialogOpen}
                setIsFollowUpDialogOpen={setIsFollowUpDialogOpen}
                followUpDateInput={followUpDateInput}
                setFollowUpDateInput={setFollowUpDateInput}
                isLoading={isLoading}
                handleClearFollowUp={handleClearFollowUp}
                handleSaveFollowUp={handleSaveFollowUp}
            />

            <RejectQuotationDialog
                order={order}
                isRejectDialogOpen={isRejectDialogOpen}
                setIsRejectDialogOpen={setIsRejectDialogOpen}
                lostReasonValue={lostReasonValue}
                setLostReasonValue={setLostReasonValue}
                lostReasonNotes={lostReasonNotes}
                setLostReasonNotes={setLostReasonNotes}
                isLoading={isLoading}
                handleRejectQuotation={handleRejectQuotation}
            />
        </div>
    );
}
